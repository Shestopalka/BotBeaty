import {
  Entity,
  Column,
  OneToMany,
  Index,
  Check,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Service } from './service.entity';
import { Slot } from './slot.entity';
import { Client } from './client.entity';

// Теми відповідають frontend ThemeName
export enum MasterTheme {
  DUSTY_ROSE  = 'dusty_rose',
  DARK_ROSE   = 'dark_rose',
  BLUSH_GLASS = 'blush_glass',
  DEEP_MAUVE  = 'deep_mauve',
  ROSE_NOIR   = 'rose_noir',
}

export enum BeautySpecialty {
  MANICURE = 'manicure',
  PEDICURE = 'pedicure',
  EYELASHES = 'eyelashes',
  MAKEUP = 'makeup',
  HAIRDRESSER = 'hairdresser',
  TATTOO = 'tattoo',
  EYEBROWS = 'eyebrows',
  MASSAGE = 'massage',
  COSMETOLOGY = 'cosmetology',
  OTHER = 'other',
}

export enum MasterStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('masters')
@Index(['telegramId'], { unique: true })
export class Master extends BaseEntity {
  @Column({ type: 'bigint', unique: true })
  telegramId: string; // Telegram user ID майстра

  @Column({ nullable: true })
  username: string; // @username в Telegram

  @Column()
  fullName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  bio: string; // Опис майстра

  @Column({ nullable: true })
  city: string;

  // Telegram бот майстра
  @Column({ unique: true, nullable: true })
  botToken: string; // Токен від BotFather

  @Column({ unique: true, nullable: true })
  botUsername: string; // @username бота

  @Column({ nullable: true })
  botWebhookUrl: string;

  @Column({
    type: 'enum',
    enum: MasterStatus,
    default: MasterStatus.INACTIVE,
  })
  status: MasterStatus;

  // Масив спеціалізацій: ['manicure', 'pedicure']
  @Column({ type: 'simple-array', default: '' })
  specialties: BeautySpecialty[];

  @Column({
    type: 'varchar',
    length: 50,
    default: MasterTheme.DUSTY_ROSE,
  })
  theme: string;

  // ─── Налаштування нотифікацій ────────────────────────────────────────────

  @Column({ default: true })
  reminder1Enabled: boolean; // Перше нагадування увімкнено

  @Column({ type: 'int', default: 24 })
  reminder1Hours: number; // За скільки годин (24, 48, 72)

  @Column({ default: true })
  reminder2Enabled: boolean; // Друге нагадування увімкнено

  @Column({ type: 'int', default: 2 })
  reminder2Hours: number; // За скільки годин (1, 2, 3)

  // ─── Налаштування записів ────────────────────────────────────────────────

  @Column({ default: false })
  autoConfirm: boolean; // Автоматично підтверджувати нові записи

  @Column({ type: 'int', default: 0 })
  cancellationHours: number; // За скільки годин до запису клієнт може скасувати (0 = завжди)

  // ─── Налаштування за замовчуванням для слотів ────────────────────────────

  @Column({ default: '09:00' })
  defaultWorkStart: string; // Час початку роботи за замовчуванням

  @Column({ default: '18:00' })
  defaultWorkEnd: string; // Час кінця роботи за замовчуванням

  @Column({ type: 'int', default: 60 })
  defaultSlotDuration: number; // Тривалість слоту за замовчуванням (хв)

  @Column({ type: 'int', default: 15 })
  defaultBreakMinutes: number; // Перерва між слотами за замовчуванням (хв)

  // Версія для optimistic locking
  @Column({ type: 'int', default: 0 })
  version: number;

  @OneToMany(() => Service, (service) => service.master, { cascade: true })
  services: Service[];

  @OneToMany(() => Slot, (slot) => slot.master, { cascade: true })
  slots: Slot[];

  @OneToMany(() => Client, (client) => client.master, { cascade: true })
  clients: Client[];
}
