export class CreateImageDto {
  imageType: 'partner' | 'celebrity' | 'pet' | 'tattoo' | 'city' | 'art';
  userId: string;
  prompt?: string;
  sunSign: string;
  moonSign: string;
  risingSign: string;
  birthDate: Date;
  birthTime: string;
}
