import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CreateLeadDto } from './lead.dto';
import { LeadService } from './lead.service';

/** Перша IP із X-Forwarded-For (Railway стоїть за проксі). */
export function clientIp(req: any): string | null {
  const xff = String(req?.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return (xff || req?.ip || req?.socket?.remoteAddress || '').slice(0, 64) || null;
}

@Controller('leads')
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  // Публічний: анкету заповнює людина на сайті, без Telegram.
  @Public()
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateLeadDto, @Req() req: any): Promise<{ ok: true }> {
    await this.leads.create(dto, clientIp(req));
    return { ok: true };
  }
}
