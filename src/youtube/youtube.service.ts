// src/youtube/youtube.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { google } from 'googleapis';
import axios, { AxiosResponse } from 'axios';
import * as fs from 'fs';
import { PassThrough } from 'stream';
import { YoutubeTokenService } from './youtube-token.service';

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  publishedAt: string;
  channelTitle: string;
  viewCount: number;
}


@Injectable()
export class YoutubeService {
  private readonly baseUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly apiKey = process.env.YOUTUBE_API_KEY;

  constructor(private tokenService: YoutubeTokenService) {
    if (!this.apiKey) {
      console.warn('YOUTUBE_API_KEY missing; read-only endpoints will fail if required');
    }
  }

  // ------------- Read-only (API key) ----------------
  async searchVideos(query: string, maxResults = 10): Promise<YouTubeVideo[]> {
    try {
      const { data }: AxiosResponse<any> = await axios.get(`${this.baseUrl}/search`, {
        params: { key: this.apiKey, q: query, part: 'snippet', maxResults, type: 'video' },
      });
      const ids = (data.items || []).map((i: any) => i.id?.videoId).filter(Boolean).join(',');
      if (!ids) return [];
      return this.getVideosDetails(ids);
    } catch (err) {
      console.error('YouTube search failed', err?.response?.data ?? err?.message ?? err);
      throw new InternalServerErrorException('Failed to search YouTube videos');
    }
  }

  async getVideosDetails(ids: string): Promise<YouTubeVideo[]> {
    try {
      const { data }: AxiosResponse<any> = await axios.get(`${this.baseUrl}/videos`, {
        params: { key: this.apiKey, id: ids, part: 'snippet,contentDetails,statistics' },
      });
      return (data.items || []).map((item: any) => ({
        id: item.id,
        title: item.snippet?.title ?? '',
        description: item.snippet?.description ?? '',
        thumbnail: item.snippet?.thumbnails?.high?.url ?? '',
        duration: item.contentDetails?.duration ?? '',
        publishedAt: item.snippet?.publishedAt ?? '',
        channelTitle: item.snippet?.channelTitle ?? '',
        viewCount: Number(item.statistics?.viewCount ?? 0),
      }));
    } catch (err) {
      console.error('Failed to fetch video details', err?.response?.data ?? err?.message ?? err);
      throw new InternalServerErrorException('Failed to fetch YouTube video details');
    }
  }

  async getPlaylistVideos(playlistId: string, maxResults = 10): Promise<YouTubeVideo[]> {
    try {
      const { data }: AxiosResponse<any> = await axios.get(`${this.baseUrl}/playlistItems`, {
        params: { key: this.apiKey, playlistId, part: 'snippet', maxResults },
      });
      const ids = (data.items || [])
        .map((i: any) => i.snippet?.resourceId?.videoId)
        .filter(Boolean)
        .join(',');
      if (!ids) return [];
      return this.getVideosDetails(ids);
    } catch (err) {
      console.error('Failed to fetch playlist videos', err?.response?.data ?? err?.message ?? err);
      throw new InternalServerErrorException('Failed to fetch playlist videos');
    }
  }

  // ------------- Auth + Upload helpers ----------------
  private async buildOAuthClient(ownerId = 'owner') {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    const refresh = (await this.tokenService.getRefreshToken(ownerId)) ?? process.env.GOOGLE_REFRESH_TOKEN;
    if (refresh) {
      oauth2.setCredentials({ refresh_token: refresh });
    }
    return oauth2;
  }

  private isInvalidGrant(err: any) {
    const msg = err?.response?.data ?? err?.message ?? String(err);
    const txt = String(msg).toLowerCase();
    return txt.includes('invalid_grant') || txt.includes('refresh_token');
  }

  /** Streaming upload helper: returns { stream, done } */
  async createUploadStream(params: {
    title?: string;
    description?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    ownerId?: string;
  }) {
    const { title, description, privacyStatus = 'unlisted', ownerId = 'owner' } = params;
    const oauth2 = await this.buildOAuthClient(ownerId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2 });

    const pass = new PassThrough();

    const done = youtube.videos
      .insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title: title || 'Lesson Upload', description: description || '' },
          status: { privacyStatus },
        },
        media: { body: pass as any },
      })
      .then((res) => ({
        videoId: res.data.id,
        title: res.data.snippet?.title ?? title ?? '',
        description: res.data.snippet?.description ?? description ?? '',
        privacyStatus: res.data.status?.privacyStatus ?? privacyStatus,
        watchUrl: `https://www.youtube.com/watch?v=${res.data.id}`,
        embedUrl: `https://www.youtube.com/embed/${res.data.id}`,
        data: res.data,
      }))
      .catch(async (err) => {
        if (this.isInvalidGrant(err)) {
          try { await this.tokenService.clearRefreshToken(ownerId); } catch (_) {}
          const e = new Error('REFRESH_TOKEN_INVALID: reauth_required');
          (e as any).code = 'REFRESH_TOKEN_INVALID';
          throw e;
        }
        throw err;
      });

    return { stream: pass, done };
  }

  async uploadVideoFromPath(params: {
    path: string;
    title?: string;
    description?: string;
    privacyStatus?: 'public' | 'unlisted' | 'private';
    ownerId?: string;
  }) {
    const { path, title, description, privacyStatus = 'unlisted', ownerId = 'owner' } = params;
    const oauth2 = await this.buildOAuthClient(ownerId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2 });

    try {
      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title: title || 'Lesson Upload', description: description || '' },
          status: { privacyStatus },
        },
        media: { body: fs.createReadStream(path) as any },
      });

      const videoId = res.data.id!;
      return {
        videoId,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        title: res.data.snippet?.title ?? title ?? '',
        description: res.data.snippet?.description ?? description ?? '',
        privacyStatus: res.data.status?.privacyStatus ?? privacyStatus,
      };
    } catch (err: any) {
      if (this.isInvalidGrant(err)) {
        await this.tokenService.clearRefreshToken(ownerId);
        throw new InternalServerErrorException('REFRESH_TOKEN_INVALID: reauth_required');
      }
      console.error('YouTube upload failed:', err?.response?.data ?? err?.message ?? err);
      throw new InternalServerErrorException(err?.message ?? 'YouTube upload failed');
    } finally {
      try { fs.unlinkSync(path); } catch {}
    }
  }

  async getUploadStatus(videoId: string, ownerId = 'owner') {
    const oauth2 = await this.buildOAuthClient(ownerId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2 });
    const res = await youtube.videos.list({ id: [videoId], part: ['status','processingDetails'] });
    const v = res.data.items?.[0];
    return {
      uploadStatus: v?.status?.uploadStatus,
      processingStatus: v?.processingDetails?.processingStatus,
      failureReason: v?.processingDetails?.processingFailureReason ?? null,
      privacyStatus: v?.status?.privacyStatus,
      embeddable: v?.status?.embeddable,
    };
  }

  async deleteVideo(videoId: string, ownerId = 'owner') {
    const oauth2 = await this.buildOAuthClient(ownerId);
    const youtube = google.youtube({ version: 'v3', auth: oauth2 });
    await youtube.videos.delete({ id: videoId });
    return { ok: true };
  }

  // OAuth helpers
  getAuthUrl() {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    return oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/youtube.upload','profile','email'],
    });
  }

  async exchangeCodeForToken(code: string, ownerId = 'owner') {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    const { tokens } = await oauth2.getToken(code);
    if (tokens.refresh_token) {
      await this.tokenService.saveRefreshToken(ownerId, tokens.refresh_token);
    }
    return tokens;
  }
}


