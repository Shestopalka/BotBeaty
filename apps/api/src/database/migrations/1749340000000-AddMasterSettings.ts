import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMasterSettings1749340000000 implements MigrationInterface {
  name = 'AddMasterSettings1749340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Notification settings ──────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "masters"
        ADD COLUMN IF NOT EXISTS "reminder1Enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "reminder1Hours"   integer NOT NULL DEFAULT 24,
        ADD COLUMN IF NOT EXISTS "reminder2Enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "reminder2Hours"   integer NOT NULL DEFAULT 2
    `);

    // ── Booking settings ───────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "masters"
        ADD COLUMN IF NOT EXISTS "autoConfirm"       boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "cancellationHours" integer NOT NULL DEFAULT 0
    `);

    // ── Slot defaults ──────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "masters"
        ADD COLUMN IF NOT EXISTS "defaultWorkStart"    varchar(5) NOT NULL DEFAULT '09:00',
        ADD COLUMN IF NOT EXISTS "defaultWorkEnd"      varchar(5) NOT NULL DEFAULT '18:00',
        ADD COLUMN IF NOT EXISTS "defaultSlotDuration" integer    NOT NULL DEFAULT 60,
        ADD COLUMN IF NOT EXISTS "defaultBreakMinutes" integer    NOT NULL DEFAULT 15
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "masters"
        DROP COLUMN IF EXISTS "reminder1Enabled",
        DROP COLUMN IF EXISTS "reminder1Hours",
        DROP COLUMN IF EXISTS "reminder2Enabled",
        DROP COLUMN IF EXISTS "reminder2Hours",
        DROP COLUMN IF EXISTS "autoConfirm",
        DROP COLUMN IF EXISTS "cancellationHours",
        DROP COLUMN IF EXISTS "defaultWorkStart",
        DROP COLUMN IF EXISTS "defaultWorkEnd",
        DROP COLUMN IF EXISTS "defaultSlotDuration",
        DROP COLUMN IF EXISTS "defaultBreakMinutes"
    `);
  }
}
