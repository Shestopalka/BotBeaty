import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * slotId запису робимо nullable — потрібно для обміну записів місцями
 * (тимчасове «відчеплення» слота в транзакції, щоб не конфліктувати з
 * partial-unique індексом на slotId).
 */
export class AppointmentSlotNullable1749440000000 implements MigrationInterface {
  name = 'AppointmentSlotNullable1749440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" ALTER COLUMN "slotId" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" ALTER COLUMN "slotId" SET NOT NULL`);
  }
}
