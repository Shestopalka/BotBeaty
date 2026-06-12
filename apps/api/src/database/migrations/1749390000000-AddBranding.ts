import { MigrationInterface, QueryRunner } from 'typeorm';

/** Брендинг Pro/Year: власний акцентний колір сторінки запису. */
export class AddBranding1749390000000 implements MigrationInterface {
  name = 'AddBranding1749390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "masters" ADD COLUMN IF NOT EXISTS "accentColor" character varying(9)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "masters" DROP COLUMN IF EXISTS "accentColor"`);
  }
}
