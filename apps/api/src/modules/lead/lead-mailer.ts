import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Lead } from '../../database/entities/lead.entity';
import { escapeHtml } from '../../common/telegram-format';

export function leadContactUrl(lead: Pick<Lead, 'channel' | 'handle'>): string {
  return lead.channel === 'telegram' ? `https://t.me/${lead.handle}` : `https://instagram.com/${lead.handle}`;
}

/** Тема й тіло листа про нову анкету (окремо — щоб тестувати без відправки). */
export function buildLeadEmail(lead: Lead): { subject: string; text: string; html: string } {
  const ch = lead.channel === 'telegram' ? 'Telegram' : 'Instagram';
  const url = leadContactUrl(lead);
  const when = new Date(lead.createdAt ?? Date.now()).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'long', timeStyle: 'short' });
  const subject = `Нова анкета з сайту: ${lead.name} (@${lead.handle}, ${ch})`;
  const rows: [string, string][] = [
    ['Імʼя', lead.name],
    [ch, `@${lead.handle}`],
    ['Сфера', lead.craft || '—'],
    ['Коментар', lead.text || '—'],
    ['Коли', when],
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nНаписати: ${url}`;
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#150810;color:#f5e0ee;border-radius:20px">
  <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#e8a0c8">BeatyBOTI · нова анкета</div>
  <h1 style="font-size:24px;margin:10px 0 18px">${escapeHtml(lead.name)} хоче спробувати</h1>
  <table style="width:100%;border-collapse:collapse;font-size:15px">
    ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#c7a2b9;width:110px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`).join('')}
  </table>
  <a href="${escapeHtml(url)}" style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:999px;background:#c860a8;color:#fff;text-decoration:none;font-weight:700">Написати в ${ch}</a>
</div>`;
  return { subject, text, html };
}

/**
 * Відправка листа. Два способи, обирається за змінними середовища:
 *  - RESEND_API_KEY — через HTTPS API Resend (працює на будь-якому тарифі Railway);
 *  - SMTP_HOST (+ SMTP_PORT/SMTP_USER/SMTP_PASS) — звичайна пошта через SMTP
 *    (на Railway вихідний SMTP доступний не на всіх тарифах).
 * Кому: LEADS_EMAIL_TO (можна кілька через кому). Від кого: LEADS_EMAIL_FROM.
 */
@Injectable()
export class LeadMailer {
  private readonly logger = new Logger(LeadMailer.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {}

  get configured(): boolean {
    return !!this.to() && (!!this.env('RESEND_API_KEY') || !!this.env('SMTP_HOST'));
  }

  private env(k: string): string { return (this.config.get<string>(k) ?? process.env[k] ?? '').trim(); }
  private to(): string[] { return this.env('LEADS_EMAIL_TO').split(',').map(s => s.trim()).filter(Boolean); }
  private from(): string { return this.env('LEADS_EMAIL_FROM') || 'BeatyBOTI <onboarding@resend.dev>'; }

  async send(lead: Lead): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(`Пошта для анкет не налаштована (LEADS_EMAIL_TO + RESEND_API_KEY або SMTP_HOST). Анкета ${lead.id} збережена в БД.`);
      return false;
    }
    const mail = buildLeadEmail(lead);
    try {
      if (this.env('RESEND_API_KEY')) await this.viaResend(mail);
      else await this.viaSmtp(mail);
      return true;
    } catch (e: any) {
      this.logger.error(`Лист про анкету ${lead.id} не надіслано: ${e?.message}`);
      return false;
    }
  }

  private async viaResend(mail: { subject: string; text: string; html: string }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from(), to: this.to(), subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  private async viaSmtp(mail: { subject: string; text: string; html: string }) {
    if (!this.transporter) {
      const port = Number(this.env('SMTP_PORT') || 465);
      this.transporter = nodemailer.createTransport({
        host: this.env('SMTP_HOST'), port, secure: port === 465,
        auth: this.env('SMTP_USER') ? { user: this.env('SMTP_USER'), pass: this.env('SMTP_PASS') } : undefined,
        connectionTimeout: 10_000,
      });
    }
    await this.transporter.sendMail({ from: this.env('LEADS_EMAIL_FROM') || this.env('SMTP_USER'), to: this.to(), subject: mail.subject, text: mail.text, html: mail.html });
  }
}
