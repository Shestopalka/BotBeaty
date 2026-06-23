import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Робимо unique-індекс слотів ЧАСТКОВИМ (лише активні слоти).
 * Тоді видалення слота можна робити soft-delete (без падіння на зовнішньому
 * ключі від записів), а повторне створення слота на той самий час не блокується
 * раніше видаленим рядком.
 */
export class SlotsPartialUnique1749430000000 implements MigrationInterface {
  name = 'SlotsPartialUnique1749430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_slots_master_startAt"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_slots_master_startAt" ON "slots" ("masterId", "startAt") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_slots_master_startAt"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_slots_master_startAt" ON "slots" ("masterId", "startAt")`,
    );
  }
}
