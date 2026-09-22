import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { ScopeService } from '../../common/scope/scope.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { Role } from '../../common/enums/role.enum';
import { Permission } from '../../common/enums/permission.enum';

interface StorageConfig {
  driver: string;
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

// 文件存储抽象层：本地/自建用 MinIO，生产可切换到 S3/OSS（三者都兼容S3协议，
// 上层业务代码只依赖 upload()/getUrl()，不关心具体供应商，切换时不用改业务代码
@Injectable()
export class StorageService implements OnModuleInit {
  private client: MinioClient;
  private bucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DataSource,
    private readonly scopes: ScopeService,
    private readonly jwt: JwtService,
  ) {
    const cfg = this.configService.get<StorageConfig>('storage')!;
    this.bucket = cfg.bucket;
    this.client = new MinioClient({
      endPoint: cfg.endPoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });
  }

  async onModuleInit() {
    const exists = await this.client
      .bucketExists(this.bucket)
      .catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket).catch(() => undefined);
    }
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    user?: AuthenticatedUser,
  ): Promise<{ key: string; url: string }> {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : '';
    const key = `${randomUUID()}${ext ? '.' + ext : ''}`;
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
      ...(user
        ? {
            'uploader-id': user.userId,
            'upload-org-id': user.activeOrgId ?? '',
          }
        : {}),
    });
    return { key, url: this.getUrl(key) };
  }

  private key(value: string): string {
    const key = decodeURIComponent(value.split('?')[0].split('/').pop() ?? '');
    if (!/^[0-9a-f-]{36}(\.[a-zA-Z0-9]+)?$/.test(key))
      throw new ForbiddenException('无效附件');
    return key;
  }

  async signedUrls(
    values: string[],
    user: AuthenticatedUser,
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const value of new Set(values)) {
      const key = this.key(value);
      await this.assertReadable(key, user);
      const token = this.jwt.sign(
        { key, sub: user.userId, activeOrgId: user.activeOrgId },
        {
          secret:
            this.configService.get<string>('jwt.secret') + ':file-preview',
          expiresIn: '15m',
        },
      );
      result[value] = `${this.getUrl(key)}?token=${encodeURIComponent(token)}`;
    }
    return result;
  }

  async authorizePreview(key: string, token?: string): Promise<void> {
    if (!token) throw new UnauthorizedException('附件需要授权链接');
    let claims: { key: string; sub: string; activeOrgId: string | null };
    try {
      claims = this.jwt.verify(token, {
        secret: this.configService.get<string>('jwt.secret') + ':file-preview',
      });
    } catch {
      throw new UnauthorizedException('附件授权已失效，请重新打开');
    }
    if (claims.key !== this.key(key))
      throw new ForbiddenException('附件授权不匹配');
    const user = await this.scopes.authenticate({
      sub: claims.sub,
      activeOrgId: claims.activeOrgId,
      username: '',
      role: Role.ORG_ADMIN,
      preAuth: false,
      scopeYardId: null,
      carrierId: null,
      customerId: null,
    });
    await this.assertReadable(key, user);
  }

  private async assertReadable(
    key: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const scope = await this.scopes.resolve(user);
    const granted = new Set(user.permissions ?? []);
    const stat = await this.client
      .statObject(this.bucket, key)
      .catch(() => null);
    if (!stat) throw new ForbiddenException('附件不存在或无权访问');
    const meta = stat.metaData as Record<string, string>;
    if (
      meta['uploader-id'] === user.userId &&
      (granted.has(Permission.FILE_UPLOAD) ||
        granted.has(Permission.TRANSPORT_EXECUTE)) &&
      (scope.type !== 'ORG' || meta['upload-org-id'] === scope.activeOrgId)
    )
      return;
    // 附件必须由当前有权查询的业务记录引用；单凭随机 key 不授予权限。
    const refs: Array<{
      org: string;
      yard: string | null;
      carrier: string | null;
      customer: string | null;
      permission: Permission;
    }> = await this.db.query(
      `
      SELECT o.organization_id org, o.destination_yard_id yard, o.pickup_carrier_id carrier, o.customer_id customer, 'inbound:view' permission
      FROM order_vins v JOIN orders o ON o.id=v.order_id
      WHERE $1=ANY(COALESCE(v.arrival_photo_urls,'{}') || COALESCE(v.pickup_photo_urls,'{}'))
      UNION ALL
      SELECT w.organization_id, w.origin_yard_id, w.carrier_id, o.customer_id, 'waybill:view'
      FROM waybill_vins v JOIN waybills w ON w.id=v.waybill_id LEFT JOIN orders o ON o.id=w.order_id
      WHERE $1=ANY(COALESCE(v.load_photo_keys,'{}'))
      UNION ALL
      SELECT COALESCE(w.organization_id,o.organization_id,y.organization_id), l.yard_id,
        COALESCE(w.carrier_id,o.pickup_carrier_id), o.customer_id, 'tracking:view'
      FROM operation_logs l LEFT JOIN waybills w ON w.id=l.waybill_id
      LEFT JOIN orders o ON o.id=COALESCE(l.order_id,w.order_id) LEFT JOIN yards y ON y.id=l.yard_id
      WHERE $1=ANY(COALESCE(l.attachment_urls,'{}'))
      UNION ALL
      SELECT w.organization_id, COALESCE(l.yard_id,w.origin_yard_id), w.carrier_id, o.customer_id, 'waybill:view'
      FROM waybill_status_logs l JOIN waybills w ON w.id=l.waybill_id LEFT JOIN orders o ON o.id=w.order_id
      WHERE $1=ANY(COALESCE(l."attachmentUrls",'{}'))
      UNION ALL
      SELECT l.organization_id, NULL::uuid, l.carrier_id, l.customer_id, 'transport:view'
      FROM transport_lines l WHERE l.pickup_photos @> to_jsonb(ARRAY[$1::text]) OR l.delivery_photos @> to_jsonb(ARRAY[$1::text])
      UNION ALL
      SELECT l.organization_id, NULL::uuid, t.carrier_id, l.customer_id, 'transport:view'
      FROM transport_documents d JOIN transport_trips t ON t.id=d.trip_id
      JOIN transport_lines l ON l.trip_id=t.id AND l.origin_id=d.origin_id AND l.destination_id=d.destination_id
      WHERE d.file_key=$1
      UNION ALL
      SELECT e.organization_id, NULL::uuid, t.carrier_id, l.customer_id, 'transport:view'
      FROM transport_exceptions e JOIN transport_trips t ON t.id=e.trip_id
      LEFT JOIN transport_lines l ON l.id=e.line_id
      WHERE e.photos @> to_jsonb(ARRAY[$1::text])`,
      [key],
    );
    if (
      refs.some(
        (r) =>
          (granted.has(r.permission) ||
            (r.permission === Permission.INBOUND_VIEW &&
              granted.has(Permission.PICKUP_VIEW))) &&
          (scope.type === 'ORG'
            ? scope.orgIds.includes(r.org) &&
              (scope.role !== Role.YARD_STAFF || r.yard === scope.scopeYardId)
            : scope.type === 'CARRIER'
              ? r.carrier === scope.carrierId
              : r.customer === scope.customerId),
      )
    )
      return;
    throw new ForbiddenException('无权访问此业务附件');
  }

  // 返回后端相对 URL 而非 MinIO 直连签名 URL
  // 原因：生产环境 MinIO 绑 127.0.0.1，浏览器直连不通；改由后端流转发，nginx 反代天然生效
  // 前端拿到相对路径后拼上 API baseURL 塞进 <img src>
  getUrl(key: string): string {
    return `/storage/preview/${encodeURIComponent(key)}`;
  }

  // 流式下载单个对象：给 /storage/preview/:key 用；同时返回内容类型 + 大小以便设 header
  async getObjectStream(key: string): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    contentType: string;
  }> {
    const stat = await this.client.statObject(this.bucket, key);
    const stream = await this.client.getObject(this.bucket, key);
    return {
      stream,
      size: stat.size,
      contentType:
        (stat.metaData as Record<string, string> | undefined)?.[
          'content-type'
        ] ?? 'application/octet-stream',
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}
