import { Entity, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Master } from './master.entity';
import { Appointment } from './appointment.entity';

export enum ClientTag {
  NEW = 'new',
  REGULAR = 'regular',
  TRUSTED = 'trusted',
  BLOCKED = 'blocked',
  UNWANTED = 'unwanted',
}

@Entity('clients')
@Index(['telegramId', 'masterId'], { unique: true }) // Один клієнт = одна картка у конкретного майстра
export class Client extends BaseEntity {
  // Може бути null — для офлайн-клієнтів, яких майстер записав вручну.
  @Column({ type: 'bigint', nullable: true })
  telegramId: string | null;

  @Column({ nullable: true })
  username: string;

  @Column()
  fullName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({
    type: 'enum',
    enum: ClientTag,
    default: ClientTag.NEW,
  })
  tag: ClientTag;

  @Column({ nullable: true, type: 'text' })
  notes: string; // Приватні нотатки майстра про клієнта

  @Column({ type: 'uuid' })
  masterId: string;

  @ManyToOne(() => Master, (master) => master.clients)
  @JoinColumn({ name: 'masterId' })
  master: Master;

  @OneToMany(() => Appointment, (apt) => apt.client)
  appointments: Appointment[];
}
