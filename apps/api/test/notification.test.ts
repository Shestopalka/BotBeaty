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
  assert.match(sent[0].text, /Клієнт: Аня &lt;3/);
  assert.match(sent[0].text, /10:00/); // 08:00 UTC = 10:00 Київ
  assert.equal(sent[0].extra.parse_mode, 'HTML');
});
