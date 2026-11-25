/**
 * Programa por valor: R$ X na compra = 1 selo; a sobra fica para a próxima compra.
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoyaltyService } from '../src/loyalty/loyalty.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createTenant, customerAgent, managerAgent, personalQr, redeem, resetDb, resolveQr } from './helpers';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

/** R$ 10,00 = 1 selo, meta 10, compra máxima R$ 500. */
const valueProgram = {
  name: 'Cartão Compras',
  kind: 'VALOR',
  stampValueCents: 1000,
  maxAmountPerEntryCents: 50_000,
  unitLabel: 'selo',
  goal: 10,
  rewardDescription: 'R$ 20 de desconto',
  maxPerEntry: 20,
  redeemWeekdays: [],
  carryOverExcess: true,
};

/** Estabelecimento com o programa padrão transformado em programa por valor, e um cliente no caixa. */
async function setup(program: Record<string, unknown> = {}) {
  const t = await createTenant(app);
  const pos = await managerAgent(app, t.managerInviteUrl);
  await pos.put(`/api/admin/programs/${t.programId}`).send({ ...valueProgram, ...program }).expect(200);
  const c = await customerAgent(app);
  const ref = async () => (await resolveQr(pos, await personalQr(c.agent))).customerRef;
  const buy = (customerRef: string, amountCents: number, key = randomUUID()) =>
    pos.post('/api/pos/credits').set('Idempotency-Key', key).send({ customerRef, amountCents });
  const membership = () => prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId, customerId: c.id } });
  const reconcile = async () => (await app.get(LoyaltyService).reconcile({ tenantId: t.tenantId })).mismatches;
  return { t, pos, c, ref, buy, membership, reconcile };
}

describe('Programa por valor: crédito', () => {
  it('converte o valor em selos e guarda a sobra entre as compras', async () => {
    const { ref, buy, membership, reconcile } = await setup();
    const customerRef = await ref();

    const a = await buy(customerRef, 1500).expect(201);
    expect(a.body).toMatchObject({ stamps: 1, amountCents: 1500 });
    expect(a.body.card).toMatchObject({ kind: 'VALOR', stampValueCents: 1000, balance: 1, leftoverCents: 500 });

    const b = await buy(customerRef, 2000).expect(201);
    expect(b.body.card).toMatchObject({ balance: 3, leftoverCents: 500 });

    expect(await membership()).toMatchObject({ cachedBalance: 3, cachedLeftoverCents: 500 });
    expect(await reconcile()).toEqual([]);
  });

  it('compra que não fecha selo é registrada (visita) e só soma na sobra', async () => {
    const { ref, buy, membership } = await setup();
    const r = await buy(await ref(), 700).expect(201);
    expect(r.body).toMatchObject({ stamps: 0 });
    expect(r.body.card).toMatchObject({ balance: 0, leftoverCents: 700 });
    expect((await membership()).firstVisitAt).not.toBeNull();
  });

  it('completa o cartão e libera a recompensa', async () => {
    const { ref, buy, reconcile } = await setup();
    const r = await buy(await ref(), 10_550).expect(201);
    expect(r.body).toMatchObject({ stamps: 10, rewardsUnlocked: 1 });
    expect(r.body.card).toMatchObject({ balance: 0, rewardsAvailable: 1, leftoverCents: 550 });
    expect(await reconcile()).toEqual([]);
  });

  it('o caixa vê o tipo do programa, o valor do selo e a sobra do cliente', async () => {
    const { pos, c, ref, buy } = await setup();
    await buy(await ref(), 1250).expect(201);
    const view = await resolveQr(pos, await personalQr(c.agent));
    expect(view.programs[0]).toMatchObject({ kind: 'VALOR', stampValueCents: 1000, leftoverCents: 250, maxAmountPerEntryCents: 50_000 });
  });

  it('valida o valor: obrigatório e até o máximo por lançamento', async () => {
    const { ref, buy, pos } = await setup();
    const customerRef = await ref();
    const noAmount = await pos.post('/api/pos/credits').set('Idempotency-Key', randomUUID()).send({ customerRef, quantity: 2 }).expect(400);
    expect(noAmount.body.code).toBe('INVALID_AMOUNT');
    const above = await buy(customerRef, 50_001).expect(400);
    expect(above.body.code).toBe('AMOUNT_ABOVE_LIMIT');
  });

  it('a mesma chave de idempotência não lança a compra duas vezes', async () => {
    const { ref, buy, membership } = await setup();
    const customerRef = await ref();
    const key = randomUUID();
    await buy(customerRef, 1500, key).expect(201);
    const again = await buy(customerRef, 1500, key).expect(201);
    expect(again.body).toMatchObject({ replay: true, stamps: 1 });
    expect(await membership()).toMatchObject({ cachedBalance: 1, cachedLeftoverCents: 500 });
  });
});

