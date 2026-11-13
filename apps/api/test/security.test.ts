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
  return { svc: new MasterService(repo as any, {} as any, {} as any, {} as any), getLastUpdate: () => lastUpdate };
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

// ════════════ IMPERSONATION: initData signed by ANOTHER master's bot ════════════
test('guard: initData signed by master A bot claiming master B id → NO master access', async () => {
  // Майстер A підписав своїм токеном initData з telegramId майстра B (777).
  const auth = {
    validateAutoDetect: async () => { throw new Error('bad sig'); },
    validateForClient: async () => ({ user: { id: 777 }, botMasterId: 'master-A' }),
    findMasterIdByTelegramId: async (tid: string) => (tid === '777' ? 'master-B' : null),
  };
  const guard = new TelegramAuthGuard(auth as any, reflector(false));
  const req: any = { headers: { 'x-telegram-init-data': 'forged', 'x-master-id': 'master-A' } };
  assert.equal(await guard.canActivate(ctx(req)), true);
  assert.equal(req.masterId, undefined); // раніше тут був 'master-B'
  assert.equal(req.authBotMasterId, 'master-A');
});

test('guard: master opening OWN bot keeps master access', async () => {
  const auth = {
    validateAutoDetect: async () => ({ user: { id: 777 }, botMasterId: 'master-B' }),
    findMasterIdByTelegramId: async () => 'master-B',
  };
  const guard = new TelegramAuthGuard(auth as any, reflector(false));
  const req: any = { headers: { 'x-telegram-init-data': 'sig' } };
  await guard.canActivate(ctx(req));
  assert.equal(req.masterId, 'master-B');
});

test('guard: platform-signed initData → trusted master access', async () => {
  const auth = {
    validateAutoDetect: async () => ({ user: { id: 777 }, botMasterId: null }),
    findMasterIdByTelegramId: async () => 'master-B',
  };
  const guard = new TelegramAuthGuard(auth as any, reflector(false));
  const req: any = { headers: { 'x-telegram-init-data': 'sig' } };
  await guard.canActivate(ctx(req));
  assert.equal(req.masterId, 'master-B');
  assert.equal(req.authBotMasterId, null);
});

test('create: client signed by bot of master A cannot book master B', async () => {
  const { ctrl } = makeApptController();
  await assert.rejects(
    async () => ctrl.create({ masterId: 'master-B', serviceId: 's', slotId: 'sl' } as any, { id: 1, first_name: 'X' } as any, 'master-A'),
    ForbiddenException,
  );
});

test('create: client signed by bot of master A can book master A', async () => {
  const { ctrl, calls } = makeApptController();
  await ctrl.create({ masterId: 'master-A', serviceId: 's', slotId: 'sl' } as any, { id: 1, first_name: 'X' } as any, 'master-A');
  assert.equal(calls.create.masterId, 'master-A');
});

test('client cancel passes bot scope to service', async () => {
  const svc: any = { cancelByClient: async (...a: any[]) => { svc.args = a; return {}; } };
  const ctrl = new AppointmentController(svc);
  await ctrl.updateStatus('apt1', { status: AppointmentStatus.CANCELLED_CLIENT }, { id: 42 } as any, undefined, 'master-A');
  assert.deepEqual(svc.args, ['apt1', '42', 'master-A']);
});

// ════════════ BOT WEBHOOK SECRET ════════════
import { BotService, webhookSecretFor } from '../src/modules/bot/bot.service';

test('webhook: secret required and must match bot token', () => {
  const svc: any = Object.create(BotService.prototype);
  svc.masterBots = new Map([['m1', { telegram: { token: 'TOKEN-1' } }]]);
  svc.configService = { get: () => 'PLATFORM-TOKEN' };
  assert.equal(svc.isValidWebhookSecret('m1', undefined), false);
  assert.equal(svc.isValidWebhookSecret('m1', 'wrong'), false);
  assert.equal(svc.isValidWebhookSecret('m1', webhookSecretFor('TOKEN-2')), false);
  assert.equal(svc.isValidWebhookSecret('m1', webhookSecretFor('TOKEN-1')), true);
  assert.equal(svc.isValidWebhookSecret('unknown', webhookSecretFor('TOKEN-1')), false);
  assert.equal(svc.isValidWebhookSecret('platform', webhookSecretFor('PLATFORM-TOKEN')), true);
  assert.match(webhookSecretFor('x'), /^[A-Za-z0-9_-]{1,256}$/);
});

// ════════════ initData signature: real HMAC, constant-time compare ════════════
import { TelegramAuthService } from '../src/modules/auth/telegram-auth.service';
import * as nodeCrypto from 'crypto';

function signInitData(botToken: string, fields: Record<string, string>) {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = nodeCrypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = nodeCrypto.createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

test('validate: correct signature passes, other token / garbage hash fails', () => {
  const svc = new TelegramAuthService({} as any, {} as any);
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 5, first_name: 'A' }) };
  assert.equal(svc.validate(signInitData('T1', fields), 'T1').user.id, 5);
  assert.throws(() => svc.validate(signInitData('T2', fields), 'T1'), UnauthorizedException);
  assert.throws(() => svc.validate(new URLSearchParams({ ...fields, hash: 'zz' }).toString(), 'T1'), UnauthorizedException);
});
