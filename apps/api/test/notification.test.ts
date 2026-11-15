/**
 * Повідомлення майстру про новий запис: ТГ клієнта + HTML-екранування.
 * Запуск: node -r ts-node/register/transpile-only --test test/notification.test.ts
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { clientTelegramLine, escapeHtml, NotificationProcessor } from '../src/modules/notification/notification.processor';

test('clientTelegramLine: nick shown as @nick', () => {
  assert.equal(clientTelegramLine({ username: 'anna_nails', telegramId: '1' }), '🔗 Нік: @anna_nails\n');
  assert.equal(clientTelegramLine({ username: '@anna_nails', telegramId: '1' }), '🔗 Нік: @anna_nails\n');
});

test('clientTelegramLine: no nick → profile link by id', () => {
  const line = clientTelegramLine({ username: null, telegramId: '123456' });
  assert.match(line, /<a href="tg:\/\/user\?id=123456">написати клієнту<\/a>/);
});

test('clientTelegramLine: offline client → empty; garbage nick → link', () => {
  assert.equal(clientTelegramLine({ username: null, telegramId: null }), '');
  assert.equal(clientTelegramLine(null), '');
  assert.match(clientTelegramLine({ username: '<b>x', telegramId: '9' }), /tg:\/\/user\?id=9/);
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('Аня <3 & Co'), 'Аня &lt;3 &amp; Co');
});

test('master new-booking message contains client nick', async () => {
  const sent: any[] = [];
  const apt: any = {
    id: 'a1', pricePaid: 500, currency: 'UAH',
    client: { fullName: 'Аня <3', username: 'anna_nails', telegramId: '42', phone: null },
    service: { name: 'Манікюр', priceType: 'fixed', price: 500 },
    slot: { startAt: new Date('2026-11-14T08:00:00Z') },
    master: { id: 'm1' },
  };
  const proc: any = Object.create(NotificationProcessor.prototype);
  proc.logger = { warn: () => {} };
  proc.appointmentRepo = { findOne: async () => apt };
  proc.botService = {
    sendToClient: async () => {},
    sendToMaster: async (_m: any, text: string, extra: any) => { sent.push({ text, extra }); },
  };
  await proc.handleAppointmentCreated({ appointmentId: 'a1', masterId: 'm1', clientTelegramId: '42' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /🔗 Нік: @anna_nails/);
  assert.match(sent[0].text, /<b>Аня &lt;3<\/b>/);
  assert.match(sent[0].text, /10:00/); // 08:00 UTC = 10:00 Київ
  assert.equal(sent[0].extra.parse_mode, 'HTML');
});

test('bot buttons: confirmed/cancelled message keeps client nick', async () => {
  const { AppointmentCallbackHandler } = await import('../src/modules/bot/handlers/appointment-callback.handler');
  const apt: any = {
    id: 'a1', masterId: 'm1', status: 'confirmed',
    client: { fullName: 'Аня <3', username: 'anna_nails', telegramId: '1' },
    service: { name: 'Манікюр' }, slot: { startAt: new Date('2026-07-30T09:45:00Z') },
  };
  const repo: any = { findOne: async () => apt };
  const h = new AppointmentCallbackHandler(repo, {} as any, {} as any, {} as any, {} as any);
  const edits: string[] = [];
  const ctx: any = {
    answerCbQuery: async () => {}, callbackQuery: { data: 'confirm_apt:a1' },
    editMessageText: async (t: string) => { edits.push(t); }, reply: async () => {},
  };
  await h.handle(ctx, 'm1');
  apt.status = 'cancelled_master';
  ctx.callbackQuery.data = 'cancel_apt:a1';
  await h.handle(ctx, 'm1');
  assert.equal(edits.length, 2);
  for (const t of edits) {
    assert.match(t, /@anna_nails/);
    assert.match(t, /Аня &lt;3/);
  }
});

test('master card: layout, keyboard order, no tg:// in buttons', async () => {
  const { masterCard } = await import('../src/common/master-card');
  const apt: any = {
    id: 'a1', pricePaid: 600, currency: 'UAH',
    client: { fullName: 'Анна', username: 'anna_nails', telegramId: '1', phone: '+380501112233' },
    service: { name: 'Манікюр', priceType: 'fixed', price: 600 },
    slot: { startAt: new Date('2026-07-30T09:45:00Z'), endAt: new Date('2026-07-30T11:15:00Z') },
  };
  const n = masterCard('new', apt, 'https://app.example');
  assert.match(n.text, /чт, 30 липня · 12:45–14:15/);
  assert.match(n.text, /Манікюр · 600 ₴/);
  assert.equal(n.extra.reply_markup!.inline_keyboard[0][0].callback_data, 'confirm_apt:a1');
  assert.equal(n.extra.reply_markup!.inline_keyboard[1][0].url, 'https://t.me/anna_nails');

  // Підтверджений: перший ряд — безпечні кнопки (захист від подвійного тапу).
  const c = masterCard('confirmed', apt, 'https://app.example');
  const rows = c.extra.reply_markup!.inline_keyboard;
  assert.ok(rows[0].every((b: any) => !b.callback_data));
  assert.equal(rows[1][0].callback_data, 'complete_apt:a1');

  // Без ніка — кнопки «Написати» немає (tg:// у кнопці Telegram може відхилити).
  const noNick = masterCard('confirmed', { ...apt, client: { ...apt.client, username: null } }, null);
  const all = JSON.stringify(noNick.extra.reply_markup);
  assert.ok(!all.includes('tg://') && !all.includes('t.me'));
  assert.match(noNick.text, /tg:\/\/user\?id=1/);
});

test('auto-confirm: master gets no «Підтвердити», client gets no «очікуємо»', async () => {
  const sent: any[] = []; const toClient: string[] = [];
  const apt: any = {
    id: 'a2', status: 'confirmed', pricePaid: 500, currency: 'UAH',
    client: { fullName: 'Аня', username: 'anna_nails', telegramId: '42' },
    service: { name: 'Манікюр', priceType: 'fixed', price: 500 },
    slot: { startAt: new Date('2026-11-14T08:00:00Z') }, master: { id: 'm1' },
  };
  const proc: any = Object.create(NotificationProcessor.prototype);
  proc.logger = { warn: () => {} };
  proc.appointmentRepo = { findOne: async () => apt };
  proc.botService = {
    sendToClient: async (_m: any, _c: any, t: string) => { toClient.push(t); },
    sendToMaster: async (_m: any, text: string, extra: any) => { sent.push({ text, extra }); },
  };
  await proc.handleAppointmentCreated({ appointmentId: 'a2', masterId: 'm1', clientTelegramId: '42' });
  const kb = JSON.stringify(sent[0].extra.reply_markup);
  assert.ok(!kb.includes('confirm_apt:'));
  assert.ok(kb.includes('complete_apt:a2') && kb.includes('cancel_apt:a2'));
  assert.match(sent[0].text, /Підтверджено автоматично/);
  assert.doesNotMatch(toClient[0], /Очікуємо/);

  apt.status = 'pending'; sent.length = 0; toClient.length = 0;
  await proc.handleAppointmentCreated({ appointmentId: 'a2', masterId: 'm1', clientTelegramId: '42' });
  assert.ok(JSON.stringify(sent[0].extra.reply_markup).includes('confirm_apt:a2'));
  assert.match(toClient[0], /Очікуємо/);
});
