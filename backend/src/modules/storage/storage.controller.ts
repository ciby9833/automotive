import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StorageService } from './storage.service';

class SignedUrlsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  keys: string[];
}

// 通用附件上传：扫码凭证(SJ照片)、车辆外观图片、供应商发票等复用同一个接口
@ApiTags('storage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @ApiConsumes('multipart/form-data')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  // 批量换取临时签名 URL。前端展示历史凭证时用，避免把长期 URL 写库(24h 过期)
  @Post('signed-urls')
  async signedUrls(@Body() dto: SignedUrlsDto): Promise<Record<string, string>> {
    const entries = await Promise.all(
      dto.keys.map(async (key) => [key, await this.storageService.getUrl(key)] as const),
    );
    return Object.fromEntries(entries);
  }
}
