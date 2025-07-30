import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { SKIP_LOGGING_KEY } from '../decorators/skip-logging.decorator';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skipLogging = this.reflector.getAllAndOverride<boolean>(
      SKIP_LOGGING_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipLogging) {
      return next.handle();
    }

    const now = Date.now();
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();

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
          const statusCode = context.switchToHttp().getResponse().statusCode;

          const getResponseSize = (data: any): number => {
            if (data === undefined || data === null) {
              return 0;
            }
            if (typeof data === 'string') {
              return data.length;
            }
            if (Buffer.isBuffer(data)) {
              return data.length;
            }
            try {
              return JSON.stringify(data).length;
            } catch {
              return 0;
            }
          };

          if (statusCode >= 400) {
            this.logger.warn({
              message: 'Request Completed with Error Status',
              method,
              url,
              statusCode,
              delay: `${delay}ms`,
              responseSize: getResponseSize(responseData),
              timestamp: new Date().toISOString(),
            });
          } else {
            this.logger.log({
              message: 'Request Completed Successfully',
              method,
              url,
              statusCode,
              delay: `${delay}ms`,
              responseSize: getResponseSize(responseData),
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
