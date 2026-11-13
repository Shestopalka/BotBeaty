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

/**
 * Id майстра, чиїм ботом підписано initData (null — платформений бот).
 * Клієнтська ідентичність, підписана ботом майстра X, валідна лише для даних X.
 */
export const AuthBotMasterId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | null => {
    return ctx.switchToHttp().getRequest().authBotMasterId ?? null;
  },
);