describe('Programa por valor: estorno', () => {
  it('estornar uma compra antiga tira o valor exato, mesmo depois de outra que usou a sobra', async () => {
    const { pos, ref, buy, membership, reconcile } = await setup();
    const customerRef = await ref();
    const first = await buy(customerRef, 1500).expect(201); // 1 selo, sobra R$ 5
    await buy(customerRef, 500).expect(201); // +1 selo, sobra R$ 0
    expect(await membership()).toMatchObject({ cachedBalance: 2, cachedLeftoverCents: 0 });

    await pos.post(`/api/admin/ledger/${first.body.entryId}/reverse`).send({ reason: 'Valor digitado errado' }).expect(200);
    // Sobram só os R$ 5 da segunda compra.
    expect(await membership()).toMatchObject({ cachedBalance: 0, cachedLeftoverCents: 500 });
    const rev = await prisma.ledgerEntry.findFirstOrThrow({ where: { reversesEntryId: first.body.entryId } });
    expect(rev).toMatchObject({ type: 'ESTORNO_CREDITO', amountCents: -1500, quantity: -2, leftoverDeltaCents: 500 });
    expect(await reconcile()).toEqual([]);
  });

  it('estornar a compra que completou o cartão cancela a recompensa', async () => {
    const { pos, ref, buy, membership, reconcile } = await setup();
    const r = await buy(await ref(), 10_000).expect(201);
    expect(r.body.rewardsUnlocked).toBe(1);
    const rev = await pos.post(`/api/admin/ledger/${r.body.entryId}/reverse`).send({ reason: 'Teste' }).expect(200);
    expect(rev.body.cancelledRewards).toBe(1);
    expect(await membership()).toMatchObject({ cachedBalance: 0, cachedRewardsAvailable: 0, cachedLeftoverCents: 0 });
    expect(await reconcile()).toEqual([]);
  });

  it('não estorna se a recompensa liberada já foi resgatada', async () => {
    const { pos, ref, buy } = await setup();
    const customerRef = await ref();
    const r = await buy(customerRef, 10_000).expect(201);
    await redeem(pos, customerRef).expect(201);
    const rev = await pos.post(`/api/admin/ledger/${r.body.entryId}/reverse`).send({ reason: 'Teste' }).expect(409);
    expect(rev.body.code).toBe('REWARD_ALREADY_REDEEMED');
  });
});

describe('Programa por valor: QR temporário', () => {
  it('o QR leva o valor e os selos saem com a sobra de quem usar', async () => {
    const { pos, c, ref, buy, membership } = await setup();
    await buy(await ref(), 800).expect(201); // sobra R$ 8

    const created = await pos.post('/api/pos/checkout-tokens').send({ amountCents: 1500 }).expect(201);
    expect(created.body).toMatchObject({ quantity: 0, amountCents: 1500 });
    const token = (created.body.url as string).split('/').pop();

    const info = await c.agent.get(`/api/c/${token}`).expect(200);
    expect(info.body).toMatchObject({ amountCents: 1500, program: { kind: 'VALOR', stampValueCents: 1000 } });

    const claim = await c.agent.post(`/api/c/${token}/claim`).expect(200);
    // R$ 8 + R$ 15 = R$ 23 → 2 selos, sobra R$ 3.
    expect(claim.body).toMatchObject({ amountCents: 1500, stamps: 2 });
    expect(await membership()).toMatchObject({ cachedBalance: 2, cachedLeftoverCents: 300 });
  });

  it('exige o valor para gerar o QR', async () => {
    const { pos } = await setup();
    const r = await pos.post('/api/pos/checkout-tokens').send({ quantity: 3 }).expect(400);
    expect(r.body.code).toBe('INVALID_AMOUNT');
  });
});

describe('Programa por valor: cadastro', () => {
  it('exige o valor do selo', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    await pos.put(`/api/admin/programs/${t.programId}`).send({ ...valueProgram, stampValueCents: null }).expect(400);
  });

  it('exige a compra máxima por lançamento, até o teto de R$ 10.000', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const put = (maxAmountPerEntryCents: number | null) =>
      pos.put(`/api/admin/programs/${t.programId}`).send({ ...valueProgram, maxAmountPerEntryCents });
    await put(null).expect(400);
    await put(1_000_001).expect(400);
    await put(500).expect(400); // menor que o valor do selo (R$ 10)
    await put(1_000_000).expect(200);
  });

  it('com clientes, o tipo e o valor do selo ficam travados; o resto pode mudar', async () => {
    const { t, pos, ref, buy } = await setup();
    await buy(await ref(), 1500).expect(201);

    const changeValue = await pos.put(`/api/admin/programs/${t.programId}`).send({ ...valueProgram, stampValueCents: 2000 }).expect(409);
    expect(changeValue.body.code).toBe('PROGRAM_VALUE_LOCKED');
    await pos.put(`/api/admin/programs/${t.programId}`).send({ ...valueProgram, kind: 'SELO' }).expect(409);
    await pos.put(`/api/admin/programs/${t.programId}`).send({ ...valueProgram, goal: 12, rewardDescription: 'Outro prêmio' }).expect(200);

    const p = await pos.get(`/api/admin/programs/${t.programId}`).expect(200);
    expect(p.body).toMatchObject({ kind: 'VALOR', stampValueCents: 1000, goal: 12, valueLocked: true });
  });

  it('programa por selo continua igual: a quantidade é obrigatória', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const customerRef = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    const r = await pos.post('/api/pos/credits').set('Idempotency-Key', randomUUID()).send({ customerRef, amountCents: 1500 }).expect(400);
    expect(r.body.code).toBe('INVALID_QUANTITY');
  });
});
