import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Master, MasterStatus, BeautySpecialty, SubscriptionStatus } from '../../database/entities/master.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { Slot } from '../../database/entities/slot.entity';
import { Service } from '../../database/entities/service.entity';
import { Client } from '../../database/entities/client.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { InjectDataSource } from '@nestjs/typeorm';
import { BotService } from '../bot/bot.service';

export interface RegisterMasterDto {
  telegramId: string;
  username?: string;
  fullName: string;
  phone?: string;
  specialties: BeautySpecialty[];
  city?: string;
  bio?: string;
  botToken: string;
}

@Injectable()
export class MasterService {
  constructor(
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
    private botService: BotService,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async register(dto: RegisterMasterDto): Promise<Partial<Master>> {
    // Перевіряємо чи майстер вже зареєстрований
    const existing = await this.masterRepo.findOne({
      where: { telegramId: dto.telegramId },
    });
    if (existing) throw new ConflictException('Майстер вже зареєстрований');

    // Перевіряємо чи токен не використовується
    const tokenExists = await this.masterRepo.findOne({
      where: { botToken: dto.botToken },
    });
    if (tokenExists) throw new ConflictException('Цей токен бота вже використовується');

    // Спочатку валідуємо токен через Telegram API — ДО запису в БД
    // Це гарантує: якщо токен невалідний, запис в БД не відбудеться
    const { username: botUsername } = await this.botService.registerMasterBot(
      { telegramId: dto.telegramId } as Master,
      dto.botToken,
      true, // dryRun — лише валідація, без запуску
    );

    // Тепер безпечно зберігаємо майстра і запускаємо бота в транзакції
    const saved = await this.dataSource.transaction(async (manager) => {
      const master = manager.getRepository(Master).create({
        telegramId: dto.telegramId,
        username: dto.username,
        fullName: dto.fullName,
        phone: dto.phone,
        specialties: dto.specialties,
        city: dto.city,
        bio: dto.bio,
        botToken: dto.botToken,
        botUsername,
        // ACTIVE одразу: токен уже провалідовано (dryRun вище), бота запускаємо нижче.
        // Інакше майстер лишався б INACTIVE і після рестарту loadMasterBots його не
        // підхопив би → не працювали б нотифікації й команди бота.
        status: MasterStatus.ACTIVE,
        // Підписка: 14 днів безкоштовного тріалу з моменту реєстрації.
        subscriptionStatus: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });
      return manager.getRepository(Master).save(master);
    });

    // Запускаємо бота (поза транзакцією — може зайняти час)
    await this.botService.activateMasterBot(saved);

    return this.sanitize(await this.findEntityById(saved.id));
  }

  async findByTelegramId(telegramId: string): Promise<Partial<Master>> {
    const master = await this.masterRepo.findOne({ where: { telegramId } });
    if (!master) throw new NotFoundException('Майстра не знайдено');
    return this.sanitize(master);
  }

  /**
   * Внутрішній метод — повертає повну сутність (з botToken).
   * НЕ повертати напряму клієнту.
   */
  private async findEntityById(id: string): Promise<Master> {
    const master = await this.masterRepo.findOne({
      where: { id },
      relations: ['services'],
    });
    if (!master) throw new NotFoundException('Майстра не знайдено');
    return master;
  }

  /** Публічний профіль для клієнта — без чутливих полів. */
  async findPublicById(id: string): Promise<Partial<Master>> {
    return this.sanitize(await this.findEntityById(id));
  }

  /**
   * ПОВНЕ видалення майстра і всіх його даних (безповоротно).
   * Порядок важливий через зовнішні ключі: записи → слоти/послуги/клієнти → майстер.
   * Наприкінці зупиняємо й «забуваємо» бота майстра.
   */
  async deleteMaster(masterId: string): Promise<{ deleted: true }> {
    const master = await this.masterRepo.findOne({ where: { id: masterId } });
    if (!master) throw new NotFoundException('Майстра не знайдено');

    await this.dataSource.transaction(async (manager) => {
      const appts = await manager.getRepository(Appointment).find({
        where: { masterId },
        select: ['id'],
        withDeleted: true,
      });
      const apptIds = appts.map((a) => a.id);

      // Аудит-лог (без FK, але прибираємо сміття): по записах майстра і по його діях.
      if (apptIds.length) {
        await manager.getRepository(AuditLog).delete({ recordId: In(apptIds) });
      }
      await manager.getRepository(AuditLog).delete({ changedBy: masterId });

      // Hard-delete у правильному порядку (bypass soft-delete).
      await manager.getRepository(Appointment).delete({ masterId });
      await manager.getRepository(Slot).delete({ masterId });
      await manager.getRepository(Service).delete({ masterId });
      await manager.getRepository(Client).delete({ masterId });
      await manager.getRepository(Master).delete({ id: masterId });
    });

    // Зупиняємо бота поза транзакцією (мережева дія).
    await this.botService.stopMasterBot(masterId).catch(() => {});
    return { deleted: true };
  }

  // Кеш аватарів у пам'яті: уникаємо зайвих звернень до Telegram на кожен запит.
  private static avatarCache = new Map<string, { buf: Buffer; type: string; at: number } | null>();
  private static readonly AVATAR_TTL_MS = 60 * 60 * 1000; // 1 год

  /**
   * Дістає фото профілю майстра з Telegram (через токен його бота).
   * Токен лишається на сервері — клієнт отримує лише байти картинки.
   * Повертає null, якщо фото немає або приховане налаштуваннями приватності.
   */
  async getTelegramAvatar(
    masterId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cached = MasterService.avatarCache.get(masterId);
    if (cached !== undefined && Date.now() - (cached?.at ?? 0) < MasterService.AVATAR_TTL_MS) {
      return cached ? { buffer: cached.buf, contentType: cached.type } : null;
    }

    const master = await this.masterRepo.findOne({ where: { id: masterId } });
    if (!master?.botToken || !master.telegramId) return null;
    const token = master.botToken;

    try {
      const photosRes = await fetch(
        `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${master.telegramId}&limit=1`,
      );
      const photos: any = await photosRes.json();
      const sizes = photos?.result?.photos?.[0];
      if (!Array.isArray(sizes) || sizes.length === 0) {
        MasterService.avatarCache.set(masterId, null);
        return null;
      }
      // Беремо найбільший розмір (останній у масиві).
      const fileId = sizes[sizes.length - 1].file_id;

      const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const fileJson: any = await fileRes.json();
      const filePath = fileJson?.result?.file_path;
      if (!filePath) return null;

      const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
      if (!imgRes.ok) return null;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const type = imgRes.headers.get('content-type') || 'image/jpeg';

      MasterService.avatarCache.set(masterId, { buf, type, at: Date.now() });
      return { buffer: buf, contentType: type };
    } catch {
      return null;
    }
  }

  /**
   * Оновлення власного профілю майстром.
   * Дозволяємо лише безпечний whitelist полів — НІКОЛИ botToken, status,
   * telegramId, version тощо (захист від mass-assignment).
   */
  async updateOwnProfile(masterId: string, body: Record<string, any>): Promise<Partial<Master>> {
    const updates: Partial<Master> = {};
    for (const key of MasterService.ALLOWED_UPDATE_FIELDS) {
      if (body[key] !== undefined) (updates as any)[key] = body[key];
    }
    if (Object.keys(updates).length) {
      await this.masterRepo.update(masterId, updates);
    }
    return this.sanitize(await this.findEntityById(masterId));
  }

  /**
   * Активувати/продовжити підписку на N місяців (ручна активація після оплати).
   * Якщо період ще не сплив — додаємо зверху, інакше від сьогодні.
   */
  async activateSubscription(
    masterId: string,
    opts: { plan?: string; months?: number } = {},
  ): Promise<Partial<Master>> {
    const planMonths: Record<string, number> = { starter: 1, pro: 3, year: 12 };
    const months = opts.months ?? (opts.plan ? planMonths[opts.plan] ?? 1 : 1);
    const master = await this.findEntityById(masterId);
    const now = new Date();
    const base =
      master.currentPeriodEnd && new Date(master.currentPeriodEnd) > now
        ? new Date(master.currentPeriodEnd)
        : now;
    const end = new Date(base);
    end.setMonth(end.getMonth() + months);
    const patch: Partial<Master> = {
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: end,
    };
    if (opts.plan) patch.plan = opts.plan;
    await this.masterRepo.update(masterId, patch);
    return this.sanitize(await this.findEntityById(masterId));
  }

  private static readonly ALLOWED_UPDATE_FIELDS = [
    'fullName', 'phone', 'avatarUrl', 'bio', 'city', 'specialties', 'theme',
    'reminder1Enabled', 'reminder1Hours', 'reminder2Enabled', 'reminder2Hours',
    'autoConfirm', 'cancellationHours', 'maxBookingsPerDayPerClient',
    'defaultWorkStart', 'defaultWorkEnd', 'defaultSlotDuration', 'defaultBreakMinutes',
  ] as const;

  private static readonly SENSITIVE_FIELDS = ['botToken', 'botWebhookUrl'] as const;

  /** Прибирає чутливі поля перед поверненням клієнту. */
  private sanitize(master: Master): Partial<Master> {
    const clone: any = { ...master };
    for (const f of MasterService.SENSITIVE_FIELDS) delete clone[f];
    return clone;
  }
}
