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
      const prompt = this.generateDynamicPrompt(createImageDto, user);
      const generatedImageUrl = await this.generateImageFromAPI(prompt);
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
    prompt: string,
  ): Promise<string> {
    try {
      const imageGenerationUrl = this.configService.get<string>(
        'IMAGE_GENERATION_URL',
      );
      const imageGenerationKey = this.configService.get<string>(
        'IMAGE_GENERATION_KEY',
      );
      const response = await fetch(imageGenerationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${imageGenerationKey}`,
        },
        body: JSON.stringify({
          prompt: prompt,
          size: '1024x1024',
          quality: 'hd',
          style: 'natural',
          n: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log(result);
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

  private generateDynamicPrompt(
    createImageDto: CreateImageDto,
    user: UserDocument,
  ): string {
    const { imageType } = createImageDto;
    const { sunSign, moonSign, risingSign, birthDate, birthTime } = user;

    const birthYear = new Date(birthDate).getFullYear();
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;

    switch (imageType) {
      case 'partner':
        return this.generatePartnerPrompt(
          sunSign,
          moonSign,
          risingSign,
          birthDate,
          birthTime,
        );

      case 'celebrity':
        // For now, return a generic celebrity prompt
        return `Generate a celebrity image`;

      case 'pet':
        return this.generatePetPrompt(
          sunSign,
          moonSign,
          risingSign,
          birthDate,
          birthTime,
        );

      case 'tattoo':
        return this.generateTattooPrompt(
          sunSign,
          moonSign,
          risingSign,
          birthDate,
          birthTime,
        );

      case 'city':
        return this.generateCityPrompt(
          sunSign,
          moonSign,
          risingSign,
          birthDate,
          birthTime,
        );

      case 'art':
        return this.generateArtPrompt(
          sunSign,
          moonSign,
          risingSign,
          birthDate,
          birthTime,
        );

      default:
        return `Generate a ${imageType} image`;
    }
  }

  private generatePartnerPrompt(
    sunSign: string,
    moonSign: string,
    risingSign: string,
    birthDate: Date,
    birthTime: string,
  ): string {
    const compatibilityTraits = this.getCompatibilityTraits(
      sunSign,
      moonSign,
      risingSign,
    );
    return `Generate an attractive person who would be compatible with someone who has born on ${birthDate} at ${birthTime} and has ${sunSign} sun sign, ${moonSign} moon sign, and ${risingSign} rising sign. The person should embody ${compatibilityTraits.join(', ')} qualities. Create a realistic, beautiful portrait.`;
  }

  private generatePetPrompt(
    sunSign: string,
    moonSign: string,
    risingSign: string,
    birthDate: Date,
    birthTime: string,
  ): string {
    const petTraits = this.getPetTraits(sunSign, moonSign, risingSign);
    return `Generate a ${petTraits.animal} that matches the personality of someone who has born on ${birthDate} at ${birthTime} and has ${sunSign} sun sign, ${moonSign} moon sign, and ${risingSign} rising sign. The pet should have ${petTraits.characteristics.join(', ')} qualities. Create a cute, realistic animal portrait.`;
  }

  private generateTattooPrompt(
    sunSign: string,
    moonSign: string,
    risingSign: string,
    birthDate: Date,
    birthTime: string,
  ): string {
    const tattooElements = this.getTattooElements(
      sunSign,
      moonSign,
      risingSign,
    );
    return `Design a meaningful tattoo that incorporates ${tattooElements.symbols.join(', ')} symbolizing ${tattooElements.meanings.join(', ')}. The design should reflect the personality of someone who has born on ${birthDate} at ${birthTime} and has ${sunSign} sun, ${moonSign} moon, and ${risingSign} rising. Create an artistic, detailed tattoo design.`;
  }

  private generateCityPrompt(
    sunSign: string,
    moonSign: string,
    risingSign: string,
    birthDate: Date,
    birthTime: string,
  ): string {
    const cityTraits = this.getCityTraits(sunSign, moonSign, risingSign);
    return `Generate a beautiful cityscape that would appeal to someone who has born on ${birthDate} at ${birthTime} and has ${sunSign} sun sign, ${moonSign} moon sign, and ${risingSign} rising sign. The city should have ${cityTraits.characteristics.join(', ')} and feel ${cityTraits.atmosphere.join(', ')}. Create a stunning urban landscape.`;
  }

  private generateArtPrompt(
    sunSign: string,
    moonSign: string,
    risingSign: string,
    birthDate: Date,
    birthTime: string,
  ): string {
    const artStyle = this.getArtStyle(sunSign, moonSign, risingSign);
    return `Create an artistic piece in ${artStyle.style} style that resonates with someone who has born on ${birthDate} at ${birthTime} and has ${sunSign} sun sign, ${moonSign} moon sign, and ${risingSign} rising sign. The artwork should evoke ${artStyle.emotions.join(', ')} and use ${artStyle.colors.join(', ')} colors. Make it visually striking and meaningful.`;
  }

  private getCompatibilityTraits(
    sunSign: string,
    moonSign: string,
    risingSign: string,
  ): string[] {
    // This is a simplified compatibility system - you can expand this based on astrological knowledge
    const signTraits = {
      aries: ['confident', 'adventurous', 'energetic'],
      taurus: ['stable', 'sensual', 'reliable'],
      gemini: ['intellectual', 'communicative', 'versatile'],
      cancer: ['nurturing', 'emotional', 'intuitive'],
      leo: ['creative', 'generous', 'charismatic'],
      virgo: ['practical', 'analytical', 'helpful'],
      libra: ['harmonious', 'artistic', 'diplomatic'],
      scorpio: ['intense', 'mysterious', 'passionate'],
      sagittarius: ['adventurous', 'philosophical', 'optimistic'],
      capricorn: ['ambitious', 'responsible', 'disciplined'],
      aquarius: ['innovative', 'independent', 'humanitarian'],
      pisces: ['compassionate', 'artistic', 'spiritual'],
    };

    const traits = [
      ...(signTraits[sunSign.toLowerCase()] || ['balanced']),
      ...(signTraits[moonSign.toLowerCase()] || ['emotionally supportive']),
      ...(signTraits[risingSign.toLowerCase()] || ['approachable']),
    ];

    return [...new Set(traits)]; // Remove duplicates
  }

  private getPetTraits(
    sunSign: string,
    moonSign: string,
    risingSign: string,
  ): { animal: string; characteristics: string[] } {
    const signPets = {
      aries: {
        animal: 'energetic dog',
        characteristics: ['playful', 'active', 'loyal'],
      },
      taurus: {
        animal: 'calm cat',
        characteristics: ['peaceful', 'affectionate', 'steady'],
      },
      gemini: {
        animal: 'colorful parrot',
        characteristics: ['intelligent', 'social', 'communicative'],
      },
      cancer: {
        animal: 'gentle rabbit',
        characteristics: ['soft', 'nurturing', 'sensitive'],
      },
      leo: {
        animal: 'majestic cat',
        characteristics: ['regal', 'confident', 'beautiful'],
      },
      virgo: {
        animal: 'well-groomed dog',
        characteristics: ['clean', 'organized', 'helpful'],
      },
      libra: {
        animal: 'graceful cat',
        characteristics: ['elegant', 'balanced', 'beautiful'],
      },
      scorpio: {
        animal: 'mysterious cat',
        characteristics: ['intense', 'loyal', 'protective'],
      },
      sagittarius: {
        animal: 'adventurous dog',
        characteristics: ['free-spirited', 'energetic', 'friendly'],
      },
      capricorn: {
        animal: 'dignified dog',
        characteristics: ['responsible', 'steady', 'reliable'],
      },
      aquarius: {
        animal: 'unique exotic pet',
        characteristics: ['independent', 'unusual', 'intelligent'],
      },
      pisces: {
        animal: 'gentle fish',
        characteristics: ['peaceful', 'flowing', 'dreamy'],
      },
    };

    return (
      signPets[sunSign.toLowerCase()] || {
        animal: 'friendly pet',
        characteristics: ['loving', 'companion'],
      }
    );
  }

  private getTattooElements(
    sunSign: string,
    moonSign: string,
    risingSign: string,
  ): { symbols: string[]; meanings: string[] } {
    const signElements = {
      aries: {
        symbols: ['ram horns', 'fire elements'],
        meanings: ['courage', 'leadership'],
      },
      taurus: {
        symbols: ['bull', 'earth elements'],
        meanings: ['strength', 'stability'],
      },
      gemini: {
        symbols: ['twins', 'air symbols'],
        meanings: ['duality', 'communication'],
      },
      cancer: {
        symbols: ['crab', 'moon phases'],
        meanings: ['protection', 'intuition'],
      },
      leo: { symbols: ['lion', 'sun rays'], meanings: ['pride', 'creativity'] },
      virgo: { symbols: ['maiden', 'wheat'], meanings: ['purity', 'harvest'] },
      libra: {
        symbols: ['scales', 'balance'],
        meanings: ['harmony', 'justice'],
      },
      scorpio: {
        symbols: ['scorpion', 'phoenix'],
        meanings: ['transformation', 'intensity'],
      },
      sagittarius: {
        symbols: ['archer', 'arrow'],
        meanings: ['adventure', 'truth'],
      },
      capricorn: {
        symbols: ['mountain goat', 'peaks'],
        meanings: ['achievement', 'perseverance'],
      },
      aquarius: {
        symbols: ['water bearer', 'waves'],
        meanings: ['innovation', 'humanity'],
      },
      pisces: {
        symbols: ['fish', 'ocean waves'],
        meanings: ['spirituality', 'compassion'],
      },
    };

    const sunElements = signElements[sunSign.toLowerCase()] || {
      symbols: ['stars'],
      meanings: ['guidance'],
    };
    const moonElements = signElements[moonSign.toLowerCase()] || {
      symbols: ['moon'],
      meanings: ['emotion'],
    };

    return {
      symbols: [...sunElements.symbols, ...moonElements.symbols],
      meanings: [...sunElements.meanings, ...moonElements.meanings],
    };
  }

  private getCityTraits(
    sunSign: string,
    moonSign: string,
    risingSign: string,
  ): { characteristics: string[]; atmosphere: string[] } {
    const signCities = {
      aries: {
        characteristics: ['modern skyscrapers', 'busy streets'],
        atmosphere: ['energetic', 'fast-paced'],
      },
      taurus: {
        characteristics: ['green parks', 'stable architecture'],
        atmosphere: ['peaceful', 'grounded'],
      },
      gemini: {
        characteristics: ['diverse neighborhoods', 'communication hubs'],
        atmosphere: ['vibrant', 'connected'],
      },
      cancer: {
        characteristics: ['waterfront', 'cozy districts'],
        atmosphere: ['homey', 'nurturing'],
      },
      leo: {
        characteristics: ['grand architecture', 'entertainment districts'],
        atmosphere: ['glamorous', 'creative'],
      },
      virgo: {
        characteristics: ['clean streets', 'organized layout'],
        atmosphere: ['efficient', 'orderly'],
      },
      libra: {
        characteristics: ['beautiful architecture', 'artistic districts'],
        atmosphere: ['harmonious', 'aesthetic'],
      },
      scorpio: {
        characteristics: ['mysterious alleys', 'deep architecture'],
        atmosphere: ['intense', 'transformative'],
      },
      sagittarius: {
        characteristics: ['open spaces', 'travel hubs'],
        atmosphere: ['adventurous', 'expansive'],
      },
      capricorn: {
        characteristics: ['business district', 'mountain views'],
        atmosphere: ['ambitious', 'structured'],
      },
      aquarius: {
        characteristics: ['innovative buildings', 'tech districts'],
        atmosphere: ['futuristic', 'progressive'],
      },
      pisces: {
        characteristics: ['flowing water features', 'dreamy architecture'],
        atmosphere: ['mystical', 'flowing'],
      },
    };

    return (
      signCities[sunSign.toLowerCase()] || {
        characteristics: ['beautiful buildings', 'tree-lined streets'],
        atmosphere: ['welcoming', 'balanced'],
      }
    );
  }

  private getArtStyle(
    sunSign: string,
    moonSign: string,
    risingSign: string,
  ): { style: string; emotions: string[]; colors: string[] } {
    const signArt = {
      aries: {
        style: 'bold abstract',
        emotions: ['energy', 'passion'],
        colors: ['red', 'orange'],
      },
      taurus: {
        style: 'realistic landscape',
        emotions: ['peace', 'stability'],
        colors: ['green', 'brown'],
      },
      gemini: {
        style: 'mixed media collage',
        emotions: ['curiosity', 'versatility'],
        colors: ['yellow', 'silver'],
      },
      cancer: {
        style: 'emotional portrait',
        emotions: ['nostalgia', 'comfort'],
        colors: ['silver', 'white'],
      },
      leo: {
        style: 'dramatic baroque',
        emotions: ['pride', 'joy'],
        colors: ['gold', 'orange'],
      },
      virgo: {
        style: 'detailed realistic',
        emotions: ['precision', 'clarity'],
        colors: ['navy', 'white'],
      },
      libra: {
        style: 'harmonious composition',
        emotions: ['beauty', 'balance'],
        colors: ['pink', 'blue'],
      },
      scorpio: {
        style: 'dark surrealism',
        emotions: ['intensity', 'mystery'],
        colors: ['deep red', 'black'],
      },
      sagittarius: {
        style: 'adventurous landscape',
        emotions: ['freedom', 'optimism'],
        colors: ['purple', 'turquoise'],
      },
      capricorn: {
        style: 'classical architecture',
        emotions: ['achievement', 'structure'],
        colors: ['black', 'grey'],
      },
      aquarius: {
        style: 'futuristic digital',
        emotions: ['innovation', 'rebellion'],
        colors: ['electric blue', 'neon'],
      },
      pisces: {
        style: 'dreamy watercolor',
        emotions: ['spirituality', 'compassion'],
        colors: ['sea green', 'lavender'],
      },
    };

    return (
      signArt[sunSign.toLowerCase()] || {
        style: 'contemporary',
        emotions: ['inspiration', 'creativity'],
        colors: ['blue', 'white'],
      }
    );
  }
}
