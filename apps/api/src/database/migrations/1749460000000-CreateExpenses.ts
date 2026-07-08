import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Таблиця витрат майстра (журнал витрат на матеріали тощо) — для розрахунку
 * чистого доходу в аналітиці.
 */
export class CreateExpenses1749460000000 implements MigrationInterface {
  name = 'CreateExpenses1749460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "expenses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "masterId" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "description" text,
        "spentAt" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_expenses" PRIMARY KEY ("id"),
        CONSTRAINT "FK_expenses_master" FOREIGN KEY ("masterId")
          REFERENCES "masters"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_expenses_master_spentAt" ON "expenses" ("masterId", "spentAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_expenses_master_spentAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "expenses"`);
  }
}
