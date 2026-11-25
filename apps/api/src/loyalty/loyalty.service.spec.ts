import { LoyaltyProgram } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';
import { CreditInput, LoyaltyService, assertAmount, pluralize, redeemRestriction, summarize } from './loyalty.service';

function program(over: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id: 'p1',
    tenantId: 't1',
    name: 'Rodízio',
    kind: 'SELO',
    stampValueCents: null,
    maxAmountPerEntryCents: null,
    active: true,
    goal: 10,
    rewardDescription: '1 rodízio grátis',
    unitLabel: 'rodízio',
    unitLabelPlural: null,
    maxPerEntry: 20,
    redeemWeekdays: [],
    carryOverExcess: true,
    stampValidityDays: null,
    scope: 'TENANT',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as LoyaltyProgram;
}

/** Casa um AppError pelo código de negócio. */
const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });

describe('pluralize', () => {
  it.each([
    ['selo', 'selos'],
    ['rodízio', 'rodízios'],
    ['sobremesa', 'sobremesas'],
    ['café', 'cafés'],
    ['limão', 'limões'],
    ['hambúrguer', 'hambúrgueres'],
    ['açaí', 'açaís'],
    ['pastel', 'pasteis'],
    ['x', 'xs'],
  ])('%s → %s', (label, plural) => {
    expect(pluralize(label)).toBe(plural);
  });

  it('o plural informado pelo gestor tem prioridade', () => {
    expect(pluralize('pão', 'pães')).toBe('pães');
  });
});

describe('summarize', () => {
  it('sem cartão ainda (primeira visita), mostra 0/meta', () => {
    const s = summarize(null, program());
    expect(s).toMatchObject({ membershipId: '', balance: 0, goal: 10, rewardsAvailable: 0, unitLabelPlural: 'rodízios' });
  });

  it('usa os caches do cartão', () => {
    const s = summarize({ id: 'm1', cachedBalance: 7, cachedRewardsAvailable: 2 }, program());
    expect(s).toMatchObject({ membershipId: 'm1', balance: 7, rewardsAvailable: 2 });
  });
});

describe('redeemRestriction (RN-64)', () => {
  const monday = new Date('2026-11-16T12:00:00-03:00');
  const saturday = new Date('2026-11-21T12:00:00-03:00');

  it('sem restrição, sempre permite', () => {
    expect(redeemRestriction(program(), saturday)).toBeNull();
  });

  it('permite nos dias configurados', () => {
    expect(redeemRestriction(program({ redeemWeekdays: [1, 2, 3, 4] }), monday)).toBeNull();
  });

  it('bloqueia fora dos dias e explica o motivo', () => {
    expect(redeemRestriction(program({ redeemWeekdays: [1, 2, 3, 4] }), saturday)).toBe(
      'Resgate permitido apenas: segunda, terça, quarta, quinta.',
    );
  });
});

/**
 * Banco falso em memória, só com o que creditInTx usa. Permite testar a regra
 * de meta/excedente (RN-37, RN-38) sem PostgreSQL.
 */
function fakeTx(p: LoyaltyProgram, initial: { balance: number; rewards: number; firstVisitAt: Date | null; leftover?: number } = { balance: 0, rewards: 0, firstVisitAt: null }) {
  const entries: Array<Record<string, any>> = [];
  const rewards: Array<Record<string, any>> = [];
  const notifications: Array<Record<string, any>> = [];
  let m: Record<string, any> | null = null;
  let seq = 0;
  const membership = () => {
    m ??= {
      id: 'm1',
      tenantId: p.tenantId,
      programId: p.id,
      customerId: 'c1',
      cachedBalance: initial.balance,
      cachedRewardsAvailable: initial.rewards,
      cachedLeftoverCents: initial.leftover ?? 0,
      firstVisitAt: initial.firstVisitAt,
    };
    return m;
  };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    loyaltyProgram: {
      findFirst: jest.fn(async ({ where }: any) => (where.id === p.id ? p : null)),
      findMany: jest.fn(async () => (p.active ? [p] : [])),
    },
    membership: {
      findFirst: jest.fn(async () => null),
      createMany: jest.fn(async () => (membership(), { count: 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ ...membership(), program: p })),
      update: jest.fn(async ({ data }: any) => Object.assign(membership(), data)),
    },
    ledgerEntry: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: any) => {
        const e = { id: `e${++seq}`, rewardsDelta: 0, ...data };
        entries.push(e);
        return e;
      }),
    },
    reward: { create: jest.fn(async ({ data }: any) => (rewards.push(data), data)) },
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ name: 'Sushi X' })) },
    notification: { create: jest.fn(async ({ data }: any) => (notifications.push(data), data)) },
  };
  return { tx: tx as unknown as Tx, entries, rewards, notifications, state: () => membership() };
}

