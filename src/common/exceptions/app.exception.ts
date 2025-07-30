import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../enums/error-codes.enum';

export class AppException extends HttpException {
  constructor(
    errorCode: ErrorCodes,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(
      {
        success: false,
        errorCode,
        message,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}
