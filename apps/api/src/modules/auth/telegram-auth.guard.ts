import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelegramAuthService } from './telegram-auth.service';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(
    private telegramAuth: TelegramAuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const initData = request.headers['x-telegram-init-data'];

    if (!initData) {
      // Dev-байпас дозволений ЛИШЕ коли явно увімкнено окремим прапорцем,
      // щоб випадковий NODE_ENV=development у проді не вимкнув автентифікацію.
      if (
        process.env.NODE_ENV !== 'production' &&
        process.env.ALLOW_DEV_AUTH_BYPASS === 'true'
      ) {
        // DEV_TELEGRAM_ID — реальний telegramId з .env для локального тестування
        const devId = parseInt(process.env.DEV_TELEGRAM_ID ?? '0', 10);
        request.telegramUser = { id: devId, first_name: 'Dev User' };
        await this.attachMaster(request);
        return true;
      }
      throw new UnauthorizedException('X-Telegram-Init-Data заголовок відсутній');
    }

    try {
      // Авто-детекція: platform token або token бота майстра
      const parsed = await this.telegramAuth.validateAutoDetect(initData);
      request.telegramUser = parsed.user;
      await this.attachMaster(request);
      return true;
    } catch {
      // Можливо клієнт відкриває Mini App майстра — перевіряємо через X-Master-Id
      const masterId = request.headers['x-master-id'];
      if (masterId) {
        try {
          const parsed = await this.telegramAuth.validateForClient(initData, masterId);
          request.telegramUser = parsed.user;
          await this.attachMaster(request);
          return true;
        } catch (clientErr) {
          throw new UnauthorizedException(clientErr.message);
        }
      }
      throw new UnauthorizedException('Невалідний підпис initData');
    }
  }

  /**
   * Резолвить майстра за telegramId автентифікованого користувача та кладе
   * його id у request.masterId. Для клієнтів (не майстрів) лишається undefined.
   * Це джерело правди для ownership — контролери НЕ довіряють masterId від клієнта.
   */
  private async attachMaster(request: any): Promise<void> {
    const telegramId = request.telegramUser?.id;
    if (!telegramId) return;
    request.masterId =
      (await this.telegramAuth.findMasterIdByTelegramId(String(telegramId))) ?? undefined;
  }
}
