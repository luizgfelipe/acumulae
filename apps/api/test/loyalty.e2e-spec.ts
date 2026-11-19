/**
 * Consumo, resgate e estorno (seções 5.3, 5.4, 5.7 e 5.8) além dos critérios de aceite.
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { LoyaltyService } from '../src/loyalty/loyalty.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PLATFORM_KEY,
  attendantAgent,
  createApp,
  createTenant,
  credit,
  customerAgent,
  ensurePlan,
  managerAgent,
  personalQr,
  redeem,
  resetDb,
  resolveQr,
} from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  await resetDb(app);
  await ensurePlan(app, 'DUO', 2);
});

afterAll(async () => {
  await app.close();
});

const dessertProgram = {
  name: 'Sobremesas',
  unitLabel: 'sobremesa',
  goal: 2,
  rewardDescription: '1 sobremesa grátis',
  maxPerEntry: 10,
  redeemWeekdays: [],
  carryOverExcess: true,
};

/** Estabelecimento com o caixa aberto e um cliente identificado pelo QR pessoal. */
async function setup(program: Record<string, unknown> = {}, tenant: Record<string, unknown> = {}) {
  const t = await createTenant(app, { program: { rewardDescription: '1 rodízio grátis', ...program }, ...tenant });
  const pos = await managerAgent(app, t.managerInviteUrl);
  const c = await customerAgent(app);
  const ref = async () => (await resolveQr(pos, await personalQr(c.agent))).customerRef;
  return { t, pos, c, ref };
}

async function withDesserts() {
  const s = await setup({}, { plan: 'DUO' });
  const list = await s.pos.post('/api/admin/programs').send({ ...dessertProgram, active: true }).expect(201);
  const desserts = list.body.items.find((p: { name: string }) => p.name === 'Sobremesas') as { id: string };
  return { ...s, desserts };
}

const membershipOf = (tenantId: string, customerId: string, programId?: string) =>
  prisma.membership.findFirstOrThrow({ where: { tenantId, customerId, ...(programId ? { programId } : {}) } });

