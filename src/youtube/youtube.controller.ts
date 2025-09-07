// src/youtube/youtube.controller.ts
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import { YoutubeService, YouTubeVideo } from './youtube.service';

import { Request, Response } from 'express';
import Busboy from 'busboy';

// helper to stringify unknown errors
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('search')
  async search(@Query('q') q: string, @Query('maxResults') maxResults = 5): Promise<YouTubeVideo[]>  {
    if (!q?.trim()) throw new BadRequestException('Missing query "q"');
    return this.youtubeService.searchVideos(q, Number(maxResults));
  }

  @Get('videos')
  async getVideos(@Query('ids') ids: string): Promise<YouTubeVideo[]> {
    if (!ids?.trim()) throw new BadRequestException('Missing "ids"');
    return this.youtubeService.getVideosDetails(ids);
  }

  @Get('playlist')
 async getPlaylist(@Query('id') id: string, @Query('maxResults') maxResults = 5): Promise<YouTubeVideo[]>  {
    if (!id?.trim()) throw new BadRequestException('Missing playlist "id"');
    return this.youtubeService.getPlaylistVideos(id, Number(maxResults));
  }

  @Get('auth/url')
  getAuthUrl(@Res() res: Response) {
    try {
      const url = this.youtubeService.getAuthUrl();
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ message: 'Failed to generate auth url', error: getErrorMessage(err) });
    }
  }

  @Get('auth/callback')
  async authCallback(@Req() req: Request, @Res() res: Response) {
    const code = req.query.code as string | undefined;
    if (!code) return res.status(400).send('Missing code');
    try {
      await this.youtubeService.exchangeCodeForToken(code, 'owner');
      return res.send('YouTube connected. You can close this window.');
    } catch (err) {
      console.error('Auth callback error', err);
      return res.status(500).send('Failed to exchange code for token');
    }
  }

  @Post('upload/stream')
  async uploadStream(@Req() req: Request, @Res() res: Response) {
    const bb = Busboy({ headers: req.headers });
    let title = 'Lesson Upload';
    let description = '';
    let privacyStatus: 'public' | 'unlisted' | 'private' = 'unlisted';
    let fileFound = false;

    const done = new Promise<void>((resolve) => {
      bb.on('field', (name, val) => {
        if (name === 'title') title = val;
        else if (name === 'description') description = val;
        else if (name === 'privacyStatus' && ['public', 'unlisted', 'private'].includes(val))
          privacyStatus = val as any;
      });

      bb.on('file', async (_name, fileStream) => {
        fileFound = true;
        try {
          // <-- AWAIT the async createUploadStream call
        const { stream, done } = await this.youtubeService.createUploadStream({ title, description, privacyStatus });

          fileStream.pipe(stream);

          done
            .then((result: any) => {
              const normalized = {
                videoId: result?.videoId ?? result?.data?.id,
                watchUrl:
                  result?.watchUrl ??
                  (result?.videoId ? `https://www.youtube.com/watch?v=${result.videoId}` :
                   result?.data?.id ? `https://www.youtube.com/watch?v=${result.data.id}` : undefined),
                embedUrl:
                  result?.embedUrl ??
                  (result?.videoId ? `https://www.youtube.com/embed/${result.videoId}` :
                   result?.data?.id ? `https://www.youtube.com/embed/${result.data.id}` : undefined),
                title: result?.title ?? result?.data?.snippet?.title ?? title,
                description: result?.description ?? result?.data?.snippet?.description ?? description,
                privacyStatus: result?.privacyStatus ?? result?.data?.status?.privacyStatus ?? privacyStatus,
              };

              res.json(normalized);
              resolve();
            })
            .catch((err: any) => {
              const respData = err?.response?.data ?? err?.message ?? String(err);
              const isInvalidGrant =
                err?.code === 'REFRESH_TOKEN_INVALID' ||
                String(respData).toLowerCase().includes('invalid_grant') ||
                String(respData).toLowerCase().includes('refresh_token');

              if (isInvalidGrant) {
                let authUrl: string | null = null;
                try { authUrl = this.youtubeService.getAuthUrl(); } catch (_) { authUrl = null; }

                if (!res.headersSent) {
                  return res.status(401).json({
                    message: 'REFRESH_TOKEN_INVALID',
                    reason: 'reauth_required',
                    authUrl,
                    error: getErrorMessage(err),
                  });
                }
              }

              if (!res.headersSent) {
                res.status(500).json({
                  message: 'YouTube upload failed',
                  error: getErrorMessage(err),
                });
              }
            });
        } catch (err) {
          if (!res.headersSent) {
            res.status(500).json({
              message: 'Failed to create upload stream',
              error: getErrorMessage(err),
            });
          }
        }
      });

      bb.on('close', () => {
        if (!fileFound && !res.headersSent) {
          res.status(400).json({ message: 'No video file found in form-data' });
        }
        resolve();
      });

      bb.on('error', (err: unknown) => {
        if (!res.headersSent) {
          res.status(500).json({
            message: 'Upload stream error',
            error: getErrorMessage(err),
          });
        }
        resolve();
      });
    });

    req.pipe(bb);
    return done;
  }

  @Get('videos/:id/status')
  async status(@Param('id') id: string) {
    if (!id?.trim()) throw new BadRequestException('Missing video id');
    return this.youtubeService.getUploadStatus(id);
  }

  @Delete('videos/:id')
  async remove(@Param('id') id: string) {
    if (!id?.trim()) throw new BadRequestException('Missing video id');
    return this.youtubeService.deleteVideo(id);
  }
}
