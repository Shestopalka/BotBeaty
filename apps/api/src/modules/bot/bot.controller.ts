import { Controller, Post, Param, Req, HttpCode } from '@nestjs/common';
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
  async platformWebhook(@Req() req: Request) {
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
  ) {
    await this.botService.handleMasterUpdate(masterId, req.body);
    return { ok: true };
  }
}
