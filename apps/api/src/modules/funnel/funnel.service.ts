import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelEvent, FunnelEventName } from '../../database/entities/funnel-event.entity';

/**
 * Параметр зі ссилки t.me/<bot>?start=<payload>. Telegram дозволяє лише
 * [A-Za-z0-9_-] до 64 символів — усе інше пишемо як 'unknown', порожній — 'direct'.
 */
export function normalizeStartSource(payload: unknown): string {
  const s = typeof payload === 'string' ? payload.trim() : '';
  if (!s) return 'direct';
  return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : 'unknown';
}

@Injectable()
export class FunnelService {
  private readonly logger = new Logger(FunnelService.name);

  constructor(
    @InjectRepository(FunnelEvent)
    private readonly repo: Repository<FunnelEvent>,
  ) {}

  /**
   * Записати подію воронки. НІКОЛИ не кидає — аналітика не має ламати
   * реєстрацію чи відповідь бота.
   */
  async track(telegramId: string | number | undefined | null, event: FunnelEventName, source?: string | null): Promise<void> {
    if (telegramId === undefined || telegramId === null || telegramId === '' || String(telegramId) === '0') return;
    try {
      await this.repo.insert({
        telegramId: String(telegramId).slice(0, 32),
        event,
        source: event === FunnelEventName.BOT_START ? (source ?? 'direct') : null,
      });
    } catch (e: any) {
      this.logger.warn(`funnel track (${event}) failed: ${e?.message}`);
    }
  }
}
