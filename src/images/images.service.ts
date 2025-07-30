import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateImageDto } from './dto/create-image.dto';
import { Image, ImageDocument } from './entities/image.schema';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCodes } from '../common/enums/error-codes.enum';
import { FilesAzureService } from 'src/files/file.azure.service';

@Injectable()
export class ImagesService {
  constructor(
    @InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
    private readonly fileService: FilesAzureService,
  ) {}

  async create(createImageDto: CreateImageDto) {
    try {
      console.log('burada');
      const dummyImageBuffer = this.generateDummyImage(
        createImageDto.imageType,
      );
      const imageName = `${createImageDto.userId}-${Date.now()}.png`;
      console.log('burada2');
      const uploadedImage = await this.fileService.uploadFile(
        {
          buffer: dummyImageBuffer,
          originalname: imageName,
        } as Express.Multer.File,
        'images',
      );
      console.log(uploadedImage);
      return {
        success: true,
        message: 'Image created and uploaded successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new AppException(
        ErrorCodes.IMAGE_UPLOAD_FAILED,
        `Failed to create and upload image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private generateDummyImage(imageType: string): Buffer {
    const width = 512;
    const height = 512;
    const bytesPerPixel = 4;
    const totalBytes = width * height * bytesPerPixel;

    const colors = {
      partner: [255, 182, 193, 255],
      celebrity: [255, 215, 0, 255],
      pet: [144, 238, 144, 255],
      Tattoo: [128, 0, 128, 255],
      city: [135, 206, 235, 255],
      art: [255, 165, 0, 255],
    };

    const color = colors[imageType] || [128, 128, 128, 255];
    const buffer = Buffer.alloc(totalBytes);

    for (let i = 0; i < totalBytes; i += 4) {
      buffer[i] = color[0];
      buffer[i + 1] = color[1];
      buffer[i + 2] = color[2];
      buffer[i + 3] = color[3];
    }

    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x00,
      0x08, 0x06, 0x00, 0x00, 0x00, 0xf4, 0x78, 0xd4,
    ]);

    return Buffer.concat([pngHeader, buffer]);
  }
}
