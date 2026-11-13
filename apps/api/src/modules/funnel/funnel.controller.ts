import { Controller, Post, Body, BadRequestException, HttpCode } from '@nestjs/common';
import { TgUser } from '../../common/decorators/tg-user.decorator';
import { TelegramUser } from '../auth/telegram-auth.service';
import { FunnelService } from './funnel.service';
import { FunnelEventName } from '../../database/entities/funnel-event.entity';

// З mini-app приймаємо лише кроки онбордингу. bot_start і registered пише сервер.
const CLIENT_EVENTS = new Set<string>([
  FunnelEventName.ONBOARDING_OPEN,
  FunnelEventName.ONBOARDING_TOKEN_STEP,
]);

@Controller('funnel')
export class FunnelController {
  constructor(private readonly funnel: FunnelService) {}

  // Не @Public: guard перевіряє initData, telegramId беремо з нього, а не з тіла.
  @Post('event')
  @HttpCode(204)
  async track(@Body() body: { event?: string }, @TgUser() user: TelegramUser): Promise<void> {
    if (!body?.event || !CLIENT_EVENTS.has(body.event)) {
      throw new BadRequestException('Невідома подія');
    }
    await this.funnel.track(user?.id, body.event as FunnelEventName);
  }
}