describe('Crédito de selos (RN-30 a RN-38)', () => {
  it('o primeiro consumo cria o cartão (RN-34) e o caixa vê a primeira visita', async () => {
    const { t, pos, c } = await setup();
    const view = await resolveQr(pos, await personalQr(c.agent));
    expect(view.programs[0]).toMatchObject({ balance: 0, goal: 10, membershipId: '' });
    expect((view as unknown as { firstVisit: boolean }).firstVisit).toBe(true);
    expect(await prisma.membership.count({ where: { tenantId: t.tenantId } })).toBe(0);

    await credit(pos, view.customerRef, 1).expect(201);
    const m = await membershipOf(t.tenantId, c.id);
    expect(m.firstVisitAt).not.toBeNull();
    const again = await pos.post('/api/pos/customers/resolve-qr').send({ qr: await personalQr(c.agent) }).expect(200);
    expect(again.body.firstVisit).toBe(false);
  });

  it('um lançamento grande libera todas as recompensas completas e guarda o resto', async () => {
    const { t, pos, c, ref } = await setup({ goal: 10, maxPerEntry: 30 });
    const r = await credit(pos, await ref(), 25).expect(201);
    expect(r.body.rewardsUnlocked).toBe(2);
    expect(r.body.card).toMatchObject({ balance: 5, rewardsAvailable: 2 });
    expect(await prisma.reward.count({ where: { tenantId: t.tenantId, status: 'DISPONIVEL' } })).toBe(2);
    const rec = await app.get(LoyaltyService).reconcile({ tenantId: t.tenantId });
    expect(rec.mismatches).toEqual([]);
    expect((await membershipOf(t.tenantId, c.id)).cachedBalance).toBe(5);
  });

  it('lançamentos simultâneos num cartão existente somam todos, sem perder nenhum', async () => {
    const { t, pos, c, ref } = await setup({ goal: 10 });
    const customerRef = await ref();
    await credit(pos, customerRef, 1).expect(201);
    const results = await Promise.all(Array.from({ length: 5 }, () => credit(pos, customerRef, 3)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(await membershipOf(t.tenantId, c.id)).toMatchObject({ cachedBalance: 6, cachedRewardsAvailable: 1 });
  });

  it('lançamentos simultâneos na primeira visita (cartão ainda não existe) somam todos', async () => {
    const { t, pos, c, ref } = await setup({ goal: 10 });
    const customerRef = await ref();
    const results = await Promise.all(Array.from({ length: 5 }, () => credit(pos, customerRef, 3)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const m = await membershipOf(t.tenantId, c.id);
    expect(m).toMatchObject({ cachedBalance: 5, cachedRewardsAvailable: 1 });
    expect((await app.get(LoyaltyService).reconcile({ tenantId: t.tenantId })).mismatches).toEqual([]);
  });

  it('a mesma chave de idempotência devolve o mesmo lançamento (replay)', async () => {
    const { t, pos, ref } = await setup();
    const customerRef = await ref();
    const key = randomUUID();
    const a = await credit(pos, customerRef, 2, key).expect(201);
    const b = await credit(pos, customerRef, 2, key).expect(201);
    expect(b.body).toMatchObject({ replay: true, entryId: a.body.entryId });
    expect(await prisma.ledgerEntry.count({ where: { tenantId: t.tenantId, type: 'CREDITO' } })).toBe(1);
  });

  it('exige o header Idempotency-Key válido', async () => {
    const { pos, ref } = await setup();
    const customerRef = await ref();
    await pos.post('/api/pos/credits').send({ customerRef, quantity: 1 }).expect(400);
    await pos.post('/api/pos/credits').set('Idempotency-Key', 'curta').send({ customerRef, quantity: 1 }).expect(400);
    await pos.post('/api/pos/credits').set('Idempotency-Key', 'tem espaço!!').send({ customerRef, quantity: 1 }).expect(400);
  });

  it('quantidade precisa ser inteira e maior que zero (RN-32)', async () => {
    const { pos, ref } = await setup();
    const customerRef = await ref();
    await credit(pos, customerRef, 0).expect(400);
    await credit(pos, customerRef, -2).expect(400);
    await credit(pos, customerRef, 1.5).expect(400);
  });

  it('referência de cliente adulterada é recusada', async () => {
    const { pos, ref } = await setup();
    const r = await credit(pos, `${await ref()}x`, 1).expect(400);
    expect(r.body.code).toBe('INVALID_CUSTOMER_REF');
  });

  it('o lançamento registra unidade, funcionário e origem (RN-36, RN-73)', async () => {
    const { t, pos, c } = await setup();
    const att = await attendantAgent(app, pos, [t.storeId]);
    const viaQr = await resolveQr(att.agent, await personalQr(c.agent));
    await credit(att.agent, viaQr.customerRef, 2).expect(201);
    const viaPhone = await att.agent.get('/api/pos/customers').query({ phone: c.phone }).expect(200);
    await credit(att.agent, viaPhone.body.customerRef, 1).expect(201);

    const ledger = await pos.get('/api/admin/ledger').query({ type: 'CREDITO' }).expect(200);
    expect(ledger.body.items).toHaveLength(2);
    for (const item of ledger.body.items) {
      expect(item).toMatchObject({ staffName: 'Ana Atendente', storeName: 'Centro', customerName: 'Maria Silva' });
    }
    expect(ledger.body.items.map((i: { source: string }) => i.source).sort()).toEqual(['QR_PESSOAL', 'TELEFONE']);

    const recent = await att.agent.get('/api/pos/recent').expect(200);
    expect(recent.body[0]).toMatchObject({ customerName: 'Maria S.', staffName: 'Ana Atendente', type: 'CREDITO' });
  });

  it('cliente excluído não é encontrado no caixa', async () => {
    const { pos, c } = await setup();
    const qr = await personalQr(c.agent);
    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'EXCLUIR' }).expect(200);
    const r1 = await pos.post('/api/pos/customers/resolve-qr').send({ qr }).expect(404);
    expect(r1.body.code).toBe('CUSTOMER_NOT_FOUND');
    await pos.get('/api/pos/customers').query({ phone: c.phone }).expect(404);
  });

  it('busca por telefone inválido ou sem conta orienta o atendente', async () => {
    const { pos } = await setup();
    const bad = await pos.get('/api/pos/customers').query({ phone: '123' }).expect(400);
    expect(bad.body.code).toBe('INVALID_PHONE');
    const none = await pos.get('/api/pos/customers').query({ phone: '(47) 90000-0001' }).expect(404);
    expect(none.body.message).toMatch(/QR temporário/);
  });
});

describe('Programas (RN-24)', () => {
  it('programa desativado não aceita lançamentos, mas as recompensas já liberadas continuam resgatáveis', async () => {
    const { pos, c, desserts } = await withDesserts();
    let view = await resolveQr(pos, await personalQr(c.agent));
    await pos
      .post('/api/pos/credits')
      .set('Idempotency-Key', randomUUID())
      .send({ customerRef: view.customerRef, programId: desserts.id, quantity: 2 })
      .expect(201);

    await pos.post(`/api/admin/programs/${desserts.id}/deactivate`).expect(200);
    const blocked = await pos
      .post('/api/pos/credits')
      .set('Idempotency-Key', randomUUID())
      .send({ customerRef: view.customerRef, programId: desserts.id, quantity: 1 })
      .expect(409);
    expect(blocked.body.code).toBe('PROGRAM_INACTIVE');

    // O caixa ainda mostra o programa desativado porque há recompensa a usar.
    view = await resolveQr(pos, await personalQr(c.agent));
    const card = view.programs.find((p) => p.programId === desserts.id)!;
    expect(card).toMatchObject({ rewardsAvailable: 1, programActive: false });
    let mine = await c.agent.get('/api/me/memberships').expect(200);
    expect(mine.body.map((m: { programId: string }) => m.programId)).toContain(desserts.id);

    await redeem(pos, view.customerRef, { programId: desserts.id }).expect(201);

    // Sem saldo nem recompensa, o cartão do programa desativado some para o cliente e para o caixa.
    mine = await c.agent.get('/api/me/memberships').expect(200);
    expect(mine.body.map((m: { programId: string }) => m.programId)).not.toContain(desserts.id);
    view = await resolveQr(pos, await personalQr(c.agent));
    expect(view.programs.map((p) => p.programId)).not.toContain(desserts.id);
  });

  it('alterar a meta não afeta recompensas já liberadas', async () => {
    const { t, pos, c, ref } = await setup({ goal: 5, rewardDescription: 'Brinde antigo' });
    const first = await credit(pos, await ref(), 5).expect(201);
    expect(first.body.rewardsUnlocked).toBe(1);

    await pos
      .put(`/api/admin/programs/${t.programId}`)
      .send({ ...dessertProgram, name: 'Rodízio', goal: 10, rewardDescription: 'Brinde novo', maxPerEntry: 20 })
      .expect(200);

    const reward = await prisma.reward.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(reward).toMatchObject({ stampsCost: 5, description: 'Brinde antigo', status: 'DISPONIVEL' });

    // O estorno devolve o custo gravado na recompensa (5), não a meta nova (10).
    await pos.post(`/api/admin/ledger/${first.body.entryId}/reverse`).send({ reason: 'Erro de digitação' }).expect(200);
    expect(await membershipOf(t.tenantId, c.id)).toMatchObject({ cachedBalance: 0, cachedRewardsAvailable: 0 });

    // Lançamentos novos já seguem a meta nova.
    const next = await credit(pos, await ref(), 5).expect(201);
    expect(next.body).toMatchObject({ rewardsUnlocked: 0, card: { balance: 5, goal: 10 } });
    expect((await app.get(LoyaltyService).reconcile({ tenantId: t.tenantId })).mismatches).toEqual([]);
  });

  it('com vários programas ativos, o caixa escolhe o programa no lançamento e no resgate', async () => {
    const { pos, c, t, desserts } = await withDesserts();
    const view = await resolveQr(pos, await personalQr(c.agent));
    const send = (programId: string, quantity: number) =>
      pos.post('/api/pos/credits').set('Idempotency-Key', randomUUID()).send({ customerRef: view.customerRef, programId, quantity });
    await send(t.programId, 10).expect(201);
    await send(desserts.id, 2).expect(201);

    const ambiguous = await redeem(pos, view.customerRef).expect(400);
    expect(ambiguous.body.code).toBe('PROGRAM_REQUIRED');
    const r = await redeem(pos, view.customerRef, { programId: desserts.id }).expect(201);
    expect(r.body.rewards[0].description).toBe('1 sobremesa grátis');

    // Com só um programa tendo recompensa, não precisa escolher.
    const auto = await redeem(pos, view.customerRef).expect(201);
    expect(auto.body.rewards[0].description).toBe('1 rodízio grátis');
  });

  it('programa de outro estabelecimento não é aceito no lançamento', async () => {
    const a = await setup();
    const b = await createTenant(app);
    const r = await a.pos
      .post('/api/pos/credits')
      .set('Idempotency-Key', randomUUID())
      .send({ customerRef: await a.ref(), programId: b.programId, quantity: 1 })
      .expect(404);
    expect(r.body.code).toBe('PROGRAM_NOT_FOUND');
  });
});

describe('Resgate (RN-60 a RN-64)', () => {
  it('sem recompensa disponível, o resgate é recusado', async () => {
    const { pos, ref } = await setup();
    const customerRef = await ref();
    await credit(pos, customerRef, 3).expect(201);
    const r = await redeem(pos, customerRef).expect(409);
    expect(r.body.code).toBe('NO_REWARD');
  });

  it('resgata a recompensa escolhida e não deixa usar a mesma duas vezes', async () => {
    const { pos, c } = await setup({ goal: 2 });
    let view = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, view.customerRef, 4).expect(201);
    view = await resolveQr(pos, await personalQr(c.agent));
    const [first, second] = view.rewards;
    expect(view.rewards).toHaveLength(2);

    const r = await redeem(pos, view.customerRef, { rewardId: second.id }).expect(201);
    expect(r.body.rewards.map((w: { id: string }) => w.id)).toEqual([second.id]);
    const again = await redeem(pos, view.customerRef, { rewardId: second.id }).expect(409);
    expect(again.body.code).toBe('NO_REWARD');

    const rest = await redeem(pos, view.customerRef).expect(201);
    expect(rest.body.rewards[0].id).toBe(first.id);
    expect(rest.body.card.rewardsAvailable).toBe(0);
  });

  it('a identificação do cliente vale 5 minutos para o resgate (lançamento continua valendo)', async () => {
    const { pos, ref } = await setup({ goal: 2 });
    const customerRef = await ref();
    await credit(pos, customerRef, 2).expect(201);
    const realNow = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 6 * 60_000);
    try {
      const r = await redeem(pos, customerRef).expect(409);
      expect(r.body.code).toBe('CUSTOMER_READ_EXPIRED');
      await credit(pos, customerRef, 1).expect(201);
    } finally {
      spy.mockRestore();
    }
    await redeem(pos, await ref()).expect(201);
  });

  it('o resgate registra unidade, funcionário e origem; a recompensa vira "resgatada"', async () => {
    const { t, pos, c, ref } = await setup({ goal: 2 });
    await credit(pos, await ref(), 2).expect(201);
    const r = await redeem(pos, await ref()).expect(201);
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: r.body.entryIds[0] } });
    expect(entry).toMatchObject({ type: 'RESGATE', source: 'QR_PESSOAL', storeId: t.storeId, quantity: 0, rewardsDelta: -1 });
    expect(entry.staffUserId).not.toBeNull();
    const reward = await prisma.reward.findUniqueOrThrow({ where: { id: entry.rewardId! } });
    expect(reward).toMatchObject({ status: 'RESGATADA', redeemedStoreId: t.storeId, redeemedEntryId: entry.id });

    const card = await c.agent.get(`/api/me/memberships/${(await membershipOf(t.tenantId, c.id)).id}`).expect(200);
    expect(card.body.rewards[0]).toMatchObject({ status: 'RESGATADA', redeemedStore: 'Centro' });
  });

  it('o caixa vê a restrição de dia antes de confirmar (RN-62, RN-64)', async () => {
    const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
    const iso = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(today) + 1;
    const { pos, c } = await setup({ goal: 2, redeemWeekdays: [(iso % 7) + 1] });
    const view = await resolveQr(pos, await personalQr(c.agent));
    const card = view.programs[0] as unknown as { redeem: { allowed: boolean; reason: string } };
    expect(card.redeem.allowed).toBe(false);
    expect(card.redeem.reason).toMatch(/^Resgate permitido apenas: /);
  });

  it('o atendente também resgata', async () => {
    const { t, pos, c } = await setup({ goal: 2 });
    const att = await attendantAgent(app, pos, [t.storeId]);
    const view = await resolveQr(att.agent, await personalQr(c.agent));
    await credit(att.agent, view.customerRef, 2).expect(201);
    await redeem(att.agent, view.customerRef).expect(201);
  });
});

