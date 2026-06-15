import { MigrationInterface, QueryRunner } from 'typeorm';

/** Офлайн-клієнти: майстер може створити клієнта без Telegram ID. */
export class ClientTelegramOptional1749420000000 implements MigrationInterface {
  name = 'ClientTelegramOptional1749420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clients" ALTER COLUMN "telegramId" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Повертаємо NOT NULL лише якщо немає рядків із NULL (інакше впаде).
    await queryRunner.query(
      `ALTER TABLE "clients" ALTER COLUMN "telegramId" SET NOT NULL`,
    );
  }
}
