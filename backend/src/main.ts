import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { PreAuthBlockGuard } from './common/guards/preauth-block.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string[]>('cors.origins'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  // ClassSerializerInterceptor 必须在 TransformInterceptor 之前注册（先执行，剥离 @Exclude 字段如 passwordHash），
  // 再由 TransformInterceptor 包一层 { success, data }
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TransformInterceptor(),
  );
  // 预授权 token 除非目标端点显式 @AllowPreAuth() 否则一律 401
  // PermissionsGuard 只对显式 @Permissions() 的端点生效，未声明的透传
  app.useGlobalGuards(
    new PreAuthBlockGuard(app.get(Reflector)),
    new PermissionsGuard(app.get(Reflector)),
  );

  const config = new DocumentBuilder()
    .setTitle('汽车物流TMS API')
    .setDescription('订单/开单/运单/场地库位/供应商/客户/财务/轨迹跟踪')
    .setVersion('0.1-P0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = configService.get<number>('port') ?? 3001;
  await app.listen(port);

  console.log(
    `TMS backend running on http://localhost:${port} (docs: /api-docs)`,
  );
}
void bootstrap();
