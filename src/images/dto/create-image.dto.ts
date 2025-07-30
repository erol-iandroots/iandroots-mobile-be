export class CreateImageDto {
  imageType: 'partner' | 'celebrity' | 'pet' | 'Tattoo' | 'city' | 'art';
  userId: string;
  prompt?: string;
  aiModel?: string;
}
