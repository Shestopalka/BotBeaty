import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Master } from '../../../database/entities/master.entity';
import { Client, ClientTag } from '../../../database/entities/client.entity';
import { Appointment, AppointmentStatus } from '../../../database/entities/appointment.entity';
import { AppointmentService } from '../../appointment/appointment.service';

const SPECIALTY_LABELS: Record<string, string> = {
  manicure: '💅 Манікюр', pedicure: '🦶 Педикюр', eyelashes: '👁️ Вії',
  makeup: '💄 Макіяж', hairdresser: '✂️ Перукар', tattoo: '🖊️ Тату',
  eyebrows: '🪮 Брови', massage: '🤲 Масаж', cosmetology: '✨ Косметологія',
  other: '💫 Інше',
};

/**
 * Обробляє команди клієнтів в боті майстра.
 */
@Injectable()
export class ClientBotHandler {
  private readonly logger = new Logger(ClientBotHandler.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    private appointmentService: AppointmentService,
  ) {}

  /**
   * Клієнт пише /start — показуємо профіль майстра і кнопку запису
   */
  async handleStart(ctx: any, master: Master) {
    const miniAppUrl = this.configService.get<string>('miniApp.url');

    // Примусово виставляємо menu-кнопку САМЕ для цього чату клієнта → "Записатись".
    // Клієнту кабінет майстра не потрібен; per-chat кнопка перекриває кеш дефолту.
    const chatId = ctx.chat?.id;
    if (chatId) {
      await ctx.telegram.setChatMenuButton({
        chatId,
        menuButton: {
          type: 'web_app',
          text: '📅 Записатись',
          web_app: { url: `${miniAppUrl}/book/${master.id}` },
        },
      }).catch(() => {});
    }

    const specialties = (master.specialties ?? [])
      .map(s => SPECIALTY_LABELS[s] ?? s)
      .join(' · ');

    await ctx.reply(
      `👋 <b>Вітаємо!</b>\n\n` +
      `Ви звернулися до <b>${master.fullName}</b>\n` +
      (specialties ? `✨ ${specialties}\n` : '') +
      (master.city ? `📍 ${master.city}\n` : '') +
      (master.bio ? `\n${master.bio}\n` : '') +
      `\nОберіть дію 👇`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{
              text: '📅 Записатись онлайн',
              web_app: { url: `${miniAppUrl}/book/${master.id}` },
            }],
            [{ text: '📋 Мої записи', callback_data: 'my_appointments' }],
            [{ text: '💬 Написати майстру', callback_data: 'contact_master' }],
          ],
        },
      },
    );
  }

  /**
   * Клієнт натискає "Мої записи"
   */
  async handleMyAppointments(ctx: any, master: Master) {
    await ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);

    const client = await this.clientRepo.findOne({
      where: { telegramId, masterId: master.id },
    });

    if (!client) {
      await ctx.reply('У вас ще немає записів. Натисніть "Записатись онлайн" 👆');
      return;
    }

    const appointments = await this.appointmentRepo.find({
      where: {
        clientId: client.id,
        masterId: master.id,
      },
      relations: ['service', 'slot'],
      order: { createdAt: 'DESC' },
      take: 5,
    });

    if (!appointments.length) {
      await ctx.reply('У вас ще немає записів.');
      return;
    }

    const STATUS_EMOJI: Record<string, string> = {
      pending: '⏳', confirmed: '✅', completed: '🌟',
      cancelled_client: '❌', cancelled_master: '❌', no_show: '🚫',
    };

    const now = Date.now();
    const cancelButtons: any[][] = [];

    const lines = appointments.map(apt => {
      // service/slot можуть бути null (напр. послугу видалили) — не падаємо
      const startMs = apt.slot?.startAt ? new Date(apt.slot.startAt).getTime() : 0;
      const time = startMs
        ? new Date(startMs).toLocaleString('uk-UA', {
            timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short',
          })
        : 'час не вказано';
      const serviceName = apt.service?.name ?? 'Послуга';

      // Кнопка скасування — лише для майбутніх активних записів.
      const cancellable =
        (apt.status === AppointmentStatus.PENDING || apt.status === AppointmentStatus.CONFIRMED) &&
        startMs > now;
      if (cancellable) {
        cancelButtons.push([{ text: `❌ Скасувати ${time}`, callback_data: `cancel_my_apt:${apt.id}` }]);
      }
      return `${STATUS_EMOJI[apt.status] ?? '•'} <b>${serviceName}</b> — ${time}`;
    });

    await ctx.reply(
      `📋 <b>Ваші останні записи:</b>\n\n${lines.join('\n')}`,
      {
        parse_mode: 'HTML',
        reply_markup: cancelButtons.length ? { inline_keyboard: cancelButtons } : undefined,
      },
    );
  }

  /**
   * Клієнт скасовує свій запис (кнопка «Скасувати» у «Мої записи»).
   * Бекенд перевіряє власність і ліміт скасування (cancellationHours).
   */
  async handleCancelMyAppointment(ctx: any, appointmentId: string) {
    const telegramId = String(ctx.from.id);
    try {
      await this.appointmentService.cancelByClient(appointmentId, telegramId);
      await ctx.answerCbQuery('Запис скасовано');
      await ctx.reply('❌ Ваш запис скасовано. Будемо раді бачити вас знову!');
    } catch (e: any) {
      const msg = e?.response?.message || e?.message || 'Не вдалось скасувати';
      await ctx.answerCbQuery(msg, { show_alert: true });
    }
  }

  /**
   * Клієнт натискає "Написати майстру"
   */
  async handleContactMaster(ctx: any, master: Master) {
    await ctx.answerCbQuery();
    await ctx.reply(
      `💬 Написати майстру ${master.fullName}:\n` +
      (master.username ? `@${master.username}` : 'Використайте кнопку нижче'),
      master.username ? {} : {
        reply_markup: {
          inline_keyboard: [[
            { text: '✉️ Відкрити чат', url: `tg://user?id=${master.telegramId}` }
          ]]
        }
      }
    );
  }
}
