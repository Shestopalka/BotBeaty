import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { Slot } from '../../database/entities/slot.entity';

export interface CreateSlotsDto {
  masterId: string;
  dates: string[];         // ['2026-06-10', '2026-06-11']
  startTime: string;       // '09:00'
  endTime: string;         // '18:00'
  slotDurationMinutes: number; // 60
  breakMinutes?: number;   // 15 — перерва між слотами
}

@Injectable()
export class SlotService {
  constructor(
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
  ) {}

  /**
   * Масове створення слотів для майстра
   * Наприклад: весь робочий тиждень по 60 хв слотів
   */
  async createBulk(dto: CreateSlotsDto): Promise<Slot[]> {
    const slots: Partial<Slot>[] = [];

    for (const dateStr of dto.dates) {
      const [startH, startM] = dto.startTime.split(':').map(Number);
      const [endH, endM] = dto.endTime.split(':').map(Number);

      let current = new Date(`${dateStr}T${dto.startTime}:00+03:00`);
      const dayEnd = new Date(`${dateStr}T${dto.endTime}:00+03:00`);

      while (current < dayEnd) {
        const slotEnd = new Date(
          current.getTime() + dto.slotDurationMinutes * 60 * 1000,
        );

        if (slotEnd > dayEnd) break;

        slots.push({
          masterId: dto.masterId,
          startAt: new Date(current),
          endAt: new Date(slotEnd),
          isBooked: false,
        });

        // Наступний слот = кінець + перерва
        current = new Date(
          slotEnd.getTime() + (dto.breakMinutes || 0) * 60 * 1000,
        );
      }
    }

    if (!slots.length) throw new BadRequestException('Не вдалось згенерувати слоти');

    // INSERT ... ON CONFLICT DO NOTHING — ігноруємо дублікати по (masterId, startAt)
    const startTimes = slots.map(s => s.startAt!);

    // Прибираємо РАНІШЕ soft-deleted слоти на ці ж часи (hard delete).
    // Інакше unique-індекс (masterId, startAt) включає видалені рядки, і
    // повторне створення слота на той самий час мовчки ігнорується (orIgnore).
    if (startTimes.length) {
      await this.slotRepo
        .createQueryBuilder()
        .delete()
        .from(Slot)
        .where('"masterId" = :masterId', { masterId: dto.masterId })
        .andWhere('"startAt" IN (:...times)', { times: startTimes })
        .andWhere('"deletedAt" IS NOT NULL')
        .execute();
    }

    await this.slotRepo
      .createQueryBuilder()
      .insert()
      .into(Slot)
      .values(slots)
      .orIgnore() // конфлікт лише з активними/заброньованими слотами — їх не дублюємо
      .execute();

    // Повертаємо всі активні слоти на ці часи
    return this.slotRepo.find({
      where: startTimes.map(startAt => ({ masterId: dto.masterId, startAt })),
      order: { startAt: 'ASC' },
    });
  }

  /**
   * Доступні (вільні) слоти майстра — для сторінки бронювання клієнта.
   */
  async getAvailable(masterId: string, from: Date, to: Date): Promise<Slot[]> {
    return this.slotRepo.find({
      where: {
        masterId,
        isBooked: false,
        startAt: Between(from, to),
        deletedAt: IsNull(),
      },
      order: { startAt: 'ASC' },
    });
  }

  /**
   * УСІ слоти майстра (вільні + заброньовані) — для сторінки керування слотами.
   * Майстер має бачити і зайнятий час, не лише вільний.
   */
  async getForMaster(masterId: string, from: Date, to: Date): Promise<Slot[]> {
    return this.slotRepo.find({
      where: {
        masterId,
        startAt: Between(from, to),
        deletedAt: IsNull(),
      },
      order: { startAt: 'ASC' },
    });
  }

  async deleteSlot(slotId: string, masterId: string): Promise<void> {
    const slot = await this.slotRepo.findOne({
      where: { id: slotId, masterId, isBooked: false },
    });
    if (!slot) throw new NotFoundException('Слот не знайдено або він вже зайнятий');
    // HARD delete: слот вільний (не звʼязаний із записом), тож видаляємо назовсім,
    // щоб звільнити час (masterId, startAt) для повторного створення.
    await this.slotRepo.delete({ id: slotId });
  }
}
