import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Telegraf } from 'telegraf';
import { Master, MasterStatus } from '../../../database/entities/master.entity';

export enum RegistrationStep {
  AWAITING_TOKEN = 'awaiting_token',
  AWAITING_NAME = 'awaiting_name',
  AWAITING_SPECIALTY = 'awaiting_specialty',
}

interface RegistrationSession {
  step: RegistrationStep;
  botToken?: string;
  fullName?: string;
}

@Injectable()
export class BotRegistrationHandler {
  private readonly logger = new Logger(BotRegistrationHandler.name);

  // telegramId -> поточний стан реєстрації
  readonly sessions = new Map<string, RegistrationSession>();

  constructor(
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
  ) {}

  startRegistration(telegramId: string) {
    this.sessions.set(telegramId, { step: RegistrationStep.AWAITING_TOKEN });
  }

  async handle(telegramId: string, text: string, ctx: any, masterBots: Map<string, Telegraf>): Promise<void> {
    const session = this.sessions.get(telegramId);
    if (!session) return;

    if (session.step === RegistrationStep.AWAITING_TOKEN) {
      await this.handleToken(telegramId, text, ctx, session);
    } else if (session.step === RegistrationStep.AWAITING_NAME) {
      await this.handleName(telegramId, text, ctx, session, masterBots);
    }
  }

  private async handleToken(telegramId: string, text: string, ctx: any, session: RegistrationSession) {
    const tokenRegex = /^\d+:[A-Za-z0-9_-]{35,}$/;
    if (!tokenRegex.test(text.trim())) {
      await ctx.reply('❌ Невірний формат токену. Скопіюйте токен напряму з @BotFather.');
      return;
    }

    await ctx.reply('⏳ Перевіряємо токен...');

    try {
      // Валідуємо токен через Telegram API
      const tempBot = new Telegraf(text.trim());
      await tempBot.telegram.getMe();

      // Перевіряємо чи не зайнятий
      const tokenExists = await this.masterRepo.findOne({ where: { botToken: text.trim() } });
      if (tokenExists) {
        await ctx.reply('❌ Цей токен вже використовується. Створіть нового бота в @BotFather.');
        return;
      }

      session.botToken = text.trim();
      session.step = RegistrationStep.AWAITING_NAME;

      await ctx.reply('✅ Токен валідний!\n\nВведіть ваше ім\'я та прізвище:');
    } catch (err) {
      this.logger.error(`Невалідний токен: ${err.message}`);
      await ctx.reply('❌ Токен недійсний. Перевірте і спробуйте ще раз.');
    }
  }

  private async handleName(
    telegramId: string,
    text: string,
    ctx: any,
    session: RegistrationSession,
    masterBots: Map<string, Telegraf>,
  ) {
    if (text.trim().length < 2) {
      await ctx.reply('❌ Введіть справжнє ім\'я (мінімум 2 символи).');
      return;
    }

    session.fullName = text.trim();

    await ctx.reply('⏳ Реєструємо вас...');

    try {
      const bot = new Telegraf(session.botToken);
      const botInfo = await bot.telegram.getMe();

      // Створюємо майстра в БД
      const master = this.masterRepo.create({
        telegramId,
        username: ctx.from?.username,
        fullName: session.fullName,
        botToken: session.botToken,
        botUsername: botInfo.username,
        status: MasterStatus.ACTIVE,
        specialties: [],
      });

      const saved = await this.masterRepo.save(master);

      // Авто Menu Button
      const miniAppUrl = process.env.MINI_APP_URL || '';
      await bot.telegram.setChatMenuButton({
        menuButton: {
          type: 'web_app',
          text: '📅 Мій кабінет',
          web_app: { url: `${miniAppUrl}/master/schedule` },
        },
      });

      // Команди майстра
      await bot.telegram.setMyCommands([
        { command: 'menu',     description: 'Відкрити кабінет майстра' },
        { command: 'schedule', description: 'Мій розклад' },
        { command: 'clients',  description: 'Список клієнтів' },
        { command: 'slots',    description: 'Управління слотами' },
      ]);

      bot.launch();

      masterBots.set(saved.id, bot);

      this.sessions.delete(telegramId);

      await ctx.reply(
        `🎉 Готово! Ваш бот @${botInfo.username} активний.\n\n` +
        `Поділіться посиланням з клієнтами:\n` +
        `👉 https://t.me/${botInfo.username}`,
      );
    } catch (err) {
      this.logger.error(`Помилка створення майстра: ${err.message}`);
      await ctx.reply('❌ Щось пішло не так. Спробуйте знову /start');
      this.sessions.delete(telegramId);
    }
  }
}
