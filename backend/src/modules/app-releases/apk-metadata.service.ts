import { BadRequestException, Injectable } from '@nestjs/common';
import ApkReader from '@devicefarmer/adbkit-apkreader';

export interface ApkMetadata {
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdkVersion: number | null;
  targetSdkVersion: number | null;
}

@Injectable()
export class ApkMetadataService {
  async inspect(buffer: Buffer): Promise<ApkMetadata> {
    try {
      const reader = await ApkReader.open(buffer);
      const manifest = await reader.readManifest();
      const packageName = this.toStringValue(manifest.package);
      const versionName = this.toStringValue(manifest.versionName);
      const versionCode = this.toPositiveInteger(manifest.versionCode);
      if (!packageName || !versionName || versionCode === null) {
        throw new Error('Required Android manifest metadata is missing');
      }

      return {
        packageName,
        versionName,
        versionCode,
        minSdkVersion: this.toPositiveInteger(manifest.usesSdk?.minSdkVersion),
        targetSdkVersion: this.toPositiveInteger(
          manifest.usesSdk?.targetSdkVersion,
        ),
      };
    } catch {
      throw new BadRequestException({
        code: 'APP_RELEASE_INVALID_APK_METADATA',
        message:
          '无法读取 APK 的包名或版本信息，请确认文件是完整的 Android APK',
      });
    }
  }

  private toPositiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private toStringValue(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value).trim()
      : '';
  }
}
