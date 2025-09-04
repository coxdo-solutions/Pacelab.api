import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    // If you use custom loggers, you can buffer logs until app is ready:
    // bufferLogs: true,
  });

  // Trust proxy (Render/Cloudflare/etc.) so secure cookies & protocol detection work
  // @ts-ignore
  app.set('trust proxy', 1);

  // Global API prefix (keeps routes tidy; Swagger path below matches this)
  app.setGlobalPrefix('api');

  // Security headers
  app.use(
    helmet({
      // Disable/relax CSP in dev to avoid blocking Swagger assets
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Swagger often needs this relaxed:
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Request size limits
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  // Gzip
  app.use(compression());

  // Cookies
  app.use(cookieParser());

  // ---- CORS (Render/Cloudflare/Vercel/localhost) ----
  const envAllowList =
    (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

  const defaultAllow = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...envAllowList,
  ];

  const isAllowedByPattern = (origin: string) => {
    try {
      const url = new URL(origin);
      const host = url.host; // e.g. myapp.vercel.app
      return (
        host.endsWith('.vercel.app') ||
        host.endsWith('.onrender.com') ||
        host.endsWith('.trycloudflare.com') ||
        host.startsWith('localhost:') ||
        host.startsWith('127.0.0.1:')
      );
    } catch {
      return false;
    }
  };

  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      // Allow SSR, mobile apps, curl (no origin)
      if (!origin) return callback(null, true);

      if (defaultAllow.includes(origin) || isAllowedByPattern(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: Origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  };

  app.enableCors(corsOptions);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  // ---- Swagger (toggle via SWAGGER_ENABLED) ----
  const swaggerEnabled = (process.env.SWAGGER_ENABLED || '').toLowerCase() === 'true' || process.env.NODE_ENV !== 'production';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PaceLab LMS API')
      .setDescription('API documentation for the LMS backend')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'bearer',
      )
      .addCookieAuth('token', { type: 'apiKey', in: 'cookie' })
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // path = /api/docs because of global prefix 'api'
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Graceful shutdown (Render sends SIGTERM on deploy/scale)
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 LMS Backend running on :${port}`);
  if (swaggerEnabled) {
    logger.log(`📚 Swagger Docs at /api/docs`);
  }
}

bootstrap();
