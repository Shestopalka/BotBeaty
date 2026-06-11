import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../modules/auth/telegram-auth.guard';

/**
 * Позначає endpoint як публічний — без Telegram auth.
 * Використовується для webhook-ів та публічних ендпоінтів.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
