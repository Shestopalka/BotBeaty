import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Глобальний feature flag платформи.
 * key — стабільний ідентифікатор фічі (напр. 'calendar_day_view').
 * enabled=true → фічу бачать УСІ майстри.
 * enabled=false → фічу бачать лише ті майстри, у кого персональний
 *                 override увімкнено (masters.featureFlags[key] === true).
 */
@Entity('feature_flags')
export class FeatureFlag {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
