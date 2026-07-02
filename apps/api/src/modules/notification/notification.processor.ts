import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { Master } from '../../database/entities/master.entity';
import { BotService } from '../bot/bot.service';

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
    private botService: BotService,
  ) {
    super();
  }

  /** "350 ₴" або "500–1000 ₴" — узгоджено з фронтом. */
  private formatPrice(apt: Appointment): string {
    const cur = !apt.currency || apt.currency === 'UAH' ? '₴' : apt.currency;
    const svc = apt.service;
    if (svc?.priceType === 'range' && svc.priceMax != null) {
      return `${Math.round(Number(svc.price))}–${Math.round(Number(svc.priceMax))} ${cur}`;
    }
    return `${Math.round(Number(apt.pricePaid))} ${cur}`;
  }

  async process(job: Job) {
    switch (job.name) {
      case 'appointment_created':
        return this.handleAppointmentCreated(job.data);
      case 'appointment_status_changed':
        return this.handleStatusChanged(job.data);
      case 'appointment_rescheduled':
        return this.handleRescheduled(job.data);
      case 'reminder_24h':
        return this.handleReminder(job.data, '24');
      case 'reminder_2h':
        return this.handleReminder(job.data, '2');
      default:
        this.logger.warn(`Невідомий тип нотифікації: ${job.name}`);
    }
  }

  private async handleAppointmentCreated(data: {
    appointmentId: string;
    masterId: string;
    clientTelegramId: string;
  }) {
    const apt = await this.appointmentRepo.findOne({
      where: { id: data.appointmentId },
      relations: ['client', 'service', 'slot', 'master'],
    });
    if (!apt) return;

    const slotTime = apt.slot.startAt.toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      dateStyle: 'long',
      timeStyle: 'short',
    });

    // Нотифікація клієнту (без throw — якщо клієнт заблокував бота, не ламаємо flow)
    try {
      await this.botService.sendToClient(
        data.masterId,
        data.clientTelegramId,
        `✅ <b>Запис створено!</b>\n\n` +
        `💅 Послуга: ${apt.service?.name ?? '—'}\n` +
        `📅 Дата: ${slotTime}\n` +
        `💰 Вартість: ${this.formatPrice(apt)}\n\n` +
        `⏳ Очікуємо підтвердження майстра`,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      this.logger.warn(`sendToClient failed (clientId=${data.clientTelegramId}): ${e.message}`);
    }

    // Нотифікація майстру
    try {
      await this.botService.sendToMaster(
        apt.master,
        `🔔 <b>Новий запис!</b>\n\n` +
        `👤 Клієнт: ${apt.client?.fullName ?? '—'}\n` +
        (apt.client?.phone ? `📞 Телефон: ${apt.client.phone}\n` : '') +
        `💅 Послуга: ${apt.service?.name ?? '—'}\n` +
        `📅 Час: ${slotTime}\n` +
        `💰 Сума: ${this.formatPrice(apt)}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Підтвердити', callback_data: `confirm_apt:${apt.id}` },
              { text: '❌ Відхилити', callback_data: `cancel_apt:${apt.id}` },
            ]],
          },
        },
      );
    } catch (e) {
      this.logger.warn(`sendToMaster failed (masterId=${data.masterId}): ${e.message}`);
    }
  }

  private async handleStatusChanged(data: {
    appointmentId: string;
    oldStatus: string;
    newStatus: string;
  }) {
    const apt = await this.appointmentRepo.findOne({
      where: { id: data.appointmentId },
      relations: ['client', 'service', 'slot', 'master'],
    });
    if (!apt) return;

    const statusMessages: Record<string, string> = {
      [AppointmentStatus.CONFIRMED]: '✅ Ваш запис підтверджено майстром!',
      [AppointmentStatus.CANCELLED_MASTER]: '❌ На жаль, майстер скасував запис. Оберіть інший час.',
      [AppointmentStatus.CANCELLED_CLIENT]: '❌ Ви скасували запис. Будемо раді бачити вас знову!',
      [AppointmentStatus.COMPLETED]: '🌟 Дякуємо за візит! Будемо раді бачити вас знову.',
    };

    const msg = statusMessages[data.newStatus];
    if (msg && apt.client?.telegramId) {
      try {
        await this.botService.sendToClient(
          apt.masterId,
          apt.client.telegramId,
          msg,
        );
      } catch (e) {
        this.logger.warn(`sendToClient (status change) failed: ${e.message}`);
      }
    }

    // Будь-яке скасування — повідомляємо МАЙСТРА в його чат (слот звільнився).
    // CANCELLED_CLIENT — скасував клієнт; CANCELLED_MASTER — сам майстер у кабінеті,
    // але він теж хоче бачити підтвердження в чаті з ботом.
    const isCancel =
      data.newStatus === AppointmentStatus.CANCELLED_CLIENT ||
      data.newStatus === AppointmentStatus.CANCELLED_MASTER;
    if (isCancel && apt.master) {
      const time = apt.slot?.startAt
        ? new Date(apt.slot.startAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short' })
        : '';
      const who = data.newStatus === AppointmentStatus.CANCELLED_CLIENT ? 'Клієнт скасував запис' : 'Запис скасовано';
      try {
        await this.botService.sendToMaster(
          apt.master,
          `❌ <b>${who}</b>\n👤 ${apt.client?.fullName ?? '—'}\n💅 ${apt.service?.name ?? '—'}\n📅 ${time}`,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        this.logger.warn(`sendToMaster (cancel) failed: ${e.message}`);
      }
    }
  }

  private async handleRescheduled(data: {
    appointmentId: string;
    oldTime: string;
    newTime: string;
    clientTelegramId?: string | null;
    serviceName?: string | null;
  }) {
    // Дані клієнта/послуги приходять прямо в задачі (заповнюються після коміту
    // транзакції). Фолбек — довантажуємо з БД, якщо задачу створено старим кодом.
    let clientTelegramId = data.clientTelegramId ?? null;
    let serviceName = data.serviceName ?? null;
    let masterId: string | null = null;

    if (!clientTelegramId || !serviceName) {
      const apt = await this.appointmentRepo.findOne({
        where: { id: data.appointmentId },
        relations: ['client', 'service'],
      });
      clientTelegramId = clientTelegramId ?? apt?.client?.telegramId ?? null;
      serviceName = serviceName ?? apt?.service?.name ?? null;
      masterId = apt?.masterId ?? null;
    }

    if (!masterId) {
      const apt = await this.appointmentRepo.findOne({ where: { id: data.appointmentId } });
      masterId = apt?.masterId ?? null;
    }
    if (!clientTelegramId || !masterId) return;

    try {
      await this.botService.sendToClient(
        masterId,
        clientTelegramId,
        `🔄 <b>Ваш запис перенесено</b>\n` +
        `💅 ${serviceName ?? '—'}\n` +
        (data.oldTime ? `Було: ${data.oldTime}\n` : '') +
        `Стало: <b>${data.newTime}</b>`,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      this.logger.warn(`sendToClient (reschedule) failed: ${e.message}`);
    }
  }

  private async handleReminder(data: { appointmentId: string }, hours: string) {
    const apt = await this.appointmentRepo.findOne({
      where: { id: data.appointmentId, status: AppointmentStatus.CONFIRMED },
      relations: ['client', 'service', 'slot', 'master'],
    });
    if (!apt) return;

    const slotTime = apt.slot.startAt.toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      timeStyle: 'short',
    });

    try {
      await this.botService.sendToClient(
        apt.masterId,
        apt.client.telegramId,
        `⏰ <b>Нагадування!</b>\n\n` +
        `Через ${hours} год у вас запис:\n` +
        `💅 ${apt.service?.name ?? '—'} о ${slotTime}\n` +
        `📍 Майстер: ${apt.master?.fullName ?? '—'}`,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      this.logger.warn(`Reminder send failed (aptId=${data.appointmentId}): ${e.message}`);
      return; // Не позначаємо як sent якщо не вдалось надіслати
    }

    // Позначаємо що нагадування надіслано
    await this.appointmentRepo.update(apt.id, {
      [`reminder${hours}hSent`]: true,
    });
  }
}
