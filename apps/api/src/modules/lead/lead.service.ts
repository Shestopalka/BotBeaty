import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../database/entities/lead.entity';
import { CreateLeadDto } from './lead.dto';
import { LeadMailer } from './lead-mailer';

const HANDLE_RE = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  telegram: /^[A-Za-z][A-Za-z0-9_]{4,31}$/,
};

/** Приймаємо і нік, і вставлене посилання: instagram.com/nick, t.me/nick, @nick. */
export function normalizeHandle(raw: string): string {
  return String(raw ?? '').trim()
    .replace(/^(https?:\/\/)?(www\.)?(instagram\.com|t\.me|telegram\.me)\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@+/, '');
}

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);
  /** Простий ліміт у памʼяті: не більше 5 анкет з однієї IP за 10 хв. */
  private hits = new Map<string, number[]>();

  constructor(
    @InjectRepository(Lead) private repo: Repository<Lead>,
    private mailer: LeadMailer,
  ) {}

  private rateLimit(ip: string | null) {
    if (!ip) return;
    const now = Date.now();
    const list = (this.hits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS);
    if (list.length >= RATE_MAX) throw new HttpException('Забагато анкет. Спробуйте трохи пізніше.', HttpStatus.TOO_MANY_REQUESTS);
    list.push(now);
    this.hits.set(ip, list);
    if (this.hits.size > 5000) this.hits.clear(); // запобіжник від росту памʼяті
  }

  /** Повертає null, якщо спрацювала пастка для ботів (відповідаємо «ок», але нічого не робимо). */
  async create(dto: CreateLeadDto, ip: string | null): Promise<Lead | null> {
    if (dto.website?.trim()) {
      this.logger.warn(`Анкета-пастка відкинута (ip=${ip})`);
      return null;
    }
    this.rateLimit(ip);

    const name = dto.name.trim().replace(/\s+/g, ' ');
    const handle = normalizeHandle(dto.handle);
    if (!name) throw new BadRequestException('Вкажіть імʼя');
    if (!HANDLE_RE[dto.channel].test(handle)) {
      throw new BadRequestException(dto.channel === 'telegram'
        ? 'Нік у Telegram: від 5 символів, латинські літери, цифри або _'
        : 'Нік в Instagram: латинські літери, цифри, крапка або _');
    }

    const lead = await this.repo.save(this.repo.create({
      name, handle, channel: dto.channel,
      craft: dto.craft?.trim() || null,
      text: dto.text?.trim() || null,
      source: dto.source?.trim() || 'site',
      ip,
    }));

    // Лист — після збереження і не блокує відповідь сайту.
    void this.mailer.send(lead).then(ok => ok && this.repo.update(lead.id, { emailSent: true }))
      .catch(e => this.logger.warn(`lead email: ${e?.message}`));
    return lead;
  }
}
