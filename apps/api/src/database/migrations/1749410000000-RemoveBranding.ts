import { MigrationInterface, QueryRunner } from 'typeorm';

/** Прибрано фічу «Колір бренду» — видаляємо невикористовуваний стовпець. */
export class RemoveBranding1749410000000 implements MigrationInterface {
  name = 'RemoveBranding1749410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "masters" DROP COLUMN IF EXISTS "accentColor"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "masters" ADD COLUMN IF NOT EXISTS "accentColor" character varying(9)`,
    );
  }
}
