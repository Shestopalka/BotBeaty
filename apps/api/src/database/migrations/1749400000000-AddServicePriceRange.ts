import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ціна послуги: фіксована або діапазон «від–до» (price = від, priceMax = до). */
export class AddServicePriceRange1749400000000 implements MigrationInterface {
  name = 'AddServicePriceRange1749400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'services_pricetype_enum') THEN
           CREATE TYPE "services_pricetype_enum" AS ENUM ('fixed', 'range');
         END IF;
       END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "priceType" "services_pricetype_enum" NOT NULL DEFAULT 'fixed'`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "priceMax" numeric(10,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "priceMax"`);
    await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "priceType"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "services_pricetype_enum"`);
  }
}
