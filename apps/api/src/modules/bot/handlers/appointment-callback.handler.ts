import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../../database/entities/appointment.entity';
import { Slot } from '../../../database/entities/slot.entity';
import { AuditLog, AuditAction } from '../../../database/entities/audit-log.entity';

/**
 * Обробляє натискання inline кнопок підтвердження/скасування/завершення записів.
 * Callback data формат:
 *   confirm_apt:<appointmentId>
 *   cancel_apt:<appointmentId>
 *   complete_apt:<appointmentId>
 *
 * ПРИНЦИП НАДІЙНОСТІ (щоб кнопка ніколи «не спрацьовувала вникуди»):
 *  1) Джерело істини — зміна статусу в БД (атомарний UPDATE із перевіркою
 *     попереднього статусу). Це виконується ПЕРШИМ і не залежить від Telegram.
 *  2) Нотифікація ставиться в чергу одразу після зміни статусу.
 *  3) Оновлення повідомлення в чаті (editMessageText) — «best-effort»: якщо
 *     Telegram не дав відредагувати (старе повідомлення, мережевий збій,
 *     "message is not modified" тощо), ми НЕ кидаємо помилку, а надсилаємо
 *     нове повідомлення (reply) як фолбек. Раніше збій editMessageText зупиняв
 *     весь обробник ДО постановки нотифікації — і майстру здавалося, що кнопка
 *     не працює, хоча статус міг лишитись незміненим.
 */
@Injectable()
export class AppointmentCallbackHandler {
  private readonly logger = new Logger(AppointmentCallbackHandler.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
    private dataSource: DataSource,
    @InjectQueue('notifications')
    private notificationsQueue: Queue,
  ) {}

  async handle(ctx: any, masterId: string): Promise<void> {
    // Підтверджуємо callback МИТТЄВО (до будь-яких запитів у БД), щоб кнопка
    // не «висіла». Callback можна відповісти лише раз — тому далі не викликаємо.
    await ctx.answerCbQuery().catch(() => {});

    const data: string = ctx.callbackQuery?.data ?? '';

    try {
      if (data.startsWith('confirm_apt:')) {
        await this.handleConfirm(ctx, data.replace('confirm_apt:', ''), masterId);
      } else if (data.startsWith('cancel_apt:')) {
        await this.handleCancel(ctx, data.replace('cancel_apt:', ''), masterId);
      } else if (data.startsWith('complete_apt:')) {
        await this.handleComplete(ctx, data.replace('complete_apt:', ''), masterId);
      }
    } catch (e: any) {
      // Останній рубіж: навіть якщо щось несподівано впало — не мовчимо.
      this.logger.error(`callback handle (${data}) failed: ${e?.message}`);
      await this.safeReply(ctx, '⚠️ Сталася помилка. Спробуйте ще раз або оновіть застосунок.');
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private fmtTime(dt: any): string {
    if (!dt) return '';
    return new Date(dt).toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short',
    });
  }

  /** Редагуємо повідомлення; якщо не вдалось — надсилаємо нове (щоб майстер побачив результат). */
  private async safeEdit(ctx: any, text: string, extra?: any): Promise<void> {
    try {
      await ctx.editMessageText(text, extra);
    } catch (e: any) {
      this.logger.warn(`editMessageText failed, fallback to reply: ${e?.message}`);
      await this.safeReply(ctx, text, extra);
    }
  }

  private async safeReply(ctx: any, text: string, extra?: any): Promise<void> {
    try {
      await ctx.reply(text, extra);
    } catch (e: any) {
      this.logger.warn(`reply failed: ${e?.message}`);
    }
  }

  // ─── Confirm ─────────────────────────────────────────────────────────────

