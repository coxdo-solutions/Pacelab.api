// src/setup/setup.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post, Headers, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

class BootstrapAdminDto {
  email: string;
  password: string;
  name?: string;
}

@Controller('setup')
export class SetupController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  // One-time bootstrap endpoint — protected by BOOTSTRAP_TOKEN header
  @Post('bootstrap-admin')
  @HttpCode(HttpStatus.CREATED)
  async bootstrapAdmin(
    @Body() body: BootstrapAdminDto,
    @Headers('x-bootstrap-token') token: string,
  ) {
    const expected = this.configService.get<string>('BOOTSTRAP_TOKEN');
    if (!expected || token !== expected) {
      return { ok: false, message: 'Invalid bootstrap token' };
    }

    const { email, password, name } = body;
    if (!email || !password) {
      return { ok: false, message: 'email and password required' };
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      return { ok: true, message: 'Admin already exists', email: existing.email };
    }

    const hashed = await bcrypt.hash(password, 10);

    // Adjust fields to match your UsersService.create signature if different
    const createPayload: any = {
      email,
      password: hashed,
      name: name ?? 'Bootstrap Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
    };

    const created = await this.usersService.create(createPayload);
    const { password: _pw, ...safe } = created as any;

    return { ok: true, message: 'Admin created', user: safe };
  }
}
