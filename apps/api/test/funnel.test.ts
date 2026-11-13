/**
 * Воронка: нормалізація джерела, білий список подій з mini-app, track не кидає.
 * Запуск: node -r ts-node/register/transpile-only --test test/funnel.test.ts
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BadRequestException } from '@nestjs/common';
import { FunnelService, normalizeStartSource } from '../src/modules/funnel/funnel.service';
import { FunnelController } from '../src/modules/funnel/funnel.controller';
import { FunnelEventName } from '../src/database/entities/funnel-event.entity';

test('normalizeStartSource: whitelist, direct, unknown', () => {
  assert.equal(normalizeStartSource('tt_chaos'), 'tt_chaos');
  assert.equal(normalizeStartSource('ig-story14'), 'ig-story14');
  assert.equal(normalizeStartSource(''), 'direct');
  assert.equal(normalizeStartSource(undefined), 'direct');
  assert.equal(normalizeStartSource('  '), 'direct');
  assert.equal(normalizeStartSource('tt chaos'), 'unknown');
  assert.equal(normalizeStartSource("x';drop table--"), 'unknown');
  assert.equal(normalizeStartSource('a'.repeat(64)), 'a'.repeat(64));
  assert.equal(normalizeStartSource('a'.repeat(65)), 'unknown');
});

function svcWith(insert: (row: any) => Promise<any>) {
  const rows: any[] = [];
  const svc = new FunnelService({ insert: async (r: any) => { rows.push(r); return insert(r); } } as any);
  return { svc, rows };
}

test('track: source only on bot_start, telegramId from arg', async () => {
  const { svc, rows } = svcWith(async () => ({}));
  await svc.track(42, FunnelEventName.BOT_START, 'tt_chaos');
  await svc.track('42', FunnelEventName.REGISTERED, 'ignored');
  assert.deepEqual(rows, [
    { telegramId: '42', event: 'bot_start', source: 'tt_chaos' },
    { telegramId: '42', event: 'registered', source: null },
  ]);
});

test('track: never throws, skips empty id', async () => {
  const { svc, rows } = svcWith(async () => { throw new Error('db down'); });
  await svc.track(1, FunnelEventName.ONBOARDING_OPEN); // не кидає
  await svc.track(undefined, FunnelEventName.ONBOARDING_OPEN);
  await svc.track(0, FunnelEventName.ONBOARDING_OPEN);
  assert.equal(rows.length, 1);
});

test('controller: only onboarding events accepted, id from initData', async () => {
  const calls: any[] = [];
  const ctrl = new FunnelController({ track: async (...a: any[]) => { calls.push(a); } } as any);
  await ctrl.track({ event: 'onboarding_token_step' }, { id: 7 } as any);
  assert.deepEqual(calls, [[7, 'onboarding_token_step']]);
  await assert.rejects(() => ctrl.track({ event: 'registered' }, { id: 7 } as any), BadRequestException);
  await assert.rejects(() => ctrl.track({ event: 'bot_start' }, { id: 7 } as any), BadRequestException);
  await assert.rejects(() => ctrl.track({} as any, { id: 7 } as any), BadRequestException);
});
