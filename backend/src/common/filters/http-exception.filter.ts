import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// 统一错误响应携带机器可读的 code 字段，供前端按 code 做多语言翻译，
// message 字段保留人类可读的默认文案（兜底/日志用），不作为前端翻译依据
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = isHttpException
      ? exception.getResponse()
      : 'Internal server error';

    if (!isHttpException) {
      this.logger.error(exception);
    }

    let code = `HTTP_${status}`;
    let message: unknown = rawResponse;
    if (typeof rawResponse === 'object' && rawResponse !== null) {
      const body = rawResponse as Record<string, unknown>;
      if (typeof body.code === 'string') {
        code = body.code;
      }
      message = body.message ?? rawResponse;
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      code,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
