import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Воронка «реклама → майстер»: журнал подій + два представлення.
 *  - funnel_daily — по днях (за Києвом) і джерелах: унікальні люди на кожному кроці.
 *  - funnel_leads — один рядок на людину: джерело і час кожного кроку.
 * Джерело людини — з її ПЕРШОГО /start (first touch); без /start — 'direct'.
 */
export class AddFunnelEvents1749480000000 implements MigrationInterface {
  name = 'AddFunnelEvents1749480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "funnel_events" (
        "id"         uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "telegramId" varchar(32)  NOT NULL,
        "event"      varchar(40)  NOT NULL,
        "source"     varchar(64),
        "createdAt"  timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_funnel_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_funnel_events_tg_event" ON "funnel_events" ("telegramId", "event")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_funnel_events_created" ON "funnel_events" ("createdAt")
    `);

    // Джерело людини = джерело її першого /start.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW "funnel_daily" AS
      WITH first_source AS (
        SELECT DISTINCT ON ("telegramId") "telegramId", "source"
        FROM "funnel_events"
        WHERE "event" = 'bot_start'
        ORDER BY "telegramId", "createdAt"
      )
      SELECT
        (e."createdAt" AT TIME ZONE 'Europe/Kyiv')::date                                    AS "day",
        COALESCE(fs."source", 'direct')                                                     AS "source",
        COUNT(DISTINCT e."telegramId") FILTER (WHERE e."event" = 'bot_start')              AS "start",
        COUNT(DISTINCT e."telegramId") FILTER (WHERE e."event" = 'onboarding_open')        AS "onboarding",
        COUNT(DISTINCT e."telegramId") FILTER (WHERE e."event" = 'onboarding_token_step')  AS "token_step",
        COUNT(DISTINCT e."telegramId") FILTER (WHERE e."event" = 'registered')             AS "registered"
      FROM "funnel_events" e
      LEFT JOIN first_source fs ON fs."telegramId" = e."telegramId"
      GROUP BY 1, 2
    `);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW "funnel_leads" AS
      WITH first_source AS (
        SELECT DISTINCT ON ("telegramId") "telegramId", "source"
        FROM "funnel_events"
        WHERE "event" = 'bot_start'
        ORDER BY "telegramId", "createdAt"
      )
      SELECT
        e."telegramId",
        COALESCE(fs."source", 'direct')                                    AS "source",
        MIN(e."createdAt") FILTER (WHERE e."event" = 'bot_start')             AS "startedAt",
        MIN(e."createdAt") FILTER (WHERE e."event" = 'onboarding_open')       AS "onboardingAt",
        MIN(e."createdAt") FILTER (WHERE e."event" = 'onboarding_token_step') AS "tokenStepAt",
        MIN(e."createdAt") FILTER (WHERE e."event" = 'registered')            AS "registeredAt",
        m."id"                                                             AS "masterId"
      FROM "funnel_events" e
      LEFT JOIN first_source fs ON fs."telegramId" = e."telegramId"
      LEFT JOIN "masters" m ON m."telegramId"::text = e."telegramId" AND m."deletedAt" IS NULL
      GROUP BY e."telegramId", fs."source", m."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "funnel_leads"`);
    await queryRunner.query(`DROP VIEW IF EXISTS "funnel_daily"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "funnel_events"`);
  }
}
