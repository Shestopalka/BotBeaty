import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Master } from '../../database/entities/master.entity';
import * as crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface ParsedInitData {
  user: TelegramUser;
  chat_instance?: string;
  chat_type?: string;
  auth_date: number;
  hash: string;
  start_param?: string;
}

@Injectable()
export class TelegramAuthService {
  constructor(
    private configService: ConfigService,
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
  ) {}

  /**
   * Валідує Telegram WebApp initData підпис.
   */
  validate(initData: string, botToken: string): ParsedInitData {
    if (!initData) throw new UnauthorizedException('initData відсутній');

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new UnauthorizedException('hash відсутній');

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      throw new UnauthorizedException('Невалідний підпис initData');
    }

    const authDate = parseInt(params.get('auth_date') ?? '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      throw new UnauthorizedException('initData застарів');
    }

    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('user відсутній в initData');

    return {
      user: JSON.parse(userRaw),
      chat_instance: params.get('chat_instance') ?? undefined,
      chat_type: params.get('chat_type') ?? undefined,
      auth_date: authDate,
      hash,
      start_param: params.get('start_param') ?? undefined,
    };
  }

  validateWithPlatformToken(initData: string): ParsedInitData {
    const token = this.configService.get<string>('telegram.platformBotToken');
    if (!token) throw new UnauthorizedException('Бот токен не налаштований');
    return this.validate(initData, token);
  }

  /**
   * Авто-детекція токену: спочатку пробує platform token,
   * якщо не підходить — шукає майстра по telegramId і валідує його токеном.
   * Це потрібно бо Mini App відкривається з бота майстра (підписаний його токеном).
   */
  async validateAutoDetect(initData: string): Promise<ParsedInitData> {
    // Спроба 1: platform token
    try {
      return this.validateWithPlatformToken(initData);
    } catch {
      // не підійшов — пробуємо токен майстра
    }

    // Витягуємо telegramId без перевірки хешу (тільки для пошуку)
    const params = new URLSearchParams(initData);
    const userRaw = params.get('user');
    if (!userRaw) throw new UnauthorizedException('user відсутній в initData');

    let telegramId: string;
    try {
      telegramId = String(JSON.parse(userRaw).id);
    } catch {
      throw new UnauthorizedException('Невалідний user в initData');
    }

    // Шукаємо майстра і валідуємо його токеном
    const master = await this.masterRepo.findOne({ where: { telegramId } });
    if (!master?.botToken) {
      throw new UnauthorizedException('Невалідний підпис initData');
    }

    return this.validate(initData, master.botToken);
  }

  /**
   * Валідація для клієнтів: initData підписаний токеном бота конкретного майстра.
   * Використовується коли клієнт відкриває Mini App з бота майстра (/book/:masterId).
   */
  async validateForClient(initData: string, masterId: string): Promise<ParsedInitData> {
    const master = await this.masterRepo.findOne({ where: { id: masterId } });
    if (!master?.botToken) {
      throw new UnauthorizedException('Майстра не знайдено або бот не налаштований');
    }
    return this.validate(initData, master.botToken);
  }

  /**
   * Знаходить id майстра за telegramId автентифікованого користувача.
   * Повертає лише id (достатньо для перевірки ownership) — не тягне botToken.
   */
  async findMasterIdByTelegramId(telegramId: string): Promise<string | null> {
    const master = await this.masterRepo.findOne({
      where: { telegramId },
      select: ['id'],
    });
    return master?.id ?? null;
  }
}
