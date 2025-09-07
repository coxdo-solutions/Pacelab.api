// src/setup/setup.module.ts (optional)
import { Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { UsersModule } from '../users/users.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [UsersModule, ConfigModule],
  controllers: [SetupController],
})
export class SetupModule {}
