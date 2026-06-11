import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Початкова схема БД (усі таблиці, enum-и, FK, індекси).
 * Запускається першою в проді (migrationsRun=true). У dev схему створює synchronize,
 * тож ця міграція там не виконується.
 */
export class InitialSchema1749300000000 implements MigrationInterface {
  name = 'InitialSchema1749300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ─── Enums ────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE "masters_status_enum" AS ENUM ('active','inactive','suspended')`);
    await queryRunner.query(`CREATE TYPE "clients_tag_enum" AS ENUM ('new','regular','trusted','blocked','unwanted')`);
    await queryRunner.query(`CREATE TYPE "appointments_status_enum" AS ENUM ('pending','confirmed','cancelled_client','cancelled_master','completed','no_show')`);
    await queryRunner.query(`CREATE TYPE "payments_status_enum" AS ENUM ('pending','paid','refunded','failed')`);
    await queryRunner.query(`CREATE TYPE "payments_method_enum" AS ENUM ('telegram','cash','bank_transfer')`);
    await queryRunner.query(`CREATE TYPE "audit_logs_action_enum" AS ENUM ('INSERT','UPDATE','DELETE')`);

    // ─── masters ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "masters" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "telegramId" bigint NOT NULL,
        "username" character varying,
        "fullName" character varying NOT NULL,
        "phone" character varying,
        "avatarUrl" character varying,
        "bio" character varying,
        "city" character varying,
        "botToken" character varying,
        "botUsername" character varying,
        "botWebhookUrl" character varying,
        "status" "masters_status_enum" NOT NULL DEFAULT 'inactive',
        "specialties" text NOT NULL DEFAULT '',
        "theme" character varying(50) NOT NULL DEFAULT 'dusty_rose',
        "reminder1Enabled" boolean NOT NULL DEFAULT true,
        "reminder1Hours" integer NOT NULL DEFAULT 24,
        "reminder2Enabled" boolean NOT NULL DEFAULT true,
        "reminder2Hours" integer NOT NULL DEFAULT 2,
        "autoConfirm" boolean NOT NULL DEFAULT false,
        "cancellationHours" integer NOT NULL DEFAULT 0,
        "defaultWorkStart" character varying NOT NULL DEFAULT '09:00',
        "defaultWorkEnd" character varying NOT NULL DEFAULT '18:00',
        "defaultSlotDuration" integer NOT NULL DEFAULT 60,
        "defaultBreakMinutes" integer NOT NULL DEFAULT 15,
        "version" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_masters" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_masters_botToken" UNIQUE ("botToken"),
        CONSTRAINT "UQ_masters_botUsername" UNIQUE ("botUsername")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_masters_telegramId" ON "masters" ("telegramId")`);

    // ─── clients ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "clients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "telegramId" bigint NOT NULL,
        "username" character varying,
        "fullName" character varying NOT NULL,
        "phone" character varying,
        "tag" "clients_tag_enum" NOT NULL DEFAULT 'new',
        "notes" text,
        "masterId" uuid NOT NULL,
        CONSTRAINT "PK_clients" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_clients_telegramId_masterId" ON "clients" ("telegramId","masterId")`);

    // ─── services ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "services" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "name" character varying NOT NULL,
        "description" text,
        "durationMinutes" integer NOT NULL,
        "price" numeric(10,2) NOT NULL,
        "currency" character varying,
        "isActive" boolean NOT NULL DEFAULT true,
        "imageUrl" character varying,
        "masterId" uuid NOT NULL,
        CONSTRAINT "PK_services" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_services_price" CHECK ("price" >= 0),
        CONSTRAINT "CHK_services_duration" CHECK ("durationMinutes" > 0)
      )
    `);

    // ─── slots ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "slots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "masterId" uuid NOT NULL,
        "startAt" TIMESTAMPTZ NOT NULL,
        "endAt" TIMESTAMPTZ NOT NULL,
        "isBooked" boolean NOT NULL DEFAULT false,
        "version" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_slots" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_slots_range" CHECK ("endAt" > "startAt")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_slots_master_startAt" ON "slots" ("masterId","startAt")`);

    // ─── appointments ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "appointments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "status" "appointments_status_enum" NOT NULL DEFAULT 'pending',
        "clientId" uuid NOT NULL,
        "masterId" uuid NOT NULL,
        "serviceId" uuid NOT NULL,
        "slotId" uuid NOT NULL,
        "clientNote" text,
        "masterNote" text,
        "pricePaid" numeric(10,2) NOT NULL,
        "currency" character varying,
        "reminder24hSent" boolean NOT NULL DEFAULT false,
        "reminder2hSent" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_appointments_slotId" UNIQUE ("slotId")
      )
    `);

    // ─── payments ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMPTZ,
        "deletedBy" uuid,
        "appointmentId" uuid NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'UAH',
        "status" "payments_status_enum" NOT NULL DEFAULT 'pending',
        "method" "payments_method_enum" NOT NULL DEFAULT 'telegram',
        "telegramChargeId" character varying,
        "providerPaymentId" character varying,
        "providerMetadata" jsonb,
        "paidAt" TIMESTAMPTZ,
        "refundedAt" TIMESTAMPTZ,
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_appointmentId" UNIQUE ("appointmentId"),
        CONSTRAINT "CHK_payments_amount" CHECK ("amount" > 0)
      )
    `);

    // ─── audit_logs ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tableName" character varying NOT NULL,
        "recordId" uuid NOT NULL,
        "action" "audit_logs_action_enum" NOT NULL,
        "oldData" jsonb,
        "newData" jsonb,
        "changedBy" uuid,
        "changedByType" character varying,
        "ipAddress" character varying,
        "changedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_table_record" ON "audit_logs" ("tableName","recordId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_changedAt" ON "audit_logs" ("changedAt")`);

    // ─── Foreign keys ─────────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "clients" ADD CONSTRAINT "FK_clients_master" FOREIGN KEY ("masterId") REFERENCES "masters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "services" ADD CONSTRAINT "FK_services_master" FOREIGN KEY ("masterId") REFERENCES "masters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "slots" ADD CONSTRAINT "FK_slots_master" FOREIGN KEY ("masterId") REFERENCES "masters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_client" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_master" FOREIGN KEY ("masterId") REFERENCES "masters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_service" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD CONSTRAINT "FK_appointments_slot" FOREIGN KEY ("slotId") REFERENCES "slots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_appointment" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_appointment"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_slot"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_service"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_master"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_appointments_client"`);
    await queryRunner.query(`ALTER TABLE "slots" DROP CONSTRAINT "FK_slots_master"`);
    await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_services_master"`);
    await queryRunner.query(`ALTER TABLE "clients" DROP CONSTRAINT "FK_clients_master"`);

    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TABLE "slots"`);
    await queryRunner.query(`DROP TABLE "services"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP TABLE "masters"`);

    await queryRunner.query(`DROP TYPE "audit_logs_action_enum"`);
    await queryRunner.query(`DROP TYPE "payments_method_enum"`);
    await queryRunner.query(`DROP TYPE "payments_status_enum"`);
    await queryRunner.query(`DROP TYPE "appointments_status_enum"`);
    await queryRunner.query(`DROP TYPE "clients_tag_enum"`);
    await queryRunner.query(`DROP TYPE "masters_status_enum"`);
  }
}
