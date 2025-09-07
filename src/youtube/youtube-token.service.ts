import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Injectable()
export class YoutubeTokenService {
  private readonly defaultOwner = 'owner';

  async getRefreshToken(ownerId = this.defaultOwner): Promise<string | null> {
    const row = await prisma.oAuthToken.findUnique({ where: { ownerId } });
    return row?.refreshToken ?? null;
  }

  async saveRefreshToken(ownerId = this.defaultOwner, refreshToken: string) {
    return prisma.oAuthToken.upsert({
      where: { ownerId },
      update: { refreshToken },
      create: { ownerId, refreshToken },
    });
  }

  async clearRefreshToken(ownerId = this.defaultOwner) {
    // deleteMany avoids throwing if no row exists
    return prisma.oAuthToken.deleteMany({ where: { ownerId } });
  }
}
