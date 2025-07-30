import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || '';

    this.logger.log({
      message: 'Incoming Request',
      method,
      url,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    });

    return next.handle().pipe(
      tap({
        next: (responseData) => {
          const delay = Date.now() - now;
          const statusCode = response.statusCode;

          if (statusCode >= 400) {
            this.logger.warn({
              message: 'Request Completed with Error Status',
              method,
              url,
              statusCode,
              delay: `${delay}ms`,
              responseSize: JSON.stringify(responseData).length,
              timestamp: new Date().toISOString(),
            });
          } else {
            this.logger.log({
              message: 'Request Completed Successfully',
              method,
              url,
              statusCode,
              delay: `${delay}ms`,
              responseSize: JSON.stringify(responseData).length,
              timestamp: new Date().toISOString(),
            });
          }
        },
        error: (error) => {
          const delay = Date.now() - now;
          this.logger.error({
            message: 'Request Failed with Exception',
            method,
            url,
            statusCode: error.status || 500,
            delay: `${delay}ms`,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          });
        },
      }),
    );
  }
}
