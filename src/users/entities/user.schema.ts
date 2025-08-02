import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['male', 'female'] })
  gender: 'male' | 'female';

  @Prop({ required: true })
  birthDate: Date;

  @Prop({ required: true })
  knowsBirthTime: boolean;

  @Prop({ required: true })
  birthTime: string;

  @Prop({ required: true })
  birthPlace: string;

  @Prop({ required: true, enum: ['boys', 'girls'] })
  interestedIn: 'boys' | 'girls';

  @Prop({ required: true, default: 0 })
  credits: number;

  @Prop({ required: false, default: true })
  isActive: boolean;

  @Prop({ required: true })
  sunSign: string;

  @Prop({ required: true })
  moonSign: string;

  @Prop({ required: true })
  risingSign: string;
}
export type UserDocument = User & Document;

export const UserSchema = SchemaFactory.createForClass(User);
