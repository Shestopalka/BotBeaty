import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Master } from './master.entity';

@Entity('slots')
@Index(['masterId', 'startAt'], { unique: true }) // Захист від дублікатів
@Check('"endAt" > "startAt"')
export class Slot extends BaseEntity {
  @Column({ type: 'uuid' })
  masterId: string;

  @ManyToOne(() => Master, (master) => master.slots)
  @JoinColumn({ name: 'masterId' })
  master: Master;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  @Column({ default: false })
  isBooked: boolean;

  // Optimistic locking — захист від race condition при одночасному бронюванні
  @Column({ type: 'int', default: 0 })
  version: number;
}
