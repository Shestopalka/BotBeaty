import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Master, MasterStatus, SubscriptionStatus } from '../../database/entities/master.entity';
import { BotService } from '../bot/bot.service';

const GRACE_DAYS = 7; // скільки днів після спливу до повного скасування
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionScheduler {
  private readonly logger = new Logger(SubscriptionScheduler.name);

  constructor(
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
    private botService: BotService,
  ) {}

  /** Щодня о 09:00 (за часом сервера) перевіряємо строки підписок. */
  @Cron('0 9 * * *')
  async checkSubscriptions() {
    const now = Date.now();
    const masters = await this.masterRepo.find({ where: { status: MasterStatus.ACTIVE } });

    for (const m of masters) {
      const untilDate = m.currentPeriodEnd ?? m.trialEndsAt;
      if (!untilDate) continue;
      const until = new Date(untilDate).getTime();
      const daysLeft = Math.ceil((until - now) / DAY_MS);
      const isLive =
        m.subscriptionStatus === SubscriptionStatus.TRIALING ||
        m.subscriptionStatus === SubscriptionStatus.ACTIVE;

      // Нагадування за 3 і 1 день до кінця
      if (isLive && (daysLeft === 3 || daysLeft === 1)) {
        await this.notify(
          m,
          `⏳ ${m.subscriptionStatus === SubscriptionStatus.TRIALING ? 'Пробний період' : 'Підписка'} ` +
          `закінчується через ${daysLeft} ${daysLeft === 1 ? 'день' : 'дні'}.\n` +
          `Продовжіть, щоб бот і далі приймав записи.`,
        );
      }

      // Сплив строку
      if (isLive && until < now) {
        await this.masterRepo.update(m.id, { subscriptionStatus: SubscriptionStatus.PAST_DUE });
        await this.notify(
          m,
          `❗️ Доступ призупинено: строк підписки сплив. Продовжіть, щоб знову приймати записи.`,
        );
        this.logger.log(`Subscription past_due → master ${m.id}`);
      } else if (m.subscriptionStatus === SubscriptionStatus.PAST_DUE && until + GRACE_DAYS * DAY_MS < now) {
        await this.masterRepo.update(m.id, { subscriptionStatus: SubscriptionStatus.CANCELED });
        this.logger.log(`Subscription canceled → master ${m.id}`);
      }
    }
  }

  private async notify(master: Master, message: string) {
    try {
      await this.botService.sendToMaster(master, message);
    } catch (e: any) {
      this.logger.warn(`subscription notify failed (master ${master.id}): ${e.message}`);
    }
  }
}
