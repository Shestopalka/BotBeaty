import { MigrationInterface, QueryRunner } from 'typeorm';

/** Анкети «Напишіть нам» з сайту-лендингу. */
export class AddLeads1749490000000 implements MigrationInterface {
  name = 'AddLeads1749490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leads" (
        "id"        uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "name"      varchar(80)  NOT NULL,
        "channel"   varchar(16)  NOT NULL,
        "handle"    varchar(64)  NOT NULL,
        "craft"     varchar(60),
        "text"      text,
        "source"    varchar(32),
        "ip"        varchar(64),
        "emailSent" boolean      NOT NULL DEFAULT false,
        "createdAt" timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leads" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_leads_created" ON "leads" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "leads"`);
  }
}
