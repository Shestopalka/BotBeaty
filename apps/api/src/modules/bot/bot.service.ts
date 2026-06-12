import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Telegraf } from 'telegraf';
import { Master, MasterStatus } from '../../database/entities/master.entity';
import { BotRegistrationHandler } from './handlers/registration.handler';
import { AppointmentCallbackHandler } from './handlers/appointment-callback.handler';
import { ClientBotHandler } from './handlers/client-bot.handler';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  private platformBot: Telegraf;

  // masterId -> Telegraf instance
  readonly masterBots = new Map<string, Telegraf>();

  constructor(
    private configService: ConfigService,
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
    private registrationHandler: BotRegistrationHandler,
    private appointmentCallbackHandler: AppointmentCallbackHandler,
    private clientBotHandler: ClientBotHandler,
  ) {}

  async onModuleInit() {
    await this.initPlatformBot();
    await this.loadMasterBots();
    this.registerShutdownHooks();
  }

  private registerShutdownHooks() {
    const stop = async () => {
      this.logger.log('Зупинка ботів...');
      const stops: Promise<void>[] = [];
      if (this.platformBot) stops.push(Promise.resolve(this.platformBot.stop()));
      for (const bot of this.masterBots.values()) stops.push(Promise.resolve(bot.stop()));
      await Promise.allSettled(stops);
      this.logger.log('Всі боти зупинені');
      process.exit(0);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }

  // ─── Платформний бот ──────────────────────────────────────────────────────

  private async initPlatformBot() {
    const token = this.configService.get<string>('telegram.platformBotToken');
    if (!token) {
      this.logger.warn('PLATFORM_BOT_TOKEN не знайдено');
      return;
    }

    this.platformBot = new Telegraf(token);
    this.setupPlatformHandlers();

    const webhookUrl = this.configService.get<string>('telegram.webhookBaseUrl');
    if (webhookUrl) {
      await this.platformBot.telegram.setWebhook(`${webhookUrl}/api/v1/bot/webhook/platform`);
      this.logger.log('Platform bot webhook встановлено');
    } else {
      await this.platformBot.telegram.deleteWebhook({ drop_pending_updates: true });
      this.launchWithRetry(this.platformBot, 'PlatformBot');
      this.logger.log('Platform bot запущено в режимі polling');
    }
  }

  private setupPlatformHandlers() {
    const miniAppUrl = this.configService.get<string>('miniApp.url');

    this.platformBot.start(async (ctx) => {
      await ctx.reply(
        '👋 Вітаємо в <b>BeatyBOT</b>!\n\n' +
        'Платформа для б\'юті-майстрів.\n\n' +
        'Натисніть кнопку нижче, щоб зареєструватись і отримати власного бота 👇',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '✨ Зареєструватись як майстер',
                web_app: { url: `${miniAppUrl}/onboarding` },
              }
            ]]
          }
        }
      );
    });
  }

  // ─── Боти майстрів ────────────────────────────────────────────────────────

  async loadMasterBots() {
    const masters = await this.masterRepo.find({
      where: { status: MasterStatus.ACTIVE },
    });
    for (const master of masters) {
      if (master.botToken) await this.startMasterBot(master);
    }
    this.logger.log(`Завантажено ${this.masterBots.size} ботів майстрів`);
  }

  async registerMasterBot(master: Master, botToken: string, dryRun = false): Promise<{ username: string }> {
    const tempBot = new Telegraf(botToken);
    const botInfo = await tempBot.telegram.getMe();

    // dryRun — лише валідація токену, без збереження в БД і без запуску
    if (dryRun) return { username: botInfo.username };

    await this.masterRepo.update(master.id, {
      botToken,
      botUsername: botInfo.username,
      status: MasterStatus.ACTIVE,
    });

    master.botToken = botToken;
    master.botUsername = botInfo.username;

    // Встановлюємо Menu Button — "📅 Мій кабінет" відкриває Mini App
    const miniAppUrl = this.configService.get<string>('miniApp.url');
    await tempBot.telegram.setChatMenuButton({
      menuButton: {
        type: 'web_app',
        text: '📅 Мій кабінет',
        web_app: { url: `${miniAppUrl}/master/schedule` },
      },
    });

    // Встановлюємо команди бота
    await tempBot.telegram.setMyCommands([
      { command: 'menu',     description: 'Відкрити кабінет майстра' },
      { command: 'schedule', description: 'Мій розклад' },
      { command: 'clients',  description: 'Список клієнтів' },
      { command: 'slots',    description: 'Управління слотами' },
    ]);

    const webhookUrl = this.configService.get<string>('telegram.webhookBaseUrl');
    if (webhookUrl) {
      await tempBot.telegram.setWebhook(`${webhookUrl}/api/v1/bot/webhook/${master.id}`);
    }

    await this.startMasterBot(master);
    return { username: botInfo.username };
  }

  /**
   * Активує вже збереженого майстра — запускає його бота
   */
  async activateMasterBot(master: Master): Promise<void> {
    await this.startMasterBot(master);
  }

  private async startMasterBot(master: Master) {
    try {
      // Зупиняємо попередній екземпляр якщо є
      const existing = this.masterBots.get(master.id);
      if (existing) {
        existing.stop();
        this.masterBots.delete(master.id);
      }

      const bot = new Telegraf(master.botToken);
      // Перевіряємо токен перед запуском
      await bot.telegram.getMe();

      // Menu button з актуальним URL при кожному старті.
      // ДЕФОЛТНА (для всіх, тобто КЛІЄНТІВ) → запис; кабінет клієнту не потрібен.
      const miniAppUrl = this.configService.get<string>('miniApp.url');
      await bot.telegram.setChatMenuButton({
        menuButton: {
          type: 'web_app',
          text: '📅 Записатись',
          web_app: { url: `${miniAppUrl}/book/${master.id}` },
        },
      }).catch(e => this.logger.warn(`Не вдалось оновити default menu button: ${e.message}`));

      // ОСОБИСТИЙ чат майстра → «Мій кабінет» (перекриває дефолтну лише для нього).
      const masterChatId = Number(master.telegramId);
      if (Number.isSafeInteger(masterChatId)) {
        await bot.telegram.setChatMenuButton({
          chatId: masterChatId,
          menuButton: {
            type: 'web_app',
            text: '📅 Мій кабінет',
            web_app: { url: `${miniAppUrl}/master/home` },
          },
        }).catch(e => this.logger.warn(`Не вдалось оновити menu button майстра: ${e.message}`));
      }

      this.setupMasterBotHandlers(bot, master);
      this.masterBots.set(master.id, bot);

      const webhookUrl = this.configService.get<string>('telegram.webhookBaseUrl');
      if (webhookUrl) {
        // Перереєструємо вебхук на актуальний URL при КОЖНОМУ старті —
        // інакше після зміни тунелю (ngrok/cloudflared) кнопки майстра
        // летітимуть на старий мертвий URL.
        await bot.telegram
          .setWebhook(`${webhookUrl}/api/v1/bot/webhook/${master.id}`, {
            drop_pending_updates: true,
          })
          .catch(e => this.logger.warn(`Не вдалось оновити webhook майстра: ${e.message}`));
      } else {
        // Скидаємо попередню polling-сесію перед запуском
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        this.launchWithRetry(bot, master.botUsername ?? master.id);
      }
    } catch (e) {
      this.logger.error(`Не вдалось запустити бота майстра ${master.id}: ${e.message}`);
      // Деактивуємо майстра з невалідним токеном
      await this.masterRepo.update(master.id, { status: MasterStatus.INACTIVE });
    }
  }

  private setupMasterBotHandlers(bot: Telegraf, master: Master) {
    const miniAppUrl = this.configService.get<string>('miniApp.url');

    // ─── /start для КЛІЄНТА ──────────────────────────────────────────────
    bot.start(async (ctx) => {
      const telegramId = String(ctx.from.id);

      // Якщо пише сам майстер — показуємо меню майстра
      if (telegramId === master.telegramId) {
        await this.sendMasterMenu(ctx, master);
        return;
      }

      // Інакше — клієнтський вітальний екран
      await this.clientBotHandler.handleStart(ctx, master);
    });

    // ─── Команди майстра ────────────────────────────────────────────────
    bot.command('menu', async (ctx) => {
      if (String(ctx.from.id) !== master.telegramId) return;
      await this.sendMasterMenu(ctx, master);
    });

    bot.command('schedule', async (ctx) => {
      if (String(ctx.from.id) !== master.telegramId) return;
      await ctx.reply('📅 Відкрити розклад:', {
        reply_markup: {
          inline_keyboard: [[{
            text: '📅 Розклад',
            web_app: { url: `${miniAppUrl}/master/schedule` },
          }]]
        }
      });
    });

    bot.command('clients', async (ctx) => {
      if (String(ctx.from.id) !== master.telegramId) return;
      await ctx.reply('👥 Список клієнтів:', {
        reply_markup: {
          inline_keyboard: [[{
            text: '👥 Клієнти',
            web_app: { url: `${miniAppUrl}/master/clients` },
          }]]
        }
      });
    });

    bot.command('slots', async (ctx) => {
      if (String(ctx.from.id) !== master.telegramId) return;
      await ctx.reply('🕐 Управління слотами:', {
        reply_markup: {
          inline_keyboard: [[{
            text: '🕐 Слоти',
            web_app: { url: `${miniAppUrl}/master/slots` },
          }]]
        }
      });
    });

    // ─── Callback кнопки підтвердження/скасування ─────────────────────
    bot.on('callback_query', async (ctx) => {
      const data: string = (ctx.callbackQuery as any)?.data ?? '';

      if (data === 'my_appointments') {
        await this.clientBotHandler.handleMyAppointments(ctx, master);
        return;
      }
      if (data === 'contact_master') {
        await this.clientBotHandler.handleContactMaster(ctx, master);
        return;
      }

      // Кнопки для майстра (confirm/cancel/complete)
      if (
        data.startsWith('confirm_apt:') ||
        data.startsWith('cancel_apt:') ||
        data.startsWith('complete_apt:')
      ) {
        await this.appointmentCallbackHandler.handle(ctx, master.id);
        return;
      }
    });
  }

  // ─── Меню майстра ─────────────────────────────────────────────────────────

  private async sendMasterMenu(ctx: any, master: Master) {
    const miniAppUrl = this.configService.get<string>('miniApp.url');

    await ctx.reply(
      `👋 <b>${master.fullName}</b>, вітаємо!\n\nОберіть розділ:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '📅 Розклад',
              web_app: { url: `${miniAppUrl}/master/schedule` },
            }],
            [
              { text: '🕐 Слоти', web_app: { url: `${miniAppUrl}/master/slots` } },
              { text: '👥 Клієнти', web_app: { url: `${miniAppUrl}/master/clients` } },
            ],
            [
              { text: '💅 Послуги', web_app: { url: `${miniAppUrl}/master/services` } },
              { text: '📊 Аналітика', web_app: { url: `${miniAppUrl}/master/analytics` } },
            ],
            [{
              text: '⚙️ Налаштування',
              web_app: { url: `${miniAppUrl}/master/settings` },
            }],
          ],
        },
      },
    );
  }

  // ─── Webhook routing ──────────────────────────────────────────────────────

  async handlePlatformUpdate(update: any) {
    if (this.platformBot) await this.platformBot.handleUpdate(update);
  }

  async handleMasterUpdate(masterId: string, update: any) {
    const bot = this.masterBots.get(masterId);
    if (bot) await bot.handleUpdate(update);
    else this.logger.warn(`Бот майстра ${masterId} не знайдено`);
  }

  // ─── Надсилання повідомлень ───────────────────────────────────────────────

  async sendToClient(masterId: string, telegramId: string, message: string, extra?: any) {
    const bot = this.masterBots.get(masterId);
    if (!bot) throw new Error(`Бот майстра ${masterId} не активний`);
    await bot.telegram.sendMessage(telegramId, message, extra);
  }

  async sendToMaster(master: Master, message: string, extra?: any) {
    const bot = this.masterBots.get(master.id);
    if (!bot) throw new Error(`Бот майстра ${master.id} не активний`);
    await bot.telegram.sendMessage(master.telegramId, message, extra);
  }

  // ─── Retry launch на 409 ─────────────────────────────────────────────────

  private launchWithRetry(bot: Telegraf, name: string, attempt = 1) {
    bot.launch().catch(async (e: any) => {
      if (e?.response?.error_code === 409) {
        // Telegram polling timeout = 50с. Чекаємо фіксовано 12с між спробами.
        // Після 10 спроб (~2 хвилини) — завершуємо, але процес не падає.
        if (attempt <= 10) {
          this.logger.warn(`${name}: 409 конфлікт polling, retry через 12с (спроба ${attempt}/10)`);
          await new Promise(r => setTimeout(r, 12000));
          this.launchWithRetry(bot, name, attempt + 1);
        } else {
          this.logger.error(`${name}: не вдалось запустити polling після 10 спроб. Запусти: killall -9 node`);
        }
      } else {
        this.logger.error(`${name} polling помилка: ${e.message}`);
      }
    });
  }

  getPlatformBot(): Telegraf { return this.platformBot; }
}
