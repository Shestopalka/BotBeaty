import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type LeadChannel = 'instagram' | 'telegram';

/**
 * Анкета «Напишіть нам» з сайту. Зберігаємо завжди — навіть якщо лист
 * не пішов, звернення не загубиться (emailSent = false → видно в БД).
 */
@Entity('leads')
@Index('IDX_leads_created', ['createdAt'])
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 16 })
  channel: LeadChannel;

  @Column({ type: 'varchar', length: 64 })
  handle: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  craft: string | null;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  source: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'boolean', default: false })
  emailSent: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
