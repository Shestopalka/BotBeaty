import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Master, MasterStatus, BeautySpecialty } from '../../database/entities/master.entity';
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

  private static readonly ALLOWED_UPDATE_FIELDS = [
    'fullName', 'phone', 'avatarUrl', 'bio', 'city', 'specialties', 'theme',
    'reminder1Enabled', 'reminder1Hours', 'reminder2Enabled', 'reminder2Hours',
    'autoConfirm', 'cancellationHours',
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
