import { Entity, Column, ManyToOne, JoinColumn, Check } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Master } from './master.entity';

@Entity('services')
@Check('"price" >= 0')
@Check('"durationMinutes" > 0')
export class Service extends BaseEntity {
  @Column()
  name: string; // "Манікюр класичний"

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'int' })
  durationMinutes: number; // Тривалість в хвилинах

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number; // Ціна в гривнях

  @Column({ nullable: true })
  currency: string; // UAH

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  imageUrl: string; // Фото прикладу роботи

  @Column({ type: 'uuid' })
  masterId: string;

  @ManyToOne(() => Master, (master) => master.services)
  @JoinColumn({ name: 'masterId' })
  master: Master;
}
