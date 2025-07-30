import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ImagesService } from './images.service';
import { CreateImageDto } from './dto/create-image.dto';
import { SkipLogging } from '../common/decorators/skip-logging.decorator';

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  create(@Body() createImageDto: CreateImageDto) {
    return this.imagesService.create(createImageDto);
  }

  @Get('user/:userId')
  getUserImages(@Param('userId') userId: string) {
    return this.imagesService.returnImageByUserId(userId);
  }

  @Get('view/:imageId')
  @SkipLogging()
  async viewImage(@Param('imageId') imageId: string, @Res() res: Response) {
    try {
      const imageStream = await this.imagesService.getImageStream(imageId);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');

      imageStream.on('error', () => {
        if (!res.headersSent) {
          res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Error streaming image',
            timestamp: new Date().toISOString(),
          });
        }
      });

      imageStream.pipe(res);
    } catch {
      if (!res.headersSent) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: 'Image not found',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
