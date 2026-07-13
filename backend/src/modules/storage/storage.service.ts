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
    return { key, url: await this.getUrl(key) };
  }

  async getUrl(key: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, 24 * 60 * 60);
  }
}
