import { Permissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/enums/permission.enum';
import { Public, SessionOnly } from '../../common/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

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
  @Permissions(Permission.FILE_UPLOAD)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthenticatedUser) {
    return this.storageService.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      user,
    );
  }

  // 批量换取图片 URL（返回后端相对路径 /storage/preview/xxx；前端拼 baseURL 使用）
  @UseGuards(JwtAuthGuard)
  @SessionOnly()
  @Post('signed-urls')
  signedUrls(@Body() dto: SignedUrlsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.storageService.signedUrls(dto.keys, user);
  }

  // 流转发图片内容：校验短期附件令牌，并重新检查账号及业务归属。
  // 生产环境 MinIO 只对本机开放，浏览器通过后端 → nginx 拿图
  @Public()
  @Get('preview/:key')
  async preview(@Param('key') key: string, @Query('token') token: string | undefined, @Res() res: Response): Promise<void> {
    await this.storageService.authorizePreview(key, token);
    const { stream, size, contentType } =
      await this.storageService.getObjectStream(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }
}
