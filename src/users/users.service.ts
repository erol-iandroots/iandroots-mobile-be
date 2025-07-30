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
    const existingUser = await this.userModel.findOne({
      userId: createUserDto.userId,
    });
    if (existingUser) {
      throw new AppException(
        ErrorCodes.USER_ALREADY_EXISTS,
        'User with this userId already exists',
        HttpStatus.CONFLICT,
      );
      return 'User already exists';
    }
    await this.userModel.create(createUserDto);
    return 'User created successfully';
  }
}
