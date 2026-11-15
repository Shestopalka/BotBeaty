import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { LeadService, normalizeHandle } from '../src/modules/lead/lead.service';
import { buildLeadEmail } from '../src/modules/lead/lead-mailer';
import { clientIp } from '../src/modules/lead/lead.controller';

function make(mailOk = true) {
  const saved: any[] = []; const updates: any[] = []; const mails: any[] = [];
  const repo: any = {
    create: (x: any) => x,
    save: async (x: any) => { const r = { id: 'L' + (saved.length + 1), createdAt: new Date('2026-11-15T10:00:00Z'), ...x }; saved.push(r); return r; },
    update: async (id: string, patch: any) => { updates.push({ id, patch }); },
  };
  const mailer: any = { send: async (l: any) => { mails.push(l); return mailOk; } };
  return { svc: new LeadService(repo, mailer), saved, updates, mails };
}
const flush = () => new Promise(r => setImmediate(r));

test('normalizeHandle: links and @ are stripped', () => {
  assert.equal(normalizeHandle('@anna.nails'), 'anna.nails');
  assert.equal(normalizeHandle('https://www.instagram.com/anna.nails/?igsh=x'), 'anna.nails');
  assert.equal(normalizeHandle('t.me/anna_k'), 'anna_k');
  assert.equal(normalizeHandle('https://t.me/anna_nails'), 'anna_nails');
});

test('lead: saved, emailed, emailSent=true', async () => {
  const { svc, saved, updates, mails } = make(true);
  await svc.create({ name: '  Анна  ', channel: 'instagram', handle: '@anna.nails', craft: 'Манікюр' } as any, '1.1.1.1');
  await flush(); await flush();
  assert.equal(saved[0].name, 'Анна');
  assert.equal(saved[0].handle, 'anna.nails');
  assert.equal(saved[0].source, 'site');
  assert.equal(mails.length, 1);
  assert.deepEqual(updates[0], { id: 'L1', patch: { emailSent: true } });
});

test('lead: failed email still keeps the lead (no emailSent)', async () => {
  const { svc, saved, updates } = make(false);
  await svc.create({ name: 'Оля', channel: 'telegram', handle: 'olya_beauty' } as any, '2.2.2.2');
  await flush(); await flush();
  assert.equal(saved.length, 1);
  assert.equal(updates.length, 0);
});

test('lead: bad handle → 400, honeypot → silently dropped', async () => {
  const { svc, saved } = make();
  await assert.rejects(svc.create({ name: 'X', channel: 'telegram', handle: 'ab' } as any, '3.3.3.3'), /Telegram/);
  await assert.rejects(svc.create({ name: 'X', channel: 'instagram', handle: 'bad nick!' } as any, '3.3.3.3'), /Instagram/);
  const r = await svc.create({ name: 'Bot', channel: 'instagram', handle: 'spam', website: 'http://x' } as any, '3.3.3.3');
  assert.equal(r, null);
  assert.equal(saved.length, 0);
});

test('lead: rate limit 5 per IP per 10 min', async () => {
  const { svc } = make();
  for (let i = 0; i < 5; i++) await svc.create({ name: 'A', channel: 'instagram', handle: 'anna' } as any, '9.9.9.9');
  await assert.rejects(svc.create({ name: 'A', channel: 'instagram', handle: 'anna' } as any, '9.9.9.9'), /Забагато/);
  await svc.create({ name: 'B', channel: 'instagram', handle: 'bob' } as any, '8.8.8.8'); // інша IP — ок
});

test('lead email: escaped HTML, contact link', () => {
  const m = buildLeadEmail({ id: 'L1', name: 'Аня <script>', channel: 'telegram', handle: 'anya_nails', craft: null, text: 'a & b', createdAt: new Date('2026-11-15T10:00:00Z') } as any);
  assert.match(m.subject, /Аня <script> \(@anya_nails, Telegram\)/);
  assert.ok(m.html.includes('Аня &lt;script&gt;'));
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('https://t.me/anya_nails'));
  assert.match(m.text, /a & b/);
  assert.match(m.text, /12:00/); // 10:00 UTC = 12:00 Київ (зима)
});

test('clientIp: first X-Forwarded-For hop', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '5.5.5.5, 10.0.0.1' } }), '5.5.5.5');
  assert.equal(clientIp({ headers: {}, ip: '7.7.7.7' }), '7.7.7.7');
});
