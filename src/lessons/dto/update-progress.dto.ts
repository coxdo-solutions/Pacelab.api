import { IsString, IsOptional, IsEnum} from 'class-validator';

export enum LessonProgressStatus{
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export class UpdateProgressDto {
  @IsString()
  lessonId!: string;

  @IsEnum(LessonProgressStatus)
  @IsOptional()
  status?: LessonProgressStatus;


}
