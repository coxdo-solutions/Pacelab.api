// in src/youtube/youtube.module.ts
import { Module } from '@nestjs/common';
import { YoutubeController } from './youtube.controller';
import { YoutubeService } from './youtube.service';
import { YoutubeTokenService } from './youtube-token.service';

@Module({
  controllers: [YoutubeController],
  providers: [YoutubeService, YoutubeTokenService],
  exports: [YoutubeService, YoutubeTokenService],
})
export class YoutubeModule {}
