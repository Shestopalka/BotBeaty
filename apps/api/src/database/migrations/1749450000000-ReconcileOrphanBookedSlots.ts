import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Одноразова реконсиляція: звільняємо «осиротілі» слоти — позначені зайнятими
 * (isBooked=true), але БЕЗ жодного активного запису. Такі слоти могли з'явитись
 * через баг у reschedule (save(apt) із завантаженою реляцією slot перебивав
 * зміну slotId, лишаючи новий слот зайнятим без запису). Корінь виправлено в
 * коді; ця міграція чистить уже наявні дані.
 */
export class ReconcileOrphanBookedSlots1749450000000 implements MigrationInterface {
  name = 'ReconcileOrphanBookedSlots1749450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "slots" s
      SET "isBooked" = false
      WHERE s."isBooked" = true
        AND s."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "appointments" a
          WHERE a."slotId" = s."id"
            AND a."deletedAt" IS NULL
            AND a."status" NOT IN ('cancelled_client', 'cancelled_master', 'no_show')
        );
    `);
  }

  public async down(): Promise<void> {
    // Не оборотно — відновити «зайнятість» осиротілих слотів неможливо й не потрібно.
  }
}