describe('Estorno (RN-70 a RN-72)', () => {
  it('cria a movimentação contrária com motivo, autor e referência à original', async () => {
    const { t, pos, c, ref } = await setup();
    const cr = await credit(pos, await ref(), 4).expect(201);
    const r = await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Lançado em dobro' }).expect(200);

    const rev = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: r.body.reversalId } });
    expect(rev).toMatchObject({ type: 'ESTORNO_CREDITO', quantity: -4, reversesEntryId: cr.body.entryId, reason: 'Lançado em dobro', source: 'PAINEL' });
    expect(rev.staffUserId).not.toBeNull();

    const ledger = await pos.get('/api/admin/ledger').expect(200);
    const original = ledger.body.items.find((i: { id: string }) => i.id === cr.body.entryId);
    expect(original).toMatchObject({ reversible: false, reversedBy: { id: rev.id, reason: 'Lançado em dobro' } });

    // O cliente vê o estorno no histórico.
    const card = await c.agent.get(`/api/me/memberships/${(await membershipOf(t.tenantId, c.id)).id}`).expect(200);
    expect(card.body.history.map((h: { type: string }) => h.type)).toEqual(['ESTORNO_CREDITO', 'CREDITO']);
  });

  it('exige motivo', async () => {
    const { pos, ref } = await setup();
    const cr = await credit(pos, await ref(), 1).expect(201);
    await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({}).expect(400);
    await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'x' }).expect(400);
  });

  it('somente o gestor estorna', async () => {
    const { t, pos, ref } = await setup();
    const att = await attendantAgent(app, pos, [t.storeId]);
    const cr = await credit(pos, await ref(), 1).expect(201);
    await att.agent.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Tentativa' }).expect(403);
  });

  it('só consumo e resgate podem ser estornados', async () => {
    const { t, pos, ref } = await setup({ goal: 2 });
    const cr = await credit(pos, await ref(), 2).expect(201);
    const unlocked = await prisma.ledgerEntry.findFirstOrThrow({ where: { tenantId: t.tenantId, type: 'RECOMPENSA_LIBERADA' } });
    const r = await pos.post(`/api/admin/ledger/${unlocked.id}/reverse`).send({ reason: 'Tentativa' }).expect(400);
    expect(r.body.code).toBe('NOT_REVERSIBLE');

    const rev = await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Erro' }).expect(200);
    await pos.post(`/api/admin/ledger/${rev.body.reversalId}/reverse`).send({ reason: 'Estorno do estorno' }).expect(400);
  });

  it('estornar um resgate devolve a recompensa ao cliente', async () => {
    const { t, pos, c, ref } = await setup({ goal: 2 });
    await credit(pos, await ref(), 2).expect(201);
    const red = await redeem(pos, await ref()).expect(201);
    await pos.post(`/api/admin/ledger/${red.body.entryIds[0]}/reverse`).send({ reason: 'Cliente não levou' }).expect(200);
    expect(await membershipOf(t.tenantId, c.id)).toMatchObject({ cachedRewardsAvailable: 1 });
    const reward = await prisma.reward.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(reward).toMatchObject({ status: 'DISPONIVEL', redeemedAt: null });
    await redeem(pos, await ref()).expect(201);
  });

  it('a reconciliação detecta e corrige um saldo em cache divergente (RN-72)', async () => {
    const { t, c, pos, ref } = await setup();
    await credit(pos, await ref(), 3).expect(201);
    const m = await membershipOf(t.tenantId, c.id);
    await prisma.membership.update({ where: { id: m.id }, data: { cachedBalance: 99 } });

    const check = await http().post('/api/platform/reconcile').query({ tenantId: t.tenantId }).set('X-Platform-Key', PLATFORM_KEY).expect(200);
    expect(check.body.mismatches).toEqual([expect.objectContaining({ membershipId: m.id, cachedBalance: 99, ledgerBalance: 3 })]);

    const fix = await http()
      .post('/api/platform/reconcile')
      .query({ tenantId: t.tenantId, fix: 'true' })
      .set('X-Platform-Key', PLATFORM_KEY)
      .expect(200);
    expect(fix.body.fixed).toBe(true);
    expect((await membershipOf(t.tenantId, c.id)).cachedBalance).toBe(3);
    expect((await app.get(LoyaltyService).reconcile({ tenantId: t.tenantId })).mismatches).toEqual([]);
  });
});
