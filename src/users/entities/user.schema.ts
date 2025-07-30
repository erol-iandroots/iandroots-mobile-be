import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class User {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false, default: true })
  isActive: boolean;

  @Prop({ required: true })
  birthDate: Date;

  @Prop({ required: true })
  birthTime: string;

  @Prop({ required: true })
  birthPlace: string;

  @Prop({ required: true, enum: ['boys', 'girls'] })
  interestedIn: 'boys' | 'girls';

  @Prop({ required: true, default: 0 })
  credits: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
