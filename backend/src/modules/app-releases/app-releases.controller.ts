import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AppReleasesService } from './app-releases.service';
import { PublishAppReleaseDto } from './dto/publish-app-release.dto';

@ApiTags('app-releases')
@Controller('app-releases')
export class AppReleasesController {
  constructor(private readonly service: AppReleasesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HQ_ADMIN)
  @ApiConsumes('multipart/form-data')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  publish(
    @Body() dto: PublishAppReleaseDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.publish(dto, file, user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HQ_ADMIN)
  @Get()
  list() {
    return this.service.list();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HQ_ADMIN)
  @Post(':id/invalidate')
  invalidate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.invalidate(id, user.userId);
  }

  @Get('public/latest')
  @Header('Cache-Control', 'no-store')
  latest() {
    return this.service.latest();
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { object, filename, release } = await this.service.getDownload(id);
    response.setHeader('Content-Type', release.mimeType);
    response.setHeader('Content-Length', String(object.size));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    object.stream.pipe(response);
  }
}
