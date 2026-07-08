import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Master } from './master.entity';

/**
 * Витрата майстра (матеріали тощо) — журнал витрат для розрахунку чистого доходу.
 * Агрегується за період через spentAt.
 */
@Entity('expenses')
@Index(['masterId', 'spentAt'])
export class Expense extends BaseEntity {
  @Column({ type: 'uuid' })
  masterId: string;

  @ManyToOne(() => Master)
  @JoinColumn({ name: 'masterId' })
  master: Master;

  // decimal у TypeORM повертається рядком — transformer робить його числом у JS.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: {
      to: (v?: number) => v,
      from: (v?: string) => (v == null ? 0 : parseFloat(v)),
    },
  })
  amount: number;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  // Дата, до якої належить витрата (для агрегації за місяць/період).
  @Column({ type: 'timestamptz' })
  spentAt: Date;
}