describe('LoyaltyService.creditInTx (RN-30 a RN-38)', () => {
  const svc = new LoyaltyService({} as never);
  const input = (quantity: number, over: Partial<CreditInput> = {}): CreditInput => ({
    tenantId: 't1',
    storeId: 's1',
    customerId: 'c1',
    quantity,
    source: 'QR_PESSOAL',
    staffUserId: 'u1',
    idempotencyKey: 'k1',
    ...over,
  });

  /** O saldo é sempre a soma do ledger (RN-72). */
  const ledgerSum = (entries: Array<Record<string, any>>) => ({
    stamps: entries.reduce((s, e) => s + e.quantity, 0),
    rewards: entries.reduce((s, e) => s + (e.rewardsDelta ?? 0), 0),
  });

  it('abaixo da meta, só acumula', async () => {
    const f = fakeTx(program());
    const r = await svc.creditInTx(f.tx, input(9));
    expect(r).toMatchObject({ rewardsUnlocked: 0, discarded: 0, firstVisit: true });
    expect(r.card.balance).toBe(9);
    expect(f.entries.map((e) => e.type)).toEqual(['CREDITO']);
  });

  it('o lançamento registra unidade, funcionário, origem e chave (RN-36)', async () => {
    const f = fakeTx(program());
    await svc.creditInTx(f.tx, input(2, { source: 'TELEFONE' }));
    expect(f.entries[0]).toMatchObject({
      tenantId: 't1',
      storeId: 's1',
      staffUserId: 'u1',
      source: 'TELEFONE',
      idempotencyKey: 'k1',
      quantity: 2,
    });
  });

  it('exatamente na meta libera 1 recompensa e zera o cartão', async () => {
    const f = fakeTx(program());
    const r = await svc.creditInTx(f.tx, input(10));
    expect(r.rewardsUnlocked).toBe(1);
    expect(r.card).toMatchObject({ balance: 0, rewardsAvailable: 1 });
    expect(f.rewards[0]).toMatchObject({ stampsCost: 10, description: '1 rodízio grátis' });
  });

  it('com excedente guardado: meta 10, saldo 9, +3 → 1 recompensa e saldo 2 (RN-37)', async () => {
    const f = fakeTx(program(), { balance: 9, rewards: 0, firstVisitAt: new Date() });
    const r = await svc.creditInTx(f.tx, input(3));
    expect(r).toMatchObject({ rewardsUnlocked: 1, discarded: 0, firstVisit: false });
    expect(r.card).toMatchObject({ balance: 2, rewardsAvailable: 1 });
    expect(f.entries.map((e) => e.type)).toEqual(['CREDITO', 'RECOMPENSA_LIBERADA']);
    expect(f.entries[1]).toMatchObject({ quantity: -10, rewardsDelta: 1, source: 'SISTEMA', parentEntryId: f.entries[0].id });
    expect(ledgerSum(f.entries)).toEqual({ stamps: 3 - 10, rewards: 1 }); // 9 + (3 - 10) = 2
  });

  it('lançamento grande libera várias recompensas de uma vez', async () => {
    const f = fakeTx(program());
    const r = await svc.creditInTx(f.tx, input(20, { quantity: 20 }));
    expect(r.rewardsUnlocked).toBe(2);
    expect(r.card).toMatchObject({ balance: 0, rewardsAvailable: 2 });
    // Cada recompensa tem chave de idempotência própria.
    expect(f.entries.slice(1).map((e) => e.idempotencyKey)).toEqual(['k1:reward:1', 'k1:reward:2']);
  });

  it('sem guardar excedente: o que passa da meta é descartado (RN-37)', async () => {
    const f = fakeTx(program({ carryOverExcess: false }), { balance: 9, rewards: 0, firstVisitAt: new Date() });
    const r = await svc.creditInTx(f.tx, input(3));
    expect(r).toMatchObject({ rewardsUnlocked: 1, discarded: 2 });
    expect(r.card.balance).toBe(0);
    expect(f.entries.map((e) => e.type)).toEqual(['CREDITO', 'RECOMPENSA_LIBERADA', 'EXCEDENTE_DESCARTADO']);
    expect(f.entries[2]).toMatchObject({ quantity: -2, idempotencyKey: 'k1:discard' });
    expect(9 + ledgerSum(f.entries).stamps).toBe(0);
  });

  it('sem guardar excedente, acima de 2× a meta: ganha todas as completas e só o resto é descartado', async () => {
    const f = fakeTx(program({ goal: 5, carryOverExcess: false }));
    const r = await svc.creditInTx(f.tx, input(12));
    expect(r).toMatchObject({ rewardsUnlocked: 2, discarded: 2 });
    expect(r.card).toMatchObject({ balance: 0, rewardsAvailable: 2 });
  });

  it('sem guardar excedente, mas sem atingir a meta: nada é descartado', async () => {
    const f = fakeTx(program({ carryOverExcess: false }));
    const r = await svc.creditInTx(f.tx, input(7));
    expect(r).toMatchObject({ rewardsUnlocked: 0, discarded: 0 });
    expect(r.card.balance).toBe(7);
  });

  it('recompensas já disponíveis continuam somando', async () => {
    const f = fakeTx(program(), { balance: 8, rewards: 2, firstVisitAt: new Date() });
    const r = await svc.creditInTx(f.tx, input(2));
    expect(r.card).toMatchObject({ balance: 0, rewardsAvailable: 3 });
  });

  it.each([0, -1, 1.5])('recusa quantidade inválida: %p (RN-32)', async (q) => {
    const f = fakeTx(program());
    await expect(svc.creditInTx(f.tx, input(q))).rejects.toMatchObject(code('INVALID_QUANTITY'));
    expect(f.entries).toHaveLength(0);
  });

  it('recusa acima do máximo por lançamento (RN-23)', async () => {
    const f = fakeTx(program({ maxPerEntry: 5 }));
    await expect(svc.creditInTx(f.tx, input(6))).rejects.toMatchObject(code('QUANTITY_ABOVE_LIMIT'));
    await expect(svc.creditInTx(f.tx, input(5))).resolves.toBeDefined();
  });

  it('programa desativado não aceita lançamentos (RN-24)', async () => {
    const f = fakeTx(program({ active: false }));
    await expect(svc.creditInTx(f.tx, input(1, { programId: 'p1' }))).rejects.toMatchObject(code('PROGRAM_INACTIVE'));
    await expect(svc.creditInTx(f.tx, input(1))).rejects.toMatchObject(code('NO_ACTIVE_PROGRAM'));
  });

  it('programa de outro estabelecimento não é encontrado (RN-82)', async () => {
    const f = fakeTx(program());
    await expect(svc.creditInTx(f.tx, input(1, { programId: 'p-de-outro' }))).rejects.toMatchObject(code('PROGRAM_NOT_FOUND'));
  });

  it('trava o cartão antes de calcular (SELECT ... FOR UPDATE)', async () => {
    const f = fakeTx(program());
    await svc.creditInTx(f.tx, input(1));
    expect((f.tx as any).$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('chave de idempotência já usada devolve o resultado anterior sem lançar de novo', async () => {
    const f = fakeTx(program(), { balance: 2, rewards: 1, firstVisitAt: new Date() });
    (f.tx as any).ledgerEntry.findUnique.mockResolvedValueOnce({ id: 'e-old', membershipId: 'm1' });
    (f.tx as any).ledgerEntry.findMany.mockResolvedValueOnce([
      { type: 'RECOMPENSA_LIBERADA', quantity: -10 },
      { type: 'EXCEDENTE_DESCARTADO', quantity: -3 },
    ]);
    const r = await svc.creditInTx(f.tx, input(13));
    expect(r).toMatchObject({ replay: true, rewardsUnlocked: 1, discarded: 3, firstVisit: false });
    expect(f.entries).toHaveLength(0);
  });
});

describe('LoyaltyService.creditInTx: notificação do cliente', () => {
  const svc = new LoyaltyService({} as never);
  const input = (quantity: number): CreditInput => ({
    tenantId: 't1',
    storeId: 's1',
    customerId: 'c1',
    quantity,
    source: 'QR_PESSOAL',
    staffUserId: 'u1',
    idempotencyKey: 'k1',
  });

  it('abaixo da meta, avisa os selos recebidos e quanto falta', async () => {
    const f = fakeTx(program(), { balance: 5, rewards: 0, firstVisitAt: new Date() });
    await svc.creditInTx(f.tx, input(2));
    expect(f.notifications).toHaveLength(1);
    expect(f.notifications[0]).toMatchObject({
      customerId: 'c1',
      tenantId: 't1',
      membershipId: 'm1',
      kind: 'CREDITO',
      title: '+2 rodízios no Sushi X',
      body: 'Seu cartão está com 7 de 10. Faltam 3 rodízios para: 1 rodízio grátis.',
    });
  });

  it('ao completar o cartão, manda só a notificação da recompensa', async () => {
    const f = fakeTx(program(), { balance: 9, rewards: 0, firstVisitAt: new Date() });
    await svc.creditInTx(f.tx, input(1));
    expect(f.notifications).toEqual([
      expect.objectContaining({ kind: 'RECOMPENSA_LIBERADA', title: 'Recompensa liberada no Sushi X!' }),
    ]);
  });

  it('várias recompensas de uma vez aparecem no título', async () => {
    const f = fakeTx(program(), { balance: 0, rewards: 0, firstVisitAt: null });
    await svc.creditInTx(f.tx, input(20));
    expect(f.notifications[0].title).toBe('2 recompensas liberadas no Sushi X!');
  });
});

describe('LoyaltyService.creditInTx: programa por valor', () => {
  const svc = new LoyaltyService({} as never);
  // R$ 10,00 = 1 selo, meta 10, compra máxima R$ 500.
  const valueProgram = (over: Partial<LoyaltyProgram> = {}) =>
    program({ kind: 'VALOR', stampValueCents: 1000, maxAmountPerEntryCents: 50_000, unitLabel: 'selo', ...over });
  const input = (amountCents: number | null, over: Partial<CreditInput> = {}): CreditInput => ({
    tenantId: 't1',
    storeId: 's1',
    customerId: 'c1',
    amountCents,
    source: 'QR_PESSOAL',
    staffUserId: 'u1',
    idempotencyKey: 'k1',
    ...over,
  });

  it('converte a compra em selos e guarda a sobra', async () => {
    const f = fakeTx(valueProgram());
    const r = await svc.creditInTx(f.tx, input(1500));
    expect(r).toMatchObject({ stamps: 1, amountCents: 1500, rewardsUnlocked: 0 });
    expect(r.card).toMatchObject({ kind: 'VALOR', stampValueCents: 1000, balance: 1, leftoverCents: 500 });
    expect(f.entries[0]).toMatchObject({ type: 'CREDITO', quantity: 1, amountCents: 1500, leftoverDeltaCents: 500 });
    expect(f.state().cachedLeftoverCents).toBe(500);
  });

  it('a sobra anterior entra na compra seguinte', async () => {
    const f = fakeTx(valueProgram(), { balance: 1, rewards: 0, firstVisitAt: new Date(), leftover: 500 });
    const r = await svc.creditInTx(f.tx, input(2000));
    expect(r.card).toMatchObject({ balance: 3, leftoverCents: 500 });
    // A sobra não mudou: a variação registrada no ledger é zero.
    expect(f.entries[0]).toMatchObject({ quantity: 2, leftoverDeltaCents: 0 });
  });

  it('compra que não fecha selo conta como visita e só aumenta a sobra', async () => {
    const f = fakeTx(valueProgram());
    const r = await svc.creditInTx(f.tx, input(700));
    expect(r).toMatchObject({ stamps: 0, firstVisit: true });
    expect(r.card).toMatchObject({ balance: 0, leftoverCents: 700 });
    expect(f.notifications[0]).toMatchObject({
      kind: 'CREDITO',
      title: 'Compra de R$ 7,00 registrada no Sushi X',
      body: 'Faltam R$ 3,00 para o próximo selo. Seu cartão está com 0 de 10.',
    });
  });

  it('completa o cartão com a compra e segue guardando a sobra', async () => {
    const f = fakeTx(valueProgram(), { balance: 9, rewards: 0, firstVisitAt: new Date(), leftover: 500 });
    const r = await svc.creditInTx(f.tx, input(1800));
    // R$ 5 + R$ 18 = R$ 23 → 2 selos (11 de 10) → 1 recompensa, 1 selo e R$ 3 guardados.
    expect(r.rewardsUnlocked).toBe(1);
    expect(r.card).toMatchObject({ balance: 1, rewardsAvailable: 1, leftoverCents: 300 });
  });

  it('sem guardar excedente, descarta selos mas nunca a sobra em reais', async () => {
    const f = fakeTx(valueProgram({ carryOverExcess: false }), { balance: 9, rewards: 0, firstVisitAt: new Date() });
    const r = await svc.creditInTx(f.tx, input(2500));
    expect(r).toMatchObject({ rewardsUnlocked: 1, discarded: 1 });
    expect(r.card).toMatchObject({ balance: 0, leftoverCents: 500 });
  });

  it('notificação de selos conta a compra e o que já está guardado', async () => {
    const f = fakeTx(valueProgram(), { balance: 5, rewards: 0, firstVisitAt: new Date() });
    await svc.creditInTx(f.tx, input(2550));
    expect(f.notifications[0]).toMatchObject({
      title: '+2 selos no Sushi X',
      body: 'Compra de R$ 25,50. Seu cartão está com 7 de 10. Faltam 3 selos para: 1 rodízio grátis. R$ 5,50 já contam para o próximo selo.',
    });
  });

  it.each([null, 0, -100, 10.5])('recusa valor inválido: %p', async (v) => {
    const f = fakeTx(valueProgram());
    await expect(svc.creditInTx(f.tx, input(v))).rejects.toMatchObject(code('INVALID_AMOUNT'));
    expect(f.entries).toHaveLength(0);
  });

  it('recusa acima do valor máximo por lançamento', async () => {
    const f = fakeTx(valueProgram());
    await expect(svc.creditInTx(f.tx, input(50_001))).rejects.toMatchObject(code('AMOUNT_ABOVE_LIMIT'));
    await expect(svc.creditInTx(f.tx, input(50_000))).resolves.toBeDefined();
  });

  it('a quantidade de selos enviada é ignorada: vale o valor', async () => {
    const f = fakeTx(valueProgram());
    const r = await svc.creditInTx(f.tx, input(3000, { quantity: 50 }));
    expect(r.stamps).toBe(3);
  });

  it('programa por selo exige a quantidade', async () => {
    const f = fakeTx(program());
    await expect(svc.creditInTx(f.tx, input(3000))).rejects.toMatchObject(code('INVALID_QUANTITY'));
  });
});

describe('assertAmount: teto de proteção', () => {
  const p = (max: number | null) => ({ maxAmountPerEntryCents: max }) as LoyaltyProgram;

  it('programa sem limite preenchido ainda para em R$ 10.000', () => {
    expect(() => assertAmount(p(null), 1_000_000)).not.toThrow();
    expect(() => assertAmount(p(null), 1_000_001)).toThrow(expect.objectContaining(code('AMOUNT_ABOVE_LIMIT')));
  });

  it('limite do programa acima do teto vale o teto', () => {
    expect(() => assertAmount(p(5_000_000), 1_000_001)).toThrow(expect.objectContaining(code('AMOUNT_ABOVE_LIMIT')));
  });

  it('limite do programa abaixo do teto vale o do programa', () => {
    expect(() => assertAmount(p(50_000), 50_001)).toThrow(expect.objectContaining(code('AMOUNT_ABOVE_LIMIT')));
  });
});
