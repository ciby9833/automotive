import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { randomUUID } from 'crypto';

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

  constructor(private readonly configService: ConfigService) {
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
  ): Promise<{ key: string; url: string }> {
    const ext = originalName.includes('.') ? originalName.split('.').pop() : '';
    const key = `${randomUUID()}${ext ? '.' + ext : ''}`;
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
    return { key, url: this.getUrl(key) };
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
        (stat.metaData as Record<string, string> | undefined)?.['content-type'] ??
        'application/octet-stream',
    };
  }
}
