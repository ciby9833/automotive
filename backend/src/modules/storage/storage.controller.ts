import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import type { Response } from 'express';
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
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @UseGuards(JwtAuthGuard)
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

  // 批量换取图片 URL（返回后端相对路径 /storage/preview/xxx；前端拼 baseURL 使用）
  @UseGuards(JwtAuthGuard)
  @Post('signed-urls')
  signedUrls(@Body() dto: SignedUrlsDto): Record<string, string> {
    const entries = dto.keys.map(
      (key) => [key, this.storageService.getUrl(key)] as const,
    );
    return Object.fromEntries(entries);
  }

  // 流转发图片内容：不带认证，key 是 UUID（128 位随机，无法枚举）
  // 生产环境 MinIO 只对本机开放，浏览器通过后端 → nginx 拿图
  @Get('preview/:key')
  async preview(@Param('key') key: string, @Res() res: Response): Promise<void> {
    const { stream, size, contentType } =
      await this.storageService.getObjectStream(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }
}
