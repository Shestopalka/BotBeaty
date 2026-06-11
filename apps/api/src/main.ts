import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync } from 'fs';
import { AppModule } from './app.module';
import { TelegramAuthGuard } from './modules/auth/telegram-auth.guard';
import { TelegramAuthService } from './modules/auth/telegram-auth.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Глобальна валідація DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // Відкидати зайві поля
      forbidNonWhitelisted: true,
      transform: true,       // Авто-трансформація типів
    }),
  );

  // CORS для Mini App
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? process.env.MINI_APP_URL : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data', 'X-Master-Id'],
    credentials: true,
  });

  // Глобальний Telegram auth guard
  const reflector = app.get(Reflector);
  const telegramAuthService = app.get(TelegramAuthService);
  app.useGlobalGuards(new TelegramAuthGuard(telegramAuthService, reflector));

  app.setGlobalPrefix('api/v1');

  // ─── Роздаємо Mini App static files ────────────────────────────────────────
  // Шлях відносно кореня монорепо: apps/mini-app/dist
  // __dirname = apps/api/dist → .. → apps/api → .. → apps → mini-app/dist
  const miniAppDist = join(__dirname, '..', '..', 'mini-app', 'dist');
  if (existsSync(miniAppDist)) {
    // Статичні assets (JS, CSS, images)
    const staticHeaders = (res: any) => {
      res.setHeader('ngrok-skip-browser-warning', '1');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      // Telegram WKWebView надсилає crossorigin CORS-запити — дозволяємо все
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    };
    app.useStaticAssets(miniAppDist, { setHeaders: staticHeaders });
    // SPA fallback: всі не-API маршрути → index.html
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.get(/^(?!\/api).*/, (_req: any, res: any) => {
      staticHeaders(res);
      res.sendFile(join(miniAppDist, 'index.html'));
    });
    console.log(`📱 Mini App served from: ${miniAppDist}`);
  } else {
    console.warn('⚠️  Mini App dist not found. Run: cd apps/mini-app && npm run build');
  }
  // ───────────────────────────────────────────────────────────────────────────

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') || 3000;

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 BeatyBOT API запущено на порту ${port}`);
}

bootstrap();
