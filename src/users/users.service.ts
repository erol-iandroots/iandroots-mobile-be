import { HttpStatus, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './entities/user.schema';
import { Model } from 'mongoose';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCodes } from '@/common/enums/error-codes.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User')
    private readonly userModel: Model<User>,
  ) {}
  async create(createUserDto: CreateUserDto) {
    try {
      const existingUser = await this.userModel.findOne({
        userId: createUserDto.userId,
      });
      if (existingUser) {
        throw new AppException(
          ErrorCodes.USER_ALREADY_EXISTS,
          'User with this userId already exists',
          HttpStatus.CONFLICT,
        );
      }
      const newUser = await this.userModel.create(createUserDto);
      return {
        success: true,
        data: newUser,
        message: 'User created successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'An error occurred while creating the user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