  private async handleConfirm(ctx: any, appointmentId: string, masterId: string) {
    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, masterId },
      relations: ['client', 'service', 'slot'],
    });
    if (!apt) { await this.safeReply(ctx, '❌ Запис не знайдено'); return; }

    const confirmedMsg = (a: Appointment) =>
      `✅ <b>Запис підтверджено</b>\n\n` +
      `👤 ${a.client?.fullName ?? '—'}\n` +
      `💅 ${a.service?.name ?? '—'}\n` +
      `📅 ${this.fmtTime(a.slot?.startAt)}`;
    const confirmedExtra = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Завершити', callback_data: `complete_apt:${apt.id}` },
          { text: '❌ Скасувати', callback_data: `cancel_apt:${apt.id}` },
        ]],
      },
    };

    // Ідемпотентність: якщо вже підтверджено — просто (best-effort) показуємо стан.
    if (apt.status === AppointmentStatus.CONFIRMED) {
      await this.safeEdit(ctx, confirmedMsg(apt), confirmedExtra);
      return;
    }
    if (apt.status !== AppointmentStatus.PENDING) {
      await this.safeReply(ctx, 'ℹ️ Цей запис уже оброблено (скасовано або завершено).');
      return;
    }

    // Атомарний перехід PENDING → CONFIRMED. Захищає від подвійних натискань
    // та гонок (два апдейти від Telegram) — лише один UPDATE реально спрацює.
    const res = await this.appointmentRepo.update(
      { id: apt.id, masterId, status: AppointmentStatus.PENDING },
      { status: AppointmentStatus.CONFIRMED },
    );
    if (!res.affected) {
      await this.safeReply(ctx, 'ℹ️ Статус цього запису вже змінено.');
      return;
    }
    apt.status = AppointmentStatus.CONFIRMED;

    await this.auditRepo.save({
      tableName: 'appointments', recordId: apt.id, action: AuditAction.UPDATE,
      oldData: { status: AppointmentStatus.PENDING }, newData: { status: AppointmentStatus.CONFIRMED },
      changedBy: masterId, changedByType: 'master',
    }).catch(e => this.logger.warn(`audit (confirm) failed: ${e.message}`));

    // Нотифікація клієнту — до редагування повідомлення (щоб збій UI її не блокував).
    void this.notificationsQueue.add('appointment_status_changed', {
      appointmentId: apt.id,
      oldStatus: AppointmentStatus.PENDING,
      newStatus: AppointmentStatus.CONFIRMED,
    }).catch(e => this.logger.warn(`Нотифікація підтвердження: ${e.message}`));

    await this.safeEdit(ctx, confirmedMsg(apt), confirmedExtra);
  }

  // ─── Cancel ──────────────────────────────────────────────────────────────

  private async handleCancel(ctx: any, appointmentId: string, masterId: string) {
    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, masterId },
      relations: ['client', 'service', 'slot'],
    });
    if (!apt) { await this.safeReply(ctx, '❌ Запис не знайдено'); return; }

    const cancelledMsg =
      `❌ <b>Запис скасовано</b>\n\n` +
      `👤 ${apt.client?.fullName ?? '—'}\n` +
      `💅 ${apt.service?.name ?? '—'}\n` +
      `📅 ${this.fmtTime(apt.slot?.startAt)}`;

    // Скасувати можна лише активний запис.
    if (
      apt.status !== AppointmentStatus.PENDING &&
      apt.status !== AppointmentStatus.CONFIRMED
    ) {
      // Якщо вже скасовано — показуємо фінальний стан (ідемпотентно).
      if (
        apt.status === AppointmentStatus.CANCELLED_MASTER ||
        apt.status === AppointmentStatus.CANCELLED_CLIENT
      ) {
        await this.safeEdit(ctx, cancelledMsg, { parse_mode: 'HTML' });
      } else {
        await this.safeReply(ctx, 'ℹ️ Цей запис уже завершено — скасувати не можна.');
      }
      return;
    }

    const prevStatus = apt.status;
    // Атомарно міняємо статус лише якщо він досі активний, і звільняємо слот.
    const changed = await this.dataSource.transaction(async (manager) => {
      const res = await manager.getRepository(Appointment).update(
        { id: apt.id, masterId, status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]) },
        { status: AppointmentStatus.CANCELLED_MASTER },
      );
      if (!res.affected) return false;
      if (apt.slotId) {
        await manager.getRepository(Slot).update(apt.slotId, { isBooked: false });
      }
      await manager.getRepository(AuditLog).save({
        tableName: 'appointments', recordId: apt.id, action: AuditAction.UPDATE,
        oldData: { status: prevStatus }, newData: { status: AppointmentStatus.CANCELLED_MASTER },
        changedBy: masterId, changedByType: 'master',
      });
      return true;
    });

    if (!changed) {
      await this.safeReply(ctx, 'ℹ️ Статус цього запису вже змінено.');
      return;
    }

    void this.notificationsQueue.add('appointment_status_changed', {
      appointmentId: apt.id,
      oldStatus: prevStatus,
      newStatus: AppointmentStatus.CANCELLED_MASTER,
    }).catch(e => this.logger.warn(`Нотифікація скасування: ${e.message}`));

    await this.safeEdit(ctx, cancelledMsg, { parse_mode: 'HTML' });
  }

  // ─── Complete ────────────────────────────────────────────────────────────

  private async handleComplete(ctx: any, appointmentId: string, masterId: string) {
    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, masterId },
      relations: ['client', 'service', 'slot'],
    });
    if (!apt) { await this.safeReply(ctx, '❌ Запис не знайдено'); return; }

    const doneMsg =
      `🌟 <b>Візит завершено!</b>\n\n` +
      `👤 ${apt.client?.fullName ?? '—'}\n` +
      `💅 ${apt.service?.name ?? '—'}\n` +
      `💰 ${apt.pricePaid} ${apt.currency ?? 'UAH'}`;

    if (apt.status === AppointmentStatus.COMPLETED) {
      await this.safeEdit(ctx, doneMsg, { parse_mode: 'HTML' });
      return;
    }
    // Завершити можна лише підтверджений (або ще pending) активний запис.
    if (
      apt.status !== AppointmentStatus.CONFIRMED &&
      apt.status !== AppointmentStatus.PENDING
    ) {
      await this.safeReply(ctx, 'ℹ️ Цей запис скасовано — завершити не можна.');
      return;
    }

    const prevStatus = apt.status;
    const res = await this.appointmentRepo.update(
      { id: apt.id, masterId, status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]) },
      { status: AppointmentStatus.COMPLETED },
    );
    if (!res.affected) {
      await this.safeReply(ctx, 'ℹ️ Статус цього запису вже змінено.');
      return;
    }

    await this.auditRepo.save({
      tableName: 'appointments', recordId: apt.id, action: AuditAction.UPDATE,
      oldData: { status: prevStatus }, newData: { status: AppointmentStatus.COMPLETED },
      changedBy: masterId, changedByType: 'master',
    }).catch(e => this.logger.warn(`audit (complete) failed: ${e.message}`));

    void this.notificationsQueue.add('appointment_status_changed', {
      appointmentId: apt.id,
      oldStatus: prevStatus,
      newStatus: AppointmentStatus.COMPLETED,
    }).catch(e => this.logger.warn(`Нотифікація завершення: ${e.message}`));

    await this.safeEdit(ctx, doneMsg, { parse_mode: 'HTML' });
  }
}
