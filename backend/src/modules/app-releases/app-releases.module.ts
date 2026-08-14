import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { AppReleasesController } from './app-releases.controller';
import { AppReleasesService } from './app-releases.service';
import { ApkMetadataService } from './apk-metadata.service';
import { AppRelease } from './entities/app-release.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppRelease]),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize:
            config.get<number>('appRelease.maxUploadMb', 300) * 1024 * 1024,
        },
      }),
    }),
    StorageModule,
  ],
  controllers: [AppReleasesController],
  providers: [AppReleasesService, ApkMetadataService],
})
export class AppReleasesModule {}
