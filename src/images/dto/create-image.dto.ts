export class CreateImageDto {
  imageType: 'partner' | 'celebrity' | 'pet' | 'tattoo' | 'city' | 'art';
  userId: string;
  prompt?: string;
  aiModel?: string;
}
