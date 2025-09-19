import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateProgressDto {
  @IsString()
  lessonId!: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean; // true = completed, false = not completed
}
