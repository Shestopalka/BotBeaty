import { escapeHtml, clientTelegramLine } from './telegram-format';
import { APP_TZ } from './time';

/**
 * Єдина «картка запису» для чату майстра з ботом: новий запис, підтверджено,
 * скасовано, завершено. Однаковий вигляд у сповіщеннях і після натискання кнопок.
 */

type CardApt = {
  id: string;
  pricePaid?: number | string | null;
  currency?: string | null;
  client?: { fullName?: string | null; username?: string | null; telegramId?: string | null; phone?: string | null } | null;
  service?: { name?: string | null; price?: number | string | null; priceMax?: number | string | null; priceType?: string | null; durationMinutes?: number | null } | null;
  slot?: { startAt?: Date | string | null; endAt?: Date | string | null } | null;
};

export type CardKind = 'new' | 'new_auto' | 'confirmed' | 'cancelled' | 'cancelled_by_client' | 'completed';

const TITLES: Record<CardKind, string> = {
  new: '🔔 <b>Новий запис</b>',
  new_auto: '🔔 <b>Новий запис</b>',
  confirmed: '✅ <b>Запис підтверджено</b>',
  cancelled: '❌ <b>Запис скасовано</b>',
  cancelled_by_client: '❌ <b>Клієнт скасував запис</b>',
  completed: '🌟 <b>Візит завершено</b>',
};

const FOOTERS: Partial<Record<CardKind, string>> = {
  new: '⏳ <i>Очікує вашого підтвердження</i>',
  new_auto: '✅ <i>Підтверджено автоматично</i>',
  cancelled_by_client: '<i>Час знову вільний для запису</i>',
  cancelled: '<i>Час знову вільний для запису</i>',
};

const SEP = '━━━━━━━━━━━━';

const dayFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: APP_TZ, weekday: 'short', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('uk-UA', { timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** «чт, 30 липня · 12:45–14:15» (за Києвом). */
export function formatWhen(start?: Date | string | null, end?: Date | string | null): string {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  return `${dayFmt.format(s)} · ${timeFmt.format(s)}${e && e > s ? `–${timeFmt.format(e)}` : ''}`;
}

/** «350 ₴» або «500–1000 ₴». */
export function formatPrice(apt: CardApt): string {
  const cur = !apt.currency || apt.currency === 'UAH' ? '₴' : apt.currency;
  const svc = apt.service;
  if (svc?.priceType === 'range' && svc.priceMax != null) {
    return `${Math.round(Number(svc.price))}–${Math.round(Number(svc.priceMax))} ${cur}`;
  }
  const v = Number(apt.pricePaid ?? svc?.price);
  return Number.isFinite(v) ? `${Math.round(v)} ${cur}` : '';
}

export function masterCardText(kind: CardKind, apt: CardApt): string {
  const c = apt.client;
  const price = formatPrice(apt);
  const lines = [
    TITLES[kind],
    SEP,
    `👤 <b>${escapeHtml(c?.fullName || '—')}</b>`,
    clientTelegramLine(c).trimEnd(),
    c?.phone ? `📞 ${escapeHtml(c.phone)}` : '',
    `💅 ${escapeHtml(apt.service?.name || '—')}${price ? ` · ${price}` : ''}`,
    `🗓 ${formatWhen(apt.slot?.startAt, apt.slot?.endAt)}`,
  ].filter(Boolean);
  const footer = FOOTERS[kind];
  if (footer) lines.push(SEP, footer);
  return lines.join('\n');
}

/** Посилання «написати клієнту» для кнопки — лише за ніком (t.me). tg://user у кнопці
 *  Telegram може відхилити через приватність клієнта, і тоді не дійде все повідомлення. */
function chatUrl(apt: CardApt): string | null {
  const nick = apt.client?.username?.trim().replace(/^@+/, '');
  return nick && /^[A-Za-z0-9_]{4,32}$/.test(nick) ? `https://t.me/${nick}` : null;
}

/**
 * Кнопки картки. Для підтвердженого запису ряд «Написати / Розклад» стоїть ПЕРШИМ —
 * щоб подвійне натискання «Підтвердити» не влучило в «Завершити» на тому ж місці.
 */
export function masterCardKeyboard(kind: CardKind, apt: CardApt, miniAppUrl?: string | null) {
  const nav: any[] = [];
  const url = chatUrl(apt);
  if (url) nav.push({ text: '💬 Написати клієнту', url });
  if (miniAppUrl) nav.push({ text: '📅 Розклад', web_app: { url: `${miniAppUrl}/master/schedule` } });

  const rows: any[][] = [];
  if (kind === 'new') {
    rows.push([
      { text: '✅ Підтвердити', callback_data: `confirm_apt:${apt.id}` },
      { text: '❌ Відхилити', callback_data: `cancel_apt:${apt.id}` },
    ]);
    if (nav.length) rows.push(nav);
  } else if (kind === 'confirmed' || kind === 'new_auto') {
    if (nav.length) rows.push(nav);
    rows.push([
      { text: '🌟 Завершити', callback_data: `complete_apt:${apt.id}` },
      { text: '❌ Скасувати', callback_data: `cancel_apt:${apt.id}` },
    ]);
  } else if (nav.length) {
    rows.push(nav);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export function masterCard(kind: CardKind, apt: CardApt, miniAppUrl?: string | null) {
  const reply_markup = masterCardKeyboard(kind, apt, miniAppUrl);
  return {
    text: masterCardText(kind, apt),
    extra: { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}) },
  };
}
