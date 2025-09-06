import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto } from '../users/dto/create-user.dto'; // keep if exists, else change to correct DTO path

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private redisService: RedisService,
  ) {}

  /**
   * Validate credentials and return a safe user object (without password) or null.
   */
  async validateUser(email: string, password: string) {
    console.log('🔑 Validating user:', email);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      console.log('❌ User not found');
      return null;
    }

    // If your DB stores hashed password in `user.password`
    if (!(user as any).password) {
      console.log('❌ No password on user record');
      return null;
    }

    const passwordValid = await bcrypt.compare(password, (user as any).password);
    console.log('🔒 Password valid:', passwordValid);

    if (!passwordValid) return null;

    // Build safe user without password (DB record may or may not include password)
    const { password: _pw, ...safe } = (user as any);
    return safe;
  }

  /**
   * Sign a JWT and store session in Redis.
   * Accepts either a full user record or a minimal user-like object containing id/email/role.
   */
  async login(user: any) {
    if (!user || !user.id) {
      throw new UnauthorizedException('Invalid user for login');
    }

    console.log('✅ Login success for:', user.email ?? user.id);

    const payload = { sub: user.id, email: user.email, role: user.role };

    const token = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });

    // Save session in Redis with TTL = 1 hour
    try {
      await this.redisService.set(`session:${user.id}`, { token, user }, 3600);
      console.log('🎟️ JWT generated and session cached for:', user.email ?? user.id);
    } catch (err) {
      console.warn('⚠️ Redis save failed (continuing):', (err as any)?.message ?? err);
    }

    return {
      access_token: token,
      user,
    };
  }

  async logout(userId: string) {
    await this.redisService.del(`session:${userId}`);
    console.log('🛑 Session cleared for user:', userId);
    return { message: 'Logged out successfully' };
  }

  /**
   * Register (create) a new user and optionally auto-login.
   */
  async register(registerDto: RegisterDto) {
    const { email, password, name, ...rest } = registerDto;
    console.log('🆕 Register attempt for:', email);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      console.log('⚠️  Email already in use:', email);
      throw new ConflictException('Email already in use');
    }

    const saltRounds = 10;
    const hashed = await bcrypt.hash(password, saltRounds);

    // Ensure CreateUserDto required fields satisfied. If your CreateUserDto has optional name, adjust accordingly.
    const createPayload: CreateUserDto = {
      email,
      password: hashed,
      // if name is required by CreateUserDto, provide a default string; better to make it optional in DTO
      name: typeof name === 'string' ? name : '',
      ...(rest as any),
    };

    const created = await this.usersService.create(createPayload);

    // The created record may not include password field (typical). Don't destructure password.
    const safeUser = (({ password: _pw, ...u }) => u)(created as any);

    // Auto-login: create a lightweight payload for token
    const loginPayload = {
      id: (created as any).id,
      email: (created as any).email,
      role: (created as any).role,
    };

    const result = await this.login(loginPayload);
    result.user = safeUser;

    return result;
  }
}
