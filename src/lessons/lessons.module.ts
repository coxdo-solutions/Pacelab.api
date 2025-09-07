// src/lessons/lessons.module.ts
import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { YoutubeModule } from '../youtube/youtube.module'; // <-- import the module

@Module({
  imports: [YoutubeModule], // <-- add here
  controllers: [LessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}

