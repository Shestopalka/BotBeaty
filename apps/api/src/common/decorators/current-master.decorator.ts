import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Повертає id майстра, який РЕЗОЛВНУТО на сервері з автентифікованого
 * Telegram-користувача (request.masterId, виставляється у TelegramAuthGuard).
 *
 * Це єдине довірене джерело masterId. Контролери НЕ мають приймати masterId
 * з body/params/query — інакше будь-який майстер міг би діяти від імені іншого.
 *
 * Кидає 403, якщо користувач не зареєстрований як майстер.
 */
export const CurrentMasterId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const masterId: string | undefined = request.masterId;
    if (!masterId) {
      throw new ForbiddenException('Доступ лише для зареєстрованих майстрів');
    }
    return masterId;
  },
);

/**
 * Те саме, але не кидає помилку, якщо користувач не майстер — повертає undefined.
 * Для ендпоінтів, які обслуговують і майстрів, і клієнтів (напр. зміна статусу).
 */
export const OptionalMasterId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    return ctx.switchToHttp().getRequest().masterId ?? undefined;
  },
);
