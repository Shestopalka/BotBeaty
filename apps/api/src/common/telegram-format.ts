/** Екранування для parse_mode: 'HTML' — імʼя з «<» чи «&» інакше ламає все повідомлення. */
export function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Рядок «ТГ клієнта» для майстра.
 *  - є @нік → «🔗 Нік: @nick» (Telegram сам робить його клікабельним);
 *  - ніку немає, але є telegramId → посилання на профіль, щоб майстриня могла
 *    написати клієнтці напряму (у багатьох користувачів нік не заданий);
 *  - офлайн-клієнт (записала майстриня) → нічого.
 */
export function clientTelegramLine(client?: { username?: string | null; telegramId?: string | null; fullName?: string | null } | null): string {
  if (!client) return '';
  const nick = client.username?.trim().replace(/^@+/, '');
  if (nick && /^[A-Za-z0-9_]{4,32}$/.test(nick)) return `🔗 Нік: @${nick}\n`;
  if (client.telegramId) {
    return `🔗 Telegram: <a href="tg://user?id=${encodeURIComponent(String(client.telegramId))}">написати клієнту</a> (нік не вказано)\n`;
  }
  return '';
}
