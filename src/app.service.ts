import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getHello(): any {
    const env = this.configService.get<string>('NODE_ENV');
    const dbUrl = this.configService.get<string>('DATABASE_URL');
    const appName = this.configService.get<string>('APP_NAME');
    const apiVersion = this.configService.get<string>('API_VERSION');

    console.log(`🚀 Current Environment: ${env}`);
    console.log(`📱 App Name: ${appName}`);
    console.log(`🔖 API Version: ${apiVersion}`);
    console.log(`🗄️  Database URL: ${dbUrl}`);

    return {
      message: 'Hello World!'
    };
  }
}
