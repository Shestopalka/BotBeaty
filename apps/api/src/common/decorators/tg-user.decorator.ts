import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TelegramUser } from '../../modules/auth/telegram-auth.service';

/**
 * Витягує TelegramUser з request.
 * Використання: @TgUser() user: TelegramUser
 */
export const TgUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TelegramUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.telegramUser;
  },
);
