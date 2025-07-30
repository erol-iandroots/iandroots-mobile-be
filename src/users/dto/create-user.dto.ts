export class CreateUserDto {
  userId: string;
  name: string;
  gender: 'male' | 'female';
  birthDate: Date;
  knowsBirthTime: boolean;
  birthTime: string;
  birthPlace: string;
  interestedIn: 'boys' | 'girls';
}
