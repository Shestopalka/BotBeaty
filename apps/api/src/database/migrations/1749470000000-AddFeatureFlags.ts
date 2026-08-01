import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeatureFlags1749470000000 implements MigrationInterface {
  name = 'AddFeatureFlags1749470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Персональні feature-flag overrides у майстра ────────────────────────
    await queryRunner.query(`
      ALTER TABLE "masters"
        ADD COLUMN IF NOT EXISTS "featureFlags" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

    // ── Глобальні feature flags платформи ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "feature_flags" (
        "key"         varchar(100) PRIMARY KEY,
        "enabled"     boolean      NOT NULL DEFAULT false,
        "description" text,
        "createdAt"   timestamptz  NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // Реєструємо відомі фічі (глобально вимкнені за замовчуванням).
    await queryRunner.query(`
      INSERT INTO "feature_flags" ("key", "enabled", "description")
      VALUES ('calendar_day_view', false, 'Розклад дня у вигляді погодинного таймлайну, як у календарі iPhone')
      ON CONFLICT ("key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_flags"`);
    await queryRunner.query(`
      ALTER TABLE "masters" DROP COLUMN IF EXISTS "featureFlags"
    `);
  }
}
