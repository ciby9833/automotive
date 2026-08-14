import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

export enum AppPlatform {
  ANDROID = 'ANDROID',
}

export enum AppReleaseStatus {
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  INVALIDATED = 'INVALIDATED',
}

@Entity('app_releases')
@Index(['platform', 'versionCode'], { unique: true })
@Index(['platform', 'status', 'publishedAt'])
export class AppRelease extends BaseEntity {
  @Column({ type: 'enum', enum: AppPlatform })
  platform: AppPlatform;

  @Column({ name: 'version_name', length: 50 })
  versionName: string;

  @Column({ name: 'version_code', type: 'integer' })
  versionCode: number;

  @Column({ name: 'release_notes', type: 'text', nullable: true })
  releaseNotes: string | null;

  @Column({
    name: 'minimum_supported_version_code',
    type: 'integer',
    nullable: true,
  })
  minimumSupportedVersionCode: number | null;

  @Column({ name: 'force_update', default: false })
  forceUpdate: boolean;

  @Column({ type: 'enum', enum: AppReleaseStatus })
  status: AppReleaseStatus;

  @Column({ name: 'file_key' })
  fileKey: string;

  @Column({ name: 'original_filename' })
  originalFilename: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: string;

  @Column({ name: 'sha256', type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'package_name', type: 'varchar', nullable: true })
  packageName: string | null;

  @Column({ name: 'min_sdk_version', type: 'integer', nullable: true })
  minSdkVersion: number | null;

  @Column({ name: 'target_sdk_version', type: 'integer', nullable: true })
  targetSdkVersion: number | null;

  @Column({ name: 'download_count', type: 'bigint', default: 0 })
  downloadCount: string;

  @Column({ name: 'published_at', type: 'timestamptz' })
  publishedAt: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'published_by' })
  publishedBy: User | null;

  @Column({ name: 'published_by', type: 'uuid', nullable: true })
  publishedById: string | null;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invalidated_by' })
  invalidatedBy: User | null;

  @Column({ name: 'invalidated_by', type: 'uuid', nullable: true })
  invalidatedById: string | null;
}
