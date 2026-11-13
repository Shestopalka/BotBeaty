import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** Кроки воронки «реклама → майстер». Крок 5 (послуга/слот/запис) — з наявних таблиць. */
export enum FunnelEventName {
  BOT_START = 'bot_start',                         // 1. /start у платформному боті
  ONBOARDING_OPEN = 'onboarding_open',             // 2. відкрив онбординг у mini-app
  ONBOARDING_TOKEN_STEP = 'onboarding_token_step', // 3. дійшов до кроку з токеном BotFather
  REGISTERED = 'registered',                       // 4. зареєструвався як майстер
}

/**
 * Журнал подій воронки (append-only: лише INSERT, нічого не оновлюємо).
 * source пишемо лише на bot_start; решта подій привʼязується за telegramId.
 * Аналітика — через view funnel_daily і funnel_leads (міграція AddFunnelEvents).
 */
@Entity('funnel_events')
@Index('IDX_funnel_events_tg_event', ['telegramId', 'event'])
@Index('IDX_funnel_events_created', ['createdAt'])
export class FunnelEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  telegramId: string;

  @Column({ type: 'varchar', length: 40 })
  event: FunnelEventName;

  @Column({ type: 'varchar', length: 64, nullable: true })
  source: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
