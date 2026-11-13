import { Controller, Post, Param, Req, HttpCode, Headers, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { BotService } from './bot.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  /**
   * Webhook для платформного бота (реєстрація майстрів)
   */
  @Public()
  @Post('webhook/platform')
  @HttpCode(200)
  async platformWebhook(
    @Req() req: Request,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    if (!this.botService.isValidWebhookSecret('platform', secret)) {
      throw new UnauthorizedException();
    }
    await this.botService.handlePlatformUpdate(req.body);
    return { ok: true };
  }

  /**
   * Webhook для бота конкретного майстра
   * Telegram шле апдейти на: POST /api/v1/bot/webhook/:masterId
   */
  @Public()
  @Post('webhook/:masterId')
  @HttpCode(200)
  async masterWebhook(
    @Param('masterId') masterId: string,
    @Req() req: Request,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    // Без секрету будь-хто міг би надіслати фейковий апдейт (напр. confirm_apt).
    if (!this.botService.isValidWebhookSecret(masterId, secret)) {
      throw new UnauthorizedException();
    }
    await this.botService.handleMasterUpdate(masterId, req.body);
    return { ok: true };
  }
}
