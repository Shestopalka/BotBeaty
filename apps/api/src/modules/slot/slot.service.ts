import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull, MoreThanOrEqual } from 'typeorm';
import { Slot } from '../../database/entities/slot.entity';

const SLOT_TIMEZONE = 'Europe/Kyiv';

/** Зсув зони (мс) відносно UTC у конкретний момент — коректно враховує DST. */
function tzOffsetMs(timeZone: string, atUtcMs: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: any = Object.fromEntries(fmt.formatToParts(new Date(atUtcMs)).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return asUtc - atUtcMs;
}

/**
 * Перетворює "настінний" час у зоні (напр. 09:00 у Києві) на правильний UTC-момент,
 * враховуючи літній/зимовий час. Замінює хардкод +03:00, що ламався взимку.
 */
function zonedWallTimeToUtc(dateStr: string, timeStr: string, timeZone = SLOT_TIMEZONE): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, 0);
  return new Date(utcGuess - tzOffsetMs(timeZone, utcGuess));
}

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
      // Київський "настінний" час → UTC з урахуванням DST (без хардкоду +03:00)
      let current = zonedWallTimeToUtc(dateStr, dto.startTime);
      const dayEnd = zonedWallTimeToUtc(dateStr, dto.endTime);

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

    // ── Захист від ПЕРЕТИНІВ ─────────────────────────────────────────────
    // Не можна створювати слоти, що накладаються на наявні активні слоти
    // (напр. 10:00–11:00 і 10:10–12:00). Unique-індекс ловить лише однаковий
    // старт, а не перетин діапазонів — тож перевіряємо вручну.
    const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;
    const minStart = new Date(Math.min(...slots.map(s => s.startAt!.getTime())));
    const maxEnd = new Date(Math.max(...slots.map(s => s.endAt!.getTime())));
    const existing = await this.slotRepo.createQueryBuilder('s')
      .where('s.masterId = :m', { m: dto.masterId })
      .andWhere('s.deletedAt IS NULL')
      .andWhere('s."startAt" < :maxEnd AND s."endAt" > :minStart', { maxEnd, minStart })
      .getMany();

    const toInsert: Partial<Slot>[] = [];
    let partialConflict = false;
    for (const g of slots) {
      const gs = g.startAt!.getTime(), ge = g.endAt!.getTime();
      const ex = existing.find(e =>
        overlaps(gs, ge, new Date(e.startAt).getTime(), new Date(e.endAt).getTime()));
      if (ex) {
        // Точний дубль за часом старту — просто пропускаємо (вже існує).
        // Частковий перетин — це конфлікт, який треба показати майстру.
        if (new Date(ex.startAt).getTime() !== gs) partialConflict = true;
        continue;
      }
      // Перетин із уже відібраними в цьому ж батчі.
      if (toInsert.some(t => overlaps(gs, ge, t.startAt!.getTime(), t.endAt!.getTime()))) {
        partialConflict = true; continue;
      }
      toInsert.push(g);
    }

    if (!toInsert.length) {
      if (partialConflict) {
        throw new BadRequestException('Обраний час перетинається з наявними слотами.');
      }
      // Усе — точні дублікати: нічого нового не додаємо, повертаємо наявні.
      return this.slotRepo.find({
        where: slots.map(s => ({ masterId: dto.masterId, startAt: s.startAt! })),
        order: { startAt: 'ASC' },
      });
    }

    await this.slotRepo
      .createQueryBuilder()
      .insert()
      .into(Slot)
      .values(toInsert)
      .orIgnore() // на випадок гонки — не дублюємо по однаковому старту
      .execute();

    return this.slotRepo.find({
      where: slots.map(s => ({ masterId: dto.masterId, startAt: s.startAt! })),
      order: { startAt: 'ASC' },
    });
  }

  /**
   * Доступні (вільні) слоти майстра — для сторінки бронювання клієнта.
   */
  async getAvailable(masterId: string, from: Date, to: Date): Promise<Slot[]> {
    // Клієнт ніколи не повинен бачити минулі слоти. Навіть якщо фронт надішле
    // початок дня (00:00), зміщуємо нижню межу до поточного моменту.
    const now = new Date();
    const effectiveFrom = from.getTime() < now.getTime() ? now : from;
    if (effectiveFrom.getTime() >= to.getTime()) return [];
    return this.slotRepo.find({
      where: {
        masterId,
        isBooked: false,
        startAt: Between(effectiveFrom, to),
        deletedAt: IsNull(),
      },
      order: { startAt: 'ASC' },
    });
  }

  /**
   * Найближчий вільний слот майстра у майбутньому (або null).
   * Для вітального екрана клієнта — показати «найближче вільне».
   */
  async getNextAvailable(masterId: string): Promise<Slot | null> {
    return this.slotRepo.findOne({
      where: {
        masterId,
        isBooked: false,
        deletedAt: IsNull(),
        startAt: MoreThanOrEqual(new Date()),
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
    // SOFT delete: на слот можуть посилатися записи (напр. скасовані), тож hard
    // delete впав би на зовнішньому ключі (Internal Server Error). Ховаємо слот —
    // рядок лишається, історія записів ціла. Частковий unique-індекс
    // (masterId, startAt) WHERE deletedAt IS NULL дозволяє згодом створити
    // активний слот на той самий час.
    await this.slotRepo.softDelete(slotId);
  }
}
