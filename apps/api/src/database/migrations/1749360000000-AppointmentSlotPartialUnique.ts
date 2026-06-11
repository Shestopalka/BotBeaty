import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Слот можна перебронювати після скасування. Повний unique на slotId це блокував
 * (скасований запис тримав slotId → новий INSERT падав на UQ_appointments_slotId).
 * Замінюємо на ЧАСТКОВИЙ unique: лише для активних записів (не cancelled/no_show).
 */
export class AppointmentSlotPartialUnique1749360000000 implements MigrationInterface {
  name = 'AppointmentSlotPartialUnique1749360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "UQ_appointments_slotId"`);
    // На випадок, якщо в dev unique був як індекс, а не constraint:
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_appointments_slotId"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_appointments_active_slot"
      ON "appointments" ("slotId")
      WHERE "deletedAt" IS NULL
        AND status NOT IN ('cancelled_client','cancelled_master','no_show')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_appointments_active_slot"`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "UQ_appointments_slotId" UNIQUE ("slotId")`);
  }
}
