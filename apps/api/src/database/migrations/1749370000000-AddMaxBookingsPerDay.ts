import { MigrationInterface, QueryRunner } from 'typeorm';

/** Налаштування майстра: скільки активних записів один клієнт може мати на один день. */
export class AddMaxBookingsPerDay1749370000000 implements MigrationInterface {
  name = 'AddMaxBookingsPerDay1749370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "masters" ADD COLUMN IF NOT EXISTS "maxBookingsPerDayPerClient" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "masters" DROP COLUMN IF EXISTS "maxBookingsPerDayPerClient"`,
    );
  }
}
