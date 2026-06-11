/**
 * Юніт-тести для авторизації/ownership (без БД і без Telegram).
 * Запуск:
 *   cd apps/api
 *   node -r ../../node_modules/ts-node/register/transpile-only --test test/security.test.ts
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';

import { TelegramAuthGuard } from '../src/modules/auth/telegram-auth.guard';
import { AppointmentController } from '../src/modules/appointment/appointment.controller';
import { AppointmentStatus } from '../src/database/entities/appointment.entity';
import { MasterService } from '../src/modules/master/master.service';

// ─── helpers ──────────────────────────────────────────────────────────────
function ctx(request: any) {
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}
const reflector = (isPublic: boolean) => ({ getAllAndOverride: () => isPublic } as any);

// ════════════════════════ GUARD ════════════════════════
test('guard: public endpoint passes without auth', async () => {
  const guard = new TelegramAuthGuard({} as any, reflector(true));
  assert.equal(await guard.canActivate(ctx({ headers: {} })), true);
});

test('guard: no initData + bypass disabled → Unauthorized', async () => {
  delete process.env.ALLOW_DEV_AUTH_BYPASS;
  process.env.NODE_ENV = 'development';
  const guard = new TelegramAuthGuard({} as any, reflector(false));
  await assert.rejects(() => guard.canActivate(ctx({ headers: {} })), UnauthorizedException);
});

test('guard: production never bypasses even with flag set', async () => {
  process.env.NODE_ENV = 'production';
  process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
  const guard = new TelegramAuthGuard({} as any, reflector(false));
  await assert.rejects(() => guard.canActivate(ctx({ headers: {} })), UnauthorizedException);
  process.env.NODE_ENV = 'development';
  delete process.env.ALLOW_DEV_AUTH_BYPASS;
});

test('guard: valid initData resolves and attaches request.masterId', async () => {
  const auth = {
    validateAutoDetect: async () => ({ user: { id: 777, first_name: 'M' } }),
    findMasterIdByTelegramId: async (tid: string) => (tid === '777' ? 'master-uuid' : null),
  };
  const guard = new TelegramAuthGuard(auth as any, reflector(false));
  const req: any = { headers: { 'x-telegram-init-data': 'sig' } };
  assert.equal(await guard.canActivate(ctx(req)), true);
  assert.equal(req.telegramUser.id, 777);
  assert.equal(req.masterId, 'master-uuid'); // server-resolved, not client-supplied
});

test('guard: authenticated client (not a master) gets undefined masterId', async () => {
  const auth = {
    validateAutoDetect: async () => ({ user: { id: 999 } }),
    findMasterIdByTelegramId: async () => null,
  };
  const guard = new TelegramAuthGuard(auth as any, reflector(false));
  const req: any = { headers: { 'x-telegram-init-data': 'sig' } };
  assert.equal(await guard.canActivate(ctx(req)), true);
  assert.equal(req.masterId, undefined);
});

// ════════════ APPOINTMENT updateStatus BRANCHING ════════════
function makeApptController() {
  const calls: any = {};
  const svc = {
    cancelByClient: async (id: string, tg: string) => { calls.cancelByClient = [id, tg]; return {}; },
    updateStatus: async (id: string, m: string, s: string) => { calls.updateStatus = [id, m, s]; return {}; },
    createAppointment: async (dto: any) => { calls.create = dto; return { id: 'apt1' }; },
  };
  return { ctrl: new AppointmentController(svc as any), calls };
}

test('client can cancel own appointment (tgId from auth, not body)', async () => {
  const { ctrl, calls } = makeApptController();
  await ctrl.updateStatus('apt1', { status: AppointmentStatus.CANCELLED_CLIENT }, { id: 42 } as any, undefined);
  assert.deepEqual(calls.cancelByClient, ['apt1', '42']);
});

test('master status with masterId → updateStatus with server masterId', async () => {
  const { ctrl, calls } = makeApptController();
  await ctrl.updateStatus('apt1', { status: AppointmentStatus.CONFIRMED }, { id: 42 } as any, 'm-server');
  assert.deepEqual(calls.updateStatus, ['apt1', 'm-server', AppointmentStatus.CONFIRMED]);
});

test('master status WITHOUT masterId (non-master caller) → Forbidden', async () => {
  const { ctrl } = makeApptController();
  await assert.rejects(
    async () => ctrl.updateStatus('apt1', { status: AppointmentStatus.COMPLETED }, { id: 42 } as any, undefined),
    ForbiddenException,
  );
});

test('disallowed status value → BadRequest', async () => {
  const { ctrl } = makeApptController();
  await assert.rejects(
    async () => ctrl.updateStatus('apt1', { status: AppointmentStatus.PENDING }, { id: 42 } as any, 'm1'),
    BadRequestException,
  );
});

test('create: clientTelegramId is overridden from authed user (anti-spoof)', async () => {
  const { ctrl, calls } = makeApptController();
  await ctrl.create(
    { masterId: 'm1', clientTelegramId: '000-spoofed', serviceId: 's', slotId: 'sl' } as any,
    { id: 123, first_name: 'Real' } as any,
  );
  assert.equal(calls.create.clientTelegramId, '123'); // not the spoofed value
});

// ════════════ MASTER updateOwnProfile WHITELIST + sanitize ════════════
function makeMasterService() {
  const stored: any = {
    id: 'm1', fullName: 'Old', theme: 'dusty_rose',
    botToken: 'SECRET:TOKEN', botWebhookUrl: 'http://x', status: 'active', telegramId: '5',
  };
  let lastUpdate: any = null;
  const repo = {
    update: async (_id: string, patch: any) => { lastUpdate = patch; Object.assign(stored, patch); },
    findOne: async () => ({ ...stored }),
  };
  return { svc: new MasterService(repo as any, {} as any, {} as any), getLastUpdate: () => lastUpdate };
}

test('updateOwnProfile: only whitelisted fields are written', async () => {
  const { svc, getLastUpdate } = makeMasterService();
  await svc.updateOwnProfile('m1', {
    fullName: 'New', theme: 'rose_noir',
    botToken: 'HACK:TOKEN', status: 'suspended', telegramId: '999', version: 50, id: 'other',
  });
  const patch = getLastUpdate();
  assert.deepEqual(Object.keys(patch).sort(), ['fullName', 'theme']);
  assert.equal(patch.botToken, undefined);
  assert.equal(patch.status, undefined);
});

test('updateOwnProfile: response is sanitized (no botToken)', async () => {
  const { svc } = makeMasterService();
  const res: any = await svc.updateOwnProfile('m1', { fullName: 'New' });
  assert.equal(res.botToken, undefined);
  assert.equal(res.botWebhookUrl, undefined);
  assert.equal(res.fullName, 'New');
});

test('findPublicById: never leaks botToken', async () => {
  const { svc } = makeMasterService();
  const res: any = await svc.findPublicById('m1');
  assert.equal(res.botToken, undefined);
  assert.equal(res.botWebhookUrl, undefined);
  assert.ok('fullName' in res);
});
