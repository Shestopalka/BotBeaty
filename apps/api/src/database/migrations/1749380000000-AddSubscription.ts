import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Підписка платформи: статус, тріал, кінець оплаченого періоду, тариф.
 * Існуючих майстрів «грандфазеримо» — робимо active з далеким періодом.
 */
export class AddSubscription1749380000000 implements MigrationInterface {
  name = 'AddSubscription1749380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'masters_subscriptionstatus_enum') THEN
          CREATE TYPE "masters_subscriptionstatus_enum" AS ENUM ('trialing','active','past_due','canceled');
        END IF;
      END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "masters"
        ADD COLUMN IF NOT EXISTS "subscriptionStatus" "masters_subscriptionstatus_enum" NOT NULL DEFAULT 'trialing',
        ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "plan" character varying NOT NULL DEFAULT 'standard'`,
    );
    // Грандфазер: усі вже наявні майстри — активні безстроково (далека дата).
    await queryRunner.query(
      `UPDATE "masters"
         SET "subscriptionStatus" = 'active',
             "currentPeriodEnd" = TIMESTAMPTZ '2099-01-01'
       WHERE "currentPeriodEnd" IS NULL AND "trialEndsAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "masters"
        DROP COLUMN IF EXISTS "subscriptionStatus",
        DROP COLUMN IF EXISTS "trialEndsAt",
        DROP COLUMN IF EXISTS "currentPeriodEnd",
        DROP COLUMN IF EXISTS "plan"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "masters_subscriptionstatus_enum"`);
  }
}
