import { Entity, Column, OneToOne, JoinColumn, Check } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Appointment } from './appointment.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export enum PaymentMethod {
  TELEGRAM = 'telegram',        // Telegram Payments
  CASH = 'cash',                // Готівка (майстер підтверджує вручну)
  BANK_TRANSFER = 'bank_transfer', // Переказ на картку
}

@Entity('payments')
@Check('"amount" > 0')
export class Payment extends BaseEntity {
  @Column({ type: 'uuid' })
  appointmentId: string;

  @OneToOne(() => Appointment, (apt) => apt.payment)
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ default: 'UAH' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.TELEGRAM,
  })
  method: PaymentMethod;

  // Telegram Payments charge ID
  @Column({ nullable: true })
  telegramChargeId: string;

  // Provider (LiqPay / Stripe) payment ID
  @Column({ nullable: true })
  providerPaymentId: string;

  @Column({ nullable: true, type: 'jsonb' })
  providerMetadata: Record<string, any>; // Сирі дані від провайдера

  @Column({ nullable: true, type: 'timestamptz' })
  paidAt: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  refundedAt: Date;
}
