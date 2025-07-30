import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = configService.get('PORT') || 3000;
  const nodeEnv = configService.get('NODE_ENV') || 'development';

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Environment: ${nodeEnv}`);
}
bootstrap();
