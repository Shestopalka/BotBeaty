import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Master } from '../../../database/entities/master.entity';

/**
 * Головне меню майстра в його боті.
 * Викликається при команді /menu або /start якщо майстер пише своєму боту.
 */
@Injectable()
export class BotMasterMenuHandler {
  constructor(private configService: ConfigService) {}

  async sendMainMenu(ctx: any, master: Master): Promise<void> {
    const miniAppUrl = this.configService.get<string>('miniApp.url');

    await ctx.reply(
      `👋 Привіт, ${master.fullName}!\n\nОберіть дію:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📅 Мій розклад',
                web_app: { url: `${miniAppUrl}/master/schedule` },
              },
            ],
            [
              {
                text: '👥 Клієнти',
                web_app: { url: `${miniAppUrl}/master/clients` },
              },
              {
                text: '💅 Послуги',
                web_app: { url: `${miniAppUrl}/master/services` },
              },
            ],
            [
              {
                text: '📊 Аналітика',
                web_app: { url: `${miniAppUrl}/master/analytics` },
              },
            ],
            [
              {
                text: '⚙️ Налаштування',
                web_app: { url: `${miniAppUrl}/master/settings` },
              },
            ],
          ],
        },
      },
    );
  }
}
