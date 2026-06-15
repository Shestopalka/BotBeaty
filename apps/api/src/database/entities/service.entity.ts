import { Entity, Column, ManyToOne, JoinColumn, Check } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Master } from './master.entity';

export enum PriceType {
  FIXED = 'fixed', // Фіксована ціна
  RANGE = 'range', // Діапазон «від–до»
}

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

  @Column({
    type: 'enum',
    enum: PriceType,
    default: PriceType.FIXED,
  })
  priceType: PriceType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number; // Фіксована ціна, або нижня межа («від») для діапазону

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceMax: number | null; // Верхня межа («до») — лише для PriceType.RANGE

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
