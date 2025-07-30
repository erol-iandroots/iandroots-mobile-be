import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class User {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false, default: true })
  isActive: boolean;
  @Prop({ required: true, default: 0 })
  credits: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
