import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { Master } from '../../database/entities/master.entity';

@Injectable()
export class ReminderScheduler {
  private readonly logger = new Logger(ReminderScheduler.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    @InjectRepository(Master)
    private masterRepo: Repository<Master>,

    @InjectQueue('notifications')
    private notificationsQueue: Queue,
  ) {}

  /**
   * Кожні 15 хвилин перевіряємо записи для нагадувань.
   * Враховуємо індивідуальні налаштування кожного майстра (reminder1Hours, reminder2Hours).
   */
  @Cron('*/15 * * * *')
  async scheduleReminders() {
    const now = new Date();

    // Отримуємо всіх активних майстрів з їхніми налаштуваннями нагадувань
    const masters = await this.masterRepo.find({
      where: { status: 'active' as any },
      select: ['id', 'reminder1Enabled', 'reminder1Hours', 'reminder2Enabled', 'reminder2Hours'],
    });

    for (const master of masters) {
      // ── Перше нагадування ────────────────────────────────────────────────
      if (master.reminder1Enabled) {
        const targetTime = new Date(now.getTime() + master.reminder1Hours * 60 * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 7.5 * 60 * 1000);
        const windowEnd   = new Date(targetTime.getTime() + 7.5 * 60 * 1000);

        const apts = await this.appointmentRepo.find({
          where: { masterId: master.id, status: AppointmentStatus.CONFIRMED, reminder24hSent: false, deletedAt: IsNull() },
          relations: ['slot'],
        });

        for (const apt of apts) {
          if (apt.slot?.startAt >= windowStart && apt.slot?.startAt <= windowEnd) {
            await this.notificationsQueue.add('reminder_24h', { appointmentId: apt.id });
            this.logger.log(`Reminder-1 (${master.reminder1Hours}h) → apt ${apt.id}`);
          }
        }
      }

      // ── Друге нагадування ────────────────────────────────────────────────
      if (master.reminder2Enabled) {
        const targetTime = new Date(now.getTime() + master.reminder2Hours * 60 * 60 * 1000);
        const windowStart = new Date(targetTime.getTime() - 7.5 * 60 * 1000);
        const windowEnd   = new Date(targetTime.getTime() + 7.5 * 60 * 1000);

        const apts = await this.appointmentRepo.find({
          where: { masterId: master.id, status: AppointmentStatus.CONFIRMED, reminder2hSent: false, deletedAt: IsNull() },
          relations: ['slot'],
        });

        for (const apt of apts) {
          if (apt.slot?.startAt >= windowStart && apt.slot?.startAt <= windowEnd) {
            await this.notificationsQueue.add('reminder_2h', { appointmentId: apt.id });
            this.logger.log(`Reminder-2 (${master.reminder2Hours}h) → apt ${apt.id}`);
          }
        }
      }
    }
  }
}
