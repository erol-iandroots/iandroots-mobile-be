export class ErrorResponseDto {
  success: boolean;
  errorCode: string;
  message: string;
  timestamp: string;
  path?: string;
}

export class SuccessResponseDto<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}
