import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../../database/entities/appointment.entity';
import { Slot } from '../../../database/entities/slot.entity';
import { AuditLog, AuditAction } from '../../../database/entities/audit-log.entity';

/**
 * Обробляє натискання inline кнопок підтвердження/скасування/завершення записів.
 * Callback data формат:
 *   confirm_apt:<appointmentId>
 *   cancel_apt:<appointmentId>
 *   complete_apt:<appointmentId>
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
    const data: string = ctx.callbackQuery?.data ?? '';

    if (data.startsWith('confirm_apt:')) {
      await this.handleConfirm(ctx, data.replace('confirm_apt:', ''), masterId);
    } else if (data.startsWith('cancel_apt:')) {
      await this.handleCancel(ctx, data.replace('cancel_apt:', ''), masterId);
    } else if (data.startsWith('complete_apt:')) {
      await this.handleComplete(ctx, data.replace('complete_apt:', ''), masterId);
    }
  }

  private async handleConfirm(ctx: any, appointmentId: string, masterId: string) {
    await ctx.answerCbQuery('⏳ Підтверджуємо...');

    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, masterId },
      relations: ['client', 'service', 'slot'],
    });

    if (!apt) { await ctx.answerCbQuery('❌ Запис не знайдено'); return; }
    if (apt.status !== AppointmentStatus.PENDING) {
      await ctx.answerCbQuery('ℹ️ Статус вже змінено'); return;
    }

    await this.updateStatus(apt, AppointmentStatus.CONFIRMED, masterId);

    const time = new Date(apt.slot.startAt).toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short',
    });

    // Оновлюємо повідомлення — прибираємо кнопки, показуємо статус
    await ctx.editMessageText(
      `✅ <b>Запис підтверджено</b>\n\n` +
      `👤 ${apt.client.fullName}\n` +
      `💅 ${apt.service.name}\n` +
      `📅 ${time}`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Завершити', callback_data: `complete_apt:${apt.id}` },
            { text: '❌ Скасувати', callback_data: `cancel_apt:${apt.id}` },
          ]],
        },
      },
    );
  }

  private async handleCancel(ctx: any, appointmentId: string, masterId: string) {
    await ctx.answerCbQuery('⏳ Скасовуємо...');

    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, masterId },
      relations: ['client', 'service', 'slot'],
    });

    if (!apt) { await ctx.answerCbQuery('❌ Запис не знайдено'); return; }

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Appointment).update(appointmentId, {
        status: AppointmentStatus.CANCELLED_MASTER,
      });
      await manager.getRepository(Slot).update(apt.slotId, { isBooked: false });
      await manager.getRepository(AuditLog).save({
        tableName: 'appointments',
        recordId: appointmentId,
        action: AuditAction.UPDATE,
        oldData: { status: apt.status },
        newData: { status: AppointmentStatus.CANCELLED_MASTER },
        changedBy: masterId,
        changedByType: 'master',
      });
    });

    const time = new Date(apt.slot.startAt).toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short',
    });

    // Нотифікуємо клієнта про скасування
    await this.notificationsQueue.add('appointment_status_changed', {
      appointmentId,
      oldStatus: apt.status,
      newStatus: 'cancelled_master',
    }).catch(e => this.logger.warn(`Не вдалось поставити нотифікацію: ${e.message}`));

    await ctx.editMessageText(
      `❌ <b>Запис скасовано</b>\n\n` +
      `👤 ${apt.client.fullName}\n` +
      `💅 ${apt.service.name}\n` +
      `📅 ${time}`,
      { parse_mode: 'HTML' },
    );
  }

  private async handleComplete(ctx: any, appointmentId: string, masterId: string) {
    await ctx.answerCbQuery('⏳ Завершуємо...');

    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId, masterId },
      relations: ['client', 'service', 'slot'],
    });

    if (!apt) { await ctx.answerCbQuery('❌ Запис не знайдено'); return; }

    await this.updateStatus(apt, AppointmentStatus.COMPLETED, masterId);

    // Нотифікуємо клієнта про завершення
    await this.notificationsQueue.add('appointment_status_changed', {
      appointmentId,
      oldStatus: apt.status,
      newStatus: 'completed',
    }).catch(e => this.logger.warn(`Не вдалось поставити нотифікацію: ${e.message}`));

    await ctx.editMessageText(
      `🌟 <b>Візит завершено!</b>\n\n` +
      `👤 ${apt.client.fullName}\n` +
      `💅 ${apt.service.name}\n` +
      `💰 ${apt.pricePaid} ${apt.currency}`,
      { parse_mode: 'HTML' },
    );
  }

  private async updateStatus(apt: Appointment, status: AppointmentStatus, masterId: string) {
    const old = apt.status;
    await this.appointmentRepo.update(apt.id, { status });
    await this.auditRepo.save({
      tableName: 'appointments',
      recordId: apt.id,
      action: AuditAction.UPDATE,
      oldData: { status: old },
      newData: { status },
      changedBy: masterId,
      changedByType: 'master',
    });
  }
}
