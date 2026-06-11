import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditAction {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Незмінний лог всіх змін критичних сутностей.
 * Не наслідує BaseEntity — не підлягає soft delete.
 */
@Entity('audit_logs')
@Index(['tableName', 'recordId'])
@Index(['changedAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tableName: string; // 'appointments', 'payments', etc.

  @Column({ type: 'uuid' })
  recordId: string;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  oldData: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  newData: Record<string, any>;

  @Column({ type: 'uuid', nullable: true })
  changedBy: string; // masterId або clientId

  @Column({ nullable: true })
  changedByType: string; // 'master' | 'client' | 'system'

  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn({ type: 'timestamptz' })
  changedAt: Date;
}
