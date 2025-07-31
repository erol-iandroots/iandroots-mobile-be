import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { CreateImageDto } from './dto/create-image.dto';
import { Image, ImageDocument } from './entities/image.schema';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCodes } from '../common/enums/error-codes.enum';
import { FilesAzureService } from 'src/files/file.azure.service';
import { User, UserDocument } from 'src/users/entities/user.schema';

@Injectable()
export class ImagesService {
  constructor(
    @InjectModel(Image.name) private readonly imageModel: Model<ImageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly fileService: FilesAzureService,
    private readonly configService: ConfigService,
  ) {}

  async create(createImageDto: CreateImageDto) {
    try {
      const user = await this.userModel.findOne({
        userId: createImageDto.userId,
      });
      if (!user) {
        throw new AppException(
          ErrorCodes.USER_NOT_FOUND,
          `User with ID ${createImageDto.userId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const imageGenerationUrl = this.configService.get<string>(
        'IMAGE_GENERATION_URL',
      );
      const imageGenerationKey = this.configService.get<string>(
        'IMAGE_GENERATION_KEY',
      );

      if (!imageGenerationUrl || !imageGenerationKey) {
        throw new AppException(
          ErrorCodes.IMAGE_GENERATION_FAILED,
          'Image generation configuration is missing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (!createImageDto.prompt && !createImageDto.imageType) {
        throw new AppException(
          ErrorCodes.INVALID_IMAGE_FORMAT,
          'Invalid image format or prompt',
          HttpStatus.BAD_REQUEST,
        );
      }
      const prompt =
        createImageDto.prompt || `Generate a ${createImageDto.imageType} image`;
      const generatedImageUrl = await this.generateImageFromAPI(
        imageGenerationUrl,
        imageGenerationKey,
        prompt,
        createImageDto.imageType,
      );

      const imageName = `${user.name}-${Date.now()}.png`;

      const imageBuffer = await this.downloadImageFromUrl(generatedImageUrl);
      const permanentImageUrl = await this.uploadImageToBlob(
        imageBuffer,
        imageName,
      );

      const imageData = new this.imageModel({
        imageUrl: permanentImageUrl,
        imageName: imageName,
        imageType: createImageDto.imageType,
        userId: createImageDto.userId,
        prompt: prompt,
        status: 'completed',
        isActive: true,
      });

      const savedImage = await imageData.save();
      user.credits -= 1; // Deduct one credit for image generation
      await user.save();
      return {
        success: true,
        data: {
          id: savedImage._id,
          imageUrl: savedImage.imageUrl,
          imageName: savedImage.imageName,
          imageType: createImageDto.imageType,
          status: savedImage.status,
          prompt: savedImage.prompt,
          createdAt: (savedImage as any).createdAt,
        },
        message: 'Image created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        ErrorCodes.IMAGE_GENERATION_FAILED,
        `Failed to generate image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getAllImages() {
    try {
      const images = await this.imageModel.find({ isActive: true }).exec();
      return images.map((image) => ({
        id: image._id,
        imageUrl: image.imageUrl,
        imageName: image.imageName,
        imageType: image.imageType,
        status: image.status,
        prompt: image.prompt,
        createdAt: (image as any).createdAt,
      }));
    } catch (error) {
      throw new AppException(
        ErrorCodes.IMAGE_RETRIEVAL_FAILED,
        `Failed to retrieve images: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async generateImageFromAPI(
    apiUrl: string,
    apiKey: string,
    prompt: string,
    imageType: string,
  ): Promise<string> {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt: prompt,
          imageType: imageType,
          size: '1024x1024',
          quality: 'hd',
          style: 'vivid',
          n: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();

      if (!result.data || !result.data[0] || !result.data[0].url) {
        throw new Error('Invalid response format from image generation API');
      }

      return result.data[0].url;
    } catch (error) {
      throw new AppException(
        ErrorCodes.IMAGE_GENERATION_FAILED,
        `Image generation API error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async downloadImageFromUrl(imageUrl: string): Promise<Buffer> {
    try {
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new Error(
          `Failed to download image: ${response.status} ${response.statusText}`,
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new AppException(
        ErrorCodes.IMAGE_GENERATION_FAILED,
        `Failed to download generated image: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async uploadImageToBlob(
    imageBuffer: Buffer,
    imageName: string,
  ): Promise<string> {
    try {
      const fileObj = {
        buffer: imageBuffer,
        originalname: imageName,
        mimetype: 'image/png',
        fieldname: 'file',
        encoding: '7bit',
        size: imageBuffer.length,
      } as Express.Multer.File;

      return await this.fileService.uploadFile(fileObj);
    } catch (error) {
      throw new AppException(
        ErrorCodes.IMAGE_UPLOAD_FAILED,
        `Failed to upload image to blob storage: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getImageStream(imageId: string): Promise<Readable> {
    try {
      const image = await this.imageModel.findById(imageId).exec();
      if (!image) {
        throw new AppException(
          ErrorCodes.IMAGE_NOT_FOUND,
          `Image with ID ${imageId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      const containerName = this.configService.get<string>(
        'AZURE_CONTAINER_NAME',
      );
      if (!containerName) {
        throw new AppException(
          ErrorCodes.INTERNAL_SERVER_ERROR,
          'Azure container configuration is missing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const imageUrl = new URL(image.imageUrl);
      const fileName = imageUrl.pathname.split('/').pop();

      const stream = await this.fileService.downloadFileStream(
        fileName,
        containerName,
      );
      return stream as Readable;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        ErrorCodes.IMAGE_RETRIEVAL_FAILED,
        `Failed to retrieve image stream: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
