import { Entity, Column, ManyToOne, JoinColumn, OneToOne, Check, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Client } from './client.entity';
import { Master } from './master.entity';
import { Service } from './service.entity';
import { Slot } from './slot.entity';
import { Payment } from './payment.entity';

export enum AppointmentStatus {
  PENDING = 'pending',       // Очікує підтвердження
  CONFIRMED = 'confirmed',   // Підтверджено майстром
  CANCELLED_CLIENT = 'cancelled_client',
  CANCELLED_MASTER = 'cancelled_master',
  COMPLETED = 'completed',   // Завершено
  NO_SHOW = 'no_show',       // Клієнт не прийшов
}

@Entity('appointments')
@Index(['slotId'], { unique: true }) // Один слот = один запис
export class Appointment extends BaseEntity {
  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.PENDING,
  })
  status: AppointmentStatus;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.appointments)
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Column({ type: 'uuid' })
  masterId: string;

  @ManyToOne(() => Master)
  @JoinColumn({ name: 'masterId' })
  master: Master;

  @Column({ type: 'uuid' })
  serviceId: string;

  @ManyToOne(() => Service)
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Column({ type: 'uuid', unique: true })
  slotId: string;

  @OneToOne(() => Slot)
  @JoinColumn({ name: 'slotId' })
  slot: Slot;

  @Column({ nullable: true, type: 'text' })
  clientNote: string; // Побажання клієнта

  @Column({ nullable: true, type: 'text' })
  masterNote: string; // Нотатка майстра

  // Snapshot ціни на момент запису (ціна послуги може змінитись)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePaid: number;

  @Column({ nullable: true })
  currency: string;

  // Чи надіслані нагадування
  @Column({ default: false })
  reminder24hSent: boolean;

  @Column({ default: false })
  reminder2hSent: boolean;

  @OneToOne(() => Payment, (payment) => payment.appointment, { nullable: true })
  payment: Payment;
}
