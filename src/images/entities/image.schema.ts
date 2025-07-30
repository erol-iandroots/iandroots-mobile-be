import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Image {
  @Prop({ required: true })
  imageUrl: string;

  @Prop({ required: true })
  imageName: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: false })
  prompt?: string;

  @Prop({
    required: false,
    default: 'pending',
    enum: ['pending', 'completed', 'failed'],
  })
  status: 'pending' | 'completed' | 'failed';

  @Prop({ required: false })
  aiModel?: string;

  @Prop({ required: false, default: true })
  isActive: boolean;
}

export type ImageDocument = Image & Document;
export const ImageSchema = SchemaFactory.createForClass(Image);
