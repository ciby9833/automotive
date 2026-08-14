import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { StorageService } from '../storage/storage.service';
import { PublishAppReleaseDto } from './dto/publish-app-release.dto';
import { ApkMetadataService } from './apk-metadata.service';
import {
  AppPlatform,
  AppRelease,
  AppReleaseStatus,
} from './entities/app-release.entity';

@Injectable()
export class AppReleasesService {
  constructor(
    @InjectRepository(AppRelease)
    private readonly repository: Repository<AppRelease>,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly apkMetadataService: ApkMetadataService,
  ) {}

  async publish(
    dto: PublishAppReleaseDto,
    file: Express.Multer.File | undefined,
    userId: string,
  ) {
    this.validateApk(file);
    const upload = file!;
    const platform = dto.platform ?? AppPlatform.ANDROID;
    const metadata = await this.apkMetadataService.inspect(upload.buffer);
    await this.validatePackageName(platform, metadata.packageName);
    if (
      dto.minimumSupportedVersionCode !== undefined &&
      dto.minimumSupportedVersionCode > metadata.versionCode
    ) {
      throw new BadRequestException({
        code: 'APP_RELEASE_INVALID_MINIMUM_VERSION',
        message: '最低支持版本号不能大于本次内部版本号',
      });
    }
    const existing = await this.repository.findOne({
      where: { platform, versionCode: metadata.versionCode },
    });
    if (existing) {
      throw new ConflictException({
        code: 'APP_RELEASE_VERSION_CODE_EXISTS',
        message: `版本号 ${metadata.versionCode} 已存在`,
      });
    }

    const stored = await this.storageService.upload(
      upload.buffer,
      upload.originalname,
      'application/vnd.android.package-archive',
    );
    try {
      const release = await this.dataSource.transaction(async (manager) => {
        // 同一平台的发布串行化，避免并发上传时短暂出现两个正式版本。
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `app-release:${platform}`,
        ]);
        await this.validatePackageName(
          platform,
          metadata.packageName,
          manager.getRepository(AppRelease),
        );
        await manager.update(
          AppRelease,
          { platform, status: AppReleaseStatus.PUBLISHED },
          { status: AppReleaseStatus.ARCHIVED },
        );
        return manager.save(
          manager.create(AppRelease, {
            platform,
            versionName: metadata.versionName,
            versionCode: metadata.versionCode,
            releaseNotes: dto.releaseNotes?.trim() || null,
            minimumSupportedVersionCode:
              dto.minimumSupportedVersionCode ?? null,
            forceUpdate: dto.forceUpdate ?? false,
            status: AppReleaseStatus.PUBLISHED,
            fileKey: stored.key,
            originalFilename: upload.originalname,
            mimeType: 'application/vnd.android.package-archive',
            fileSize: String(upload.size),
            sha256: createHash('sha256').update(upload.buffer).digest('hex'),
            packageName: metadata.packageName,
            minSdkVersion: metadata.minSdkVersion,
            targetSdkVersion: metadata.targetSdkVersion,
            downloadCount: '0',
            publishedAt: new Date(),
            publishedById: userId,
          }),
        );
      });
      return this.toResponse(release);
    } catch (error) {
      await this.storageService.deleteObject(stored.key).catch(() => undefined);
      const databaseError = error as { code?: unknown };
      if (databaseError.code === '23505') {
        throw new ConflictException({
          code: 'APP_RELEASE_VERSION_CODE_EXISTS',
          message: `版本号 ${metadata.versionCode} 已存在`,
        });
      }
      throw error;
    }
  }

  async list() {
    const releases = await this.repository.find({
      relations: { publishedBy: true, invalidatedBy: true },
      order: { publishedAt: 'DESC' },
    });
    return releases.map((release) => this.toResponse(release, true));
  }

  async latest(platform = AppPlatform.ANDROID) {
    const release = await this.repository.findOne({
      where: { platform, status: AppReleaseStatus.PUBLISHED },
      relations: { publishedBy: true },
      order: { publishedAt: 'DESC' },
    });
    return release ? this.toResponse(release) : null;
  }

  async getDownload(id: string) {
    const release = await this.repository.findOne({ where: { id } });
    if (!release) {
      throw new NotFoundException({
        code: 'APP_RELEASE_NOT_FOUND',
        message: 'App 版本不存在',
      });
    }
    if (release.status === AppReleaseStatus.INVALIDATED) {
      throw new GoneException({
        code: 'APP_RELEASE_INVALIDATED',
        message: '该 App 版本已失效，不能继续下载',
      });
    }
    const object = await this.storageService.getObjectStream(release.fileKey);
    await this.repository.increment({ id }, 'downloadCount', 1);
    return {
      release,
      object,
      filename: this.downloadFilename(release),
    };
  }

  async invalidate(id: string, userId: string) {
    return this.dataSource.transaction(async (manager) => {
      const release = await manager.findOne(AppRelease, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!release) {
        throw new NotFoundException({
          code: 'APP_RELEASE_NOT_FOUND',
          message: 'App 版本不存在',
        });
      }
      if (release.status === AppReleaseStatus.INVALIDATED) {
        return this.toResponse(release);
      }
      release.status = AppReleaseStatus.INVALIDATED;
      release.invalidatedAt = new Date();
      release.invalidatedById = userId;
      return this.toResponse(await manager.save(release));
    });
  }

  private validateApk(file: Express.Multer.File | undefined): void {
    if (!file) {
      throw new BadRequestException({
        code: 'APP_RELEASE_FILE_REQUIRED',
        message: '请选择 APK 文件',
      });
    }
    const maxUploadMb = this.configService.get<number>(
      'appRelease.maxUploadMb',
      300,
    );
    if (file.size > maxUploadMb * 1024 * 1024) {
      throw new BadRequestException({
        code: 'APP_RELEASE_FILE_TOO_LARGE',
        message: `APK 不能超过 ${maxUploadMb} MB`,
      });
    }
    if (!file.originalname.toLowerCase().endsWith('.apk')) {
      throw new BadRequestException({
        code: 'APP_RELEASE_INVALID_FILE_TYPE',
        message: '仅支持 APK 文件',
      });
    }
    const signature = file.buffer.subarray(0, 4).toString('hex');
    const hasAndroidManifest = file.buffer.includes(
      Buffer.from('AndroidManifest.xml'),
    );
    if (
      !['504b0304', '504b0506', '504b0708'].includes(signature) ||
      !hasAndroidManifest
    ) {
      throw new BadRequestException({
        code: 'APP_RELEASE_INVALID_APK',
        message: '文件不是有效的 Android APK 格式',
      });
    }
  }

  private toResponse(release: AppRelease, includePublisher = false) {
    return {
      id: release.id,
      platform: release.platform,
      versionName: release.versionName,
      versionCode: release.versionCode,
      releaseNotes: release.releaseNotes,
      minimumSupportedVersionCode: release.minimumSupportedVersionCode,
      forceUpdate: release.forceUpdate,
      status: release.status,
      fileSize: Number(release.fileSize),
      sha256: release.sha256,
      packageName: release.packageName,
      minSdkVersion: release.minSdkVersion,
      targetSdkVersion: release.targetSdkVersion,
      downloadCount: Number(release.downloadCount),
      publishedAt: release.publishedAt,
      invalidatedAt: release.invalidatedAt,
      downloadPath: `/app-releases/${release.id}/download`,
      ...(includePublisher
        ? {
            publishedBy: release.publishedBy
              ? {
                  id: release.publishedBy.id,
                  displayName: release.publishedBy.displayName,
                }
              : null,
            invalidatedBy: release.invalidatedBy
              ? {
                  id: release.invalidatedBy.id,
                  displayName: release.invalidatedBy.displayName,
                }
              : null,
          }
        : {}),
    };
  }

  private downloadFilename(release: AppRelease): string {
    const version = release.versionName.replace(/[^a-zA-Z0-9._-]/g, '-');
    return `automotive-alms-${version}.apk`;
  }

  private async validatePackageName(
    platform: AppPlatform,
    packageName: string,
    repository: Repository<AppRelease> = this.repository,
  ): Promise<void> {
    const configuredPackage = this.configService
      .get<string>('appRelease.androidPackageName', '')
      .trim();
    const previous = await repository.findOne({
      where: { platform },
      order: { publishedAt: 'DESC' },
    });
    const expectedPackage = configuredPackage || previous?.packageName;
    if (expectedPackage && expectedPackage !== packageName) {
      throw new BadRequestException({
        code: 'APP_RELEASE_PACKAGE_MISMATCH',
        message: `APK 包名 ${packageName} 与系统 App 包名 ${expectedPackage} 不一致`,
      });
    }
  }
}
