import { Injectable } from '@nestjs/common';
import { LedgerSource, LoyaltyProgram, Membership, Prisma, ProgramKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppError, badRequest, conflict, notFound } from '../common/errors';
import { describeWeekdays, isoWeekdayLocal } from '../common/time';
import {
  creditMessage,
  creditReversedMessage,
  notify,
  redeemReversedMessage,
  redeemedMessage,
  rewardUnlockedMessage,
  tenantName,
} from '../notifications/messages';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { MAX_AMOUNT_PER_ENTRY_CENTS, convertAmount, formatMoney, reverseAmount } from './value';

const unitsOf = (p: LoyaltyProgram) => ({ one: p.unitLabel, many: pluralize(p.unitLabel, p.unitLabelPlural) });

export interface CreditInput {
  tenantId: string;
  storeId: string;
  customerId: string;
  /** Programa a creditar. Opcional quando o estabelecimento tem um único programa ativo. */
  programId?: string | null;
  /** Programa por selo: quantos selos. Ignorado no programa por valor. */
  quantity?: number | null;
  /** Programa por valor: valor da compra em centavos. Ignorado no programa por selo. */
  amountCents?: number | null;
  source: LedgerSource;
  staffUserId: string | null;
  checkoutTokenId?: string | null;
  idempotencyKey: string;
}

export interface RedeemInput {
  tenantId: string;
  storeId: string;
  customerId: string;
  staffUserId: string;
  /** Programa da recompensa. Opcional quando só um programa do cliente tem recompensa disponível. */
  programId?: string | null;
  rewardId?: string | null;
  /** Quantas recompensas usar de uma vez (padrão 1). */
  quantity?: number;
  /** Como o cliente foi identificado no caixa. */
  source: 'QR_PESSOAL' | 'TELEFONE';
  idempotencyKey: string;
}

export interface CardSummary {
  membershipId: string;
  programId: string;
  programName: string;
  programActive: boolean;
  /** SELO: o caixa lança selos. VALOR: o caixa informa o valor da compra. */
  kind: ProgramKind;
  /** VALOR: quanto vale 1 selo, em centavos. */
  stampValueCents: number | null;
  carryOverExcess: boolean;
  balance: number;
  /** VALOR: centavos guardados para o próximo selo. */
  leftoverCents: number;
  goal: number;
  rewardsAvailable: number;
  unitLabel: string;
  unitLabelPlural: string;
  rewardDescription: string;
}

export function pluralize(label: string, plural?: string | null) {
  if (plural) return plural;
  // "ão" vem antes da regra de vogal; senão "limão" viraria "limãos".
  if (/ão$/i.test(label)) return label.replace(/ão$/i, 'ões');
  if (/[aeiouáéíóú]$/i.test(label)) return `${label}s`;
  if (/[rsz]$/i.test(label)) return `${label}es`;
  if (/l$/i.test(label)) return label.replace(/l$/i, 'is');
  return `${label}s`;
}

export function summarize(
  m: (Pick<Membership, 'id' | 'cachedBalance' | 'cachedRewardsAvailable'> & { cachedLeftoverCents?: number }) | null,
  p: LoyaltyProgram,
): CardSummary {
  return {
    membershipId: m?.id ?? '',
    programId: p.id,
    programName: p.name,
    programActive: p.active,
    kind: p.kind,
    stampValueCents: p.kind === 'VALOR' ? p.stampValueCents : null,
    carryOverExcess: p.carryOverExcess,
    balance: m?.cachedBalance ?? 0,
    leftoverCents: m?.cachedLeftoverCents ?? 0,
    goal: p.goal,
    rewardsAvailable: m?.cachedRewardsAvailable ?? 0,
    unitLabel: p.unitLabel,
    unitLabelPlural: pluralize(p.unitLabel, p.unitLabelPlural),
    rewardDescription: p.rewardDescription,
  };
}

/** Programa por selo: inteiro de 1 até o máximo por lançamento (RN-32, RN-23). */
function assertQuantity(p: LoyaltyProgram, quantity: number | null | undefined): asserts quantity is number {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    throw badRequest('INVALID_QUANTITY', 'A quantidade deve ser um inteiro maior ou igual a 1.');
  }
  if (quantity > p.maxPerEntry) {
    throw badRequest('QUANTITY_ABOVE_LIMIT', `O máximo por lançamento é ${p.maxPerEntry}.`);
  }
}

/** Programa por valor: valor da compra em centavos, de R$ 0,01 até o máximo por lançamento (e o teto de R$ 10.000). */
export function assertAmount(p: LoyaltyProgram, amountCents: number | null | undefined): asserts amountCents is number {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents < 1) {
    throw badRequest('INVALID_AMOUNT', 'Informe o valor da compra.');
  }
  // O limite do programa nunca passa do teto de proteção (inclusive programa sem limite preenchido).
  const limit = Math.min(p.maxAmountPerEntryCents ?? MAX_AMOUNT_PER_ENTRY_CENTS, MAX_AMOUNT_PER_ENTRY_CENTS);
  if (amountCents > limit) {
    throw badRequest('AMOUNT_ABOVE_LIMIT', `O valor máximo por lançamento é ${formatMoney(limit)}.`);
  }
}

/** Situação do resgate hoje (RN-64). */
export function redeemRestriction(p: LoyaltyProgram, now = new Date()): string | null {
  if (!p.redeemWeekdays.length) return null;
  if (p.redeemWeekdays.includes(isoWeekdayLocal(now))) return null;
  return `Resgate permitido apenas: ${describeWeekdays(p.redeemWeekdays)}.`;
}

/**
 * Núcleo do programa de fidelidade. Toda alteração de saldo passa por aqui e gera
 * movimentações imutáveis no ledger (RN-71, RN-72); os caches da membership são
 * atualizados na mesma transação, com a linha da membership travada (FOR UPDATE).
 *
 * Convenção do ledger: `quantity` = variação de selos; `rewardsDelta` = variação de recompensas disponíveis.
 * Cada membership é o cartão do cliente em UM programa do estabelecimento.
 */
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────── Programas ─────────────────────────

  activePrograms(tx: Tx, tenantId: string) {
    return tx.loyaltyProgram.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: 'asc' } });
  }

  /** Programa do estabelecimento (ativo ou não). */
  async programOf(tx: Tx, tenantId: string, programId: string) {
    const p = await tx.loyaltyProgram.findFirst({ where: { id: programId, tenantId } });
    if (!p) throw notFound('Programa não encontrado.', 'PROGRAM_NOT_FOUND');
    return p;
  }

  /** Programa que vai receber o crédito: o informado (precisa estar ativo) ou o único ativo. */
  async programForCredit(tx: Tx, tenantId: string, programId?: string | null): Promise<LoyaltyProgram> {
    if (programId) {
      const p = await this.programOf(tx, tenantId, programId);
      if (!p.active) throw new AppError(409, 'PROGRAM_INACTIVE', `O programa "${p.name}" está desativado.`);
      return p;
    }
    const active = await this.activePrograms(tx, tenantId);
    if (!active.length) throw new AppError(409, 'NO_ACTIVE_PROGRAM', 'O estabelecimento não tem programa de fidelidade ativo.');
    if (active.length > 1) throw badRequest('PROGRAM_REQUIRED', 'Escolha o programa.');
    return active[0];
  }

  /**
   * RN-34 / Q-04: cria o cartão do cliente no programa, se não existir. `signupStoreId` = unidade de entrada
   * (QR do balcão ou unidade do lançamento); vale para o cartão novo e preenche o de um cartão que ainda não tem.
   */
  async ensureMembership(tx: Tx, tenantId: string, customerId: string, programId: string, signupStoreId: string | null = null) {
    // O consentimento de marketing é por estabelecimento: herda o de outro cartão do mesmo lugar.
    const sibling = await tx.membership.findFirst({
      where: { tenantId, customerId, marketingConsent: { not: null } },
      select: { marketingConsent: true, marketingConsentAt: true },
    });
    // Sem unidade informada, o cartão de um programa novo herda a de outro cartão do mesmo lugar.
    const store =
      signupStoreId ??
      (await tx.membership.findFirst({ where: { tenantId, customerId, signupStoreId: { not: null } }, select: { signupStoreId: true } }))?.signupStoreId ??
      null;
    // INSERT ... ON CONFLICT DO NOTHING: dois lançamentos simultâneos na primeira visita
    // não podem falhar na chave única (programa, cliente); o segundo espera e reaproveita o cartão.
    await tx.membership.createMany({
      data: [
        {
          tenantId,
          customerId,
          programId,
          marketingConsent: sibling?.marketingConsent ?? null,
          marketingConsentAt: sibling?.marketingConsentAt ?? null,
          signupStoreId: store,
        },
      ],
      skipDuplicates: true,
    });
    const m = await tx.membership.findUniqueOrThrow({ where: { programId_customerId: { programId, customerId } } });
    // Cartão antigo sem unidade (entrou sem o ?u=): fica com a primeira unidade informada.
    if (store && !m.signupStoreId) return tx.membership.update({ where: { id: m.id }, data: { signupStoreId: store } });
    return m;
  }

  private async lock(tx: Tx, membershipId: string): Promise<Membership> {
    await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${membershipId}::uuid FOR UPDATE`;
    return tx.membership.findUniqueOrThrow({ where: { id: membershipId } });
  }

  /** Executa numa transação, tratando corrida na chave de idempotência como replay. */
  private async withIdempotency<T>(tenantId: string, key: string, fn: (tx: Tx) => Promise<T>, onReplay: () => Promise<T>) {
    try {
      return await this.prisma.$transaction(fn, { timeout: 15_000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.ledgerEntry.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } },
        });
        if (existing) return onReplay();
      }
      throw e;
    }
  }

  // ───────────────────────── Crédito (RN-30 a RN-38) ─────────────────────────

  async credit(input: CreditInput) {
    return this.withIdempotency(
      input.tenantId,
      input.idempotencyKey,
      (tx) => this.creditInTx(tx, input),
      () => this.prisma.$transaction((tx) => this.creditInTx(tx, input)),
    );
  }

  async creditInTx(tx: Tx, input: CreditInput) {
    const existing = await tx.ledgerEntry.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      const m = await tx.membership.findUniqueOrThrow({ where: { id: existing.membershipId }, include: { program: true } });
      const children = await tx.ledgerEntry.findMany({ where: { parentEntryId: existing.id } });
      return {
        replay: true,
        entry: existing,
        stamps: existing.quantity,
        amountCents: existing.amountCents,
        rewardsUnlocked: children.filter((c) => c.type === 'RECOMPENSA_LIBERADA').length,
        discarded: -children.filter((c) => c.type === 'EXCEDENTE_DESCARTADO').reduce((s, c) => s + c.quantity, 0),
        card: summarize(m, m.program),
        firstVisit: false,
      };
    }

    const program = await this.programForCredit(tx, input.tenantId, input.programId);
    const byValue = program.kind === 'VALOR';
    if (byValue) assertAmount(program, input.amountCents);
    else assertQuantity(program, input.quantity);

    const ensured = await this.ensureMembership(tx, input.tenantId, input.customerId, program.id, input.storeId);
    const m = await this.lock(tx, ensured.id);
    const now = new Date();

    // Por valor: a compra soma à sobra do cliente; o que fecha selo vira selo, o resto continua guardado.
    let stamps = input.quantity ?? 0;
    let leftover = m.cachedLeftoverCents;
    if (byValue) {
      const c = convertAmount(input.amountCents!, m.cachedLeftoverCents, program.stampValueCents!);
      stamps = c.stamps;
      leftover = c.leftover;
    }
    const base = {
      tenantId: input.tenantId,
      storeId: input.storeId,
      membershipId: m.id,
      staffUserId: input.staffUserId,
    };

    const entry = await tx.ledgerEntry.create({
      data: {
        ...base,
        type: 'CREDITO',
        quantity: stamps,
        amountCents: byValue ? input.amountCents : null,
        leftoverDeltaCents: leftover - m.cachedLeftoverCents,
        source: input.source,
        checkoutTokenId: input.checkoutTokenId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });

    let balance = m.cachedBalance + stamps;
    let available = m.cachedRewardsAvailable;
    let unlocked = 0;
    while (balance >= program.goal) {
      unlocked++;
      const rewardId = randomUUID();
      const rl = await tx.ledgerEntry.create({
        data: {
          ...base,
          type: 'RECOMPENSA_LIBERADA',
          quantity: -program.goal,
          rewardsDelta: 1,
          source: 'SISTEMA',
          parentEntryId: entry.id,
          rewardId,
          idempotencyKey: `${input.idempotencyKey}:reward:${unlocked}`,
        },
      });
      await tx.reward.create({
        data: {
          id: rewardId,
          tenantId: input.tenantId,
          membershipId: m.id,
          programId: program.id,
          description: program.rewardDescription,
          stampsCost: program.goal,
          unlockedEntryId: rl.id,
          sourceEntryId: entry.id,
        },
      });
      balance -= program.goal;
      available++;
    }

    // RN-37 configurável: sem "guardar excedente", o que passou da meta é descartado.
    let discarded = 0;
    if (unlocked > 0 && balance > 0 && !program.carryOverExcess) {
      discarded = balance;
      await tx.ledgerEntry.create({
        data: {
          ...base,
          type: 'EXCEDENTE_DESCARTADO',
          quantity: -discarded,
          source: 'SISTEMA',
          parentEntryId: entry.id,
          idempotencyKey: `${input.idempotencyKey}:discard`,
        },
      });
      balance = 0;
    }

    const updated = await tx.membership.update({
      where: { id: m.id },
      data: {
        cachedBalance: balance,
        cachedRewardsAvailable: available,
        cachedLeftoverCents: leftover,
        lastVisitAt: now,
        firstVisitAt: m.firstVisitAt ?? now,
      },
    });

    // Completou o cartão: a notificação da recompensa já diz tudo; senão, avisa os selos recebidos.
    const tenant = await tenantName(tx, input.tenantId);
    await notify(
      tx,
      m,
      unlocked > 0
        ? rewardUnlockedMessage({ tenant, count: unlocked, reward: program.rewardDescription })
        : creditMessage({
            tenant,
            quantity: stamps,
            balance,
            goal: program.goal,
            units: unitsOf(program),
            reward: program.rewardDescription,
            rewardsAvailable: available,
            value: byValue ? { amountCents: input.amountCents!, leftoverCents: leftover, stampValueCents: program.stampValueCents! } : undefined,
          }),
    );
    return {
      replay: false,
      entry,
      stamps,
      amountCents: byValue ? input.amountCents! : null,
      rewardsUnlocked: unlocked,
      discarded,
      card: summarize(updated, program),
      firstVisit: !m.firstVisitAt,
    };
  }

  // ───────────────────────── Resgate (RN-60 a RN-64) ─────────────────────────

  async redeem(input: RedeemInput) {
    const run = (tx: Tx) => this.redeemInTx(tx, input);
    return this.withIdempotency(input.tenantId, input.idempotencyKey, run, () => this.prisma.$transaction(run));
  }

  /** Chaves de idempotência das N movimentações de um resgate múltiplo. */
  private redeemKeys(key: string, n: number) {
    return Array.from({ length: n }, (_, i) => (i === 0 ? key : `${key}:${i + 1}`));
  }

  /** Cartão de onde sai o resgate: o do programa informado, ou o único com recompensa disponível. */
  private async membershipForRedeem(tx: Tx, input: RedeemInput) {
    if (input.programId) {
      const p = await this.programOf(tx, input.tenantId, input.programId);
      const m = await tx.membership.findUnique({ where: { programId_customerId: { programId: p.id, customerId: input.customerId } } });
      if (!m) throw new AppError(409, 'NO_REWARD', 'O cliente não tem recompensa disponível.');
      return m;
    }
    const withRewards = await tx.membership.findMany({
      where: { tenantId: input.tenantId, customerId: input.customerId, cachedRewardsAvailable: { gt: 0 } },
    });
    if (!withRewards.length) throw new AppError(409, 'NO_REWARD', 'O cliente não tem recompensa disponível.');
    if (withRewards.length > 1) throw badRequest('PROGRAM_REQUIRED', 'Escolha o programa.');
    return withRewards[0];
  }

  private async redeemInTx(tx: Tx, input: RedeemInput) {
    const quantity = input.quantity ?? 1;
    const keys = this.redeemKeys(input.idempotencyKey, quantity);

    const existing = await tx.ledgerEntry.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      const entries = await tx.ledgerEntry.findMany({ where: { tenantId: input.tenantId, idempotencyKey: { in: keys } } });
      const m = await tx.membership.findUniqueOrThrow({ where: { id: existing.membershipId }, include: { program: true } });
      const rewards = await tx.reward.findMany({ where: { id: { in: entries.map((e) => e.rewardId!).filter(Boolean) } } });
      return { replay: true, entries, rewards, card: summarize(m, m.program) };
    }

    const membership = await this.membershipForRedeem(tx, input);
    const m = await this.lock(tx, membership.id);
    // Recompensas já liberadas podem ser usadas mesmo com o programa desativado.
    const program = await tx.loyaltyProgram.findUniqueOrThrow({ where: { id: m.programId } });

    const restriction = redeemRestriction(program);
    if (restriction) throw new AppError(409, 'REDEEM_NOT_ALLOWED_TODAY', restriction);

    const available = await tx.reward.findMany({
      where: { membershipId: m.id, tenantId: input.tenantId, status: 'DISPONIVEL' },
      orderBy: { createdAt: 'asc' },
    });
    if (!available.length) throw new AppError(409, 'NO_REWARD', 'O cliente não tem recompensa disponível.');
    if (quantity > available.length) {
      throw new AppError(409, 'NOT_ENOUGH_REWARDS', `O cliente tem só ${available.length} recompensa(s) disponível(is).`);
    }
    // Se uma recompensa específica foi pedida, ela vai primeiro.
    const chosen = input.rewardId
      ? [...available.filter((r) => r.id === input.rewardId), ...available.filter((r) => r.id !== input.rewardId)]
      : available;
    if (input.rewardId && chosen[0]?.id !== input.rewardId) {
      throw new AppError(409, 'NO_REWARD', 'A recompensa já foi resgatada.');
    }

    const now = new Date();
    const entries = [];
    for (let i = 0; i < quantity; i++) {
      const reward = chosen[i];
      const entry = await tx.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          membershipId: m.id,
          type: 'RESGATE',
          quantity: 0,
          rewardsDelta: -1,
          source: input.source,
          staffUserId: input.staffUserId,
          rewardId: reward.id,
          idempotencyKey: keys[i],
        },
      });
      const upd = await tx.reward.updateMany({
        where: { id: reward.id, status: 'DISPONIVEL' },
        data: { status: 'RESGATADA', redeemedEntryId: entry.id, redeemedAt: now, redeemedStoreId: input.storeId },
      });
      if (!upd.count) throw new AppError(409, 'NO_REWARD', 'A recompensa já foi resgatada.');
      entries.push(entry);
    }

    const updated = await tx.membership.update({
      where: { id: m.id },
      data: { cachedRewardsAvailable: m.cachedRewardsAvailable - quantity, lastVisitAt: now },
    });
    const rewards = await tx.reward.findMany({ where: { id: { in: chosen.slice(0, quantity).map((r) => r.id) } } });
    await notify(tx, m, redeemedMessage({ tenant: await tenantName(tx, input.tenantId), count: quantity, reward: chosen[0].description }));
    return { replay: false, entries, rewards, card: summarize(updated, program) };
  }

  // ───────────────────────── Estorno (RN-70, RN-71) ─────────────────────────

  /**
   * Estorna um CREDITO ou um RESGATE criando a movimentação contrária.
   * Se o crédito liberou recompensas: as ainda disponíveis são canceladas (RECOMPENSA_CANCELADA);
   * se alguma já foi resgatada, o estorno é bloqueado até o resgate ser estornado.
   * Excedente descartado por esse crédito é devolvido (ESTORNO_EXCEDENTE).
   */
  async reverse(params: { tenantId: string; entryId: string; staffUserId: string; reason: string }) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.ledgerEntry.findFirst({
        where: { id: params.entryId, tenantId: params.tenantId },
        include: { reversedBy: true },
      });
      if (!entry) throw notFound('Movimentação não encontrada.');
      if (entry.type !== 'CREDITO' && entry.type !== 'RESGATE') {
        throw badRequest('NOT_REVERSIBLE', 'Só é possível estornar lançamentos de consumo e resgates.');
      }
      if (entry.reversedBy) throw conflict('ALREADY_REVERSED', 'Esta movimentação já foi estornada.');

      const m = await this.lock(tx, entry.membershipId);
      const key = `reverse:${entry.id}`;
      const base = {
        tenantId: params.tenantId,
        storeId: entry.storeId,
        membershipId: m.id,
        source: 'PAINEL' as const,
        staffUserId: params.staffUserId,
        reason: params.reason,
      };

      if (entry.type === 'RESGATE') {
        const reward = entry.rewardId ? await tx.reward.findUnique({ where: { id: entry.rewardId } }) : null;
        if (!reward || reward.status !== 'RESGATADA') throw conflict('NOT_REVERSIBLE', 'A recompensa não está resgatada.');
        const rev = await tx.ledgerEntry.create({
          data: { ...base, type: 'ESTORNO_RESGATE', quantity: 0, rewardsDelta: 1, reversesEntryId: entry.id, rewardId: reward.id, idempotencyKey: key },
        });
        await tx.reward.update({
          where: { id: reward.id },
          data: { status: 'DISPONIVEL', redeemedEntryId: null, redeemedAt: null, redeemedStoreId: null },
        });
        await tx.membership.update({ where: { id: m.id }, data: { cachedRewardsAvailable: m.cachedRewardsAvailable + 1 } });
        await notify(tx, m, redeemReversedMessage({ tenant: await tenantName(tx, params.tenantId), reward: reward.description }));
        return { reversal: rev, cancelledRewards: 0 };
      }

      // CREDITO
      const program = await tx.loyaltyProgram.findUniqueOrThrow({ where: { id: m.programId } });
      const discards = await tx.ledgerEntry.findMany({
        where: { parentEntryId: entry.id, type: 'EXCEDENTE_DESCARTADO', reversedBy: { is: null } },
      });
      // O excedente descartado por este consumo volta antes de tirar o consumo.
      const before = m.cachedBalance + discards.reduce((s, d) => s - d.quantity, 0);

      // Se o saldo não cobre o estorno, cancela recompensas disponíveis: primeiro as que este consumo
      // liberou, depois as mais recentes.
      const available0 = await tx.reward.findMany({ where: { membershipId: m.id, status: 'DISPONIVEL' }, orderBy: { createdAt: 'desc' } });
      const order = [...available0.filter((r) => r.sourceEntryId === entry.id), ...available0.filter((r) => r.sourceEntryId !== entry.id)];
      const alreadyRedeemed = () =>
        conflict(
          'REWARD_ALREADY_REDEEMED',
          'Este consumo liberou uma recompensa que já foi resgatada. Estorne o resgate antes de estornar o consumo.',
        );

      let balance: number;
      let leftover = m.cachedLeftoverCents;
      let toCancel: typeof order;
      if (entry.amountCents != null && program.stampValueCents) {
        // Por valor: tira o valor da compra do "pote" (selos × valor + sobra) e converte de novo.
        const r = reverseAmount({
          balance: before,
          leftoverCents: m.cachedLeftoverCents,
          amountCents: entry.amountCents,
          stampValueCents: program.stampValueCents,
          rewardCosts: order.map((w) => w.stampsCost),
        });
        if (!r) throw alreadyRedeemed();
        toCancel = order.slice(0, r.cancel);
        balance = r.balance;
        leftover = r.leftover;
      } else {
        balance = before - entry.quantity;
        toCancel = [];
        while (balance < 0) {
          const next = order[toCancel.length];
          if (!next) throw alreadyRedeemed();
          toCancel.push(next);
          balance += next.stampsCost;
        }
      }
      const cancelledCost = toCancel.reduce((s, w) => s + w.stampsCost, 0);

      // Soma do ledger: saldo + excedente devolvido + estorno + recompensas canceladas = saldo novo.
      const rev = await tx.ledgerEntry.create({
        data: {
          ...base,
          type: 'ESTORNO_CREDITO',
          quantity: balance - before - cancelledCost,
          amountCents: entry.amountCents != null ? -entry.amountCents : null,
          leftoverDeltaCents: leftover - m.cachedLeftoverCents,
          reversesEntryId: entry.id,
          idempotencyKey: key,
        },
      });
      for (const d of discards) {
        await tx.ledgerEntry.create({
          data: { ...base, type: 'ESTORNO_EXCEDENTE', quantity: -d.quantity, reversesEntryId: d.id, idempotencyKey: `${key}:discard:${d.id}` },
        });
      }
      for (const [i, reward] of toCancel.entries()) {
        await tx.ledgerEntry.create({
          data: {
            ...base,
            type: 'RECOMPENSA_CANCELADA',
            quantity: reward.stampsCost,
            rewardsDelta: -1,
            parentEntryId: rev.id,
            rewardId: reward.id,
            idempotencyKey: `${key}:cancel:${i + 1}`,
          },
        });
        await tx.reward.update({ where: { id: reward.id }, data: { status: 'ESTORNADA' } });
      }
      const available = m.cachedRewardsAvailable - toCancel.length;
      await tx.membership.update({
        where: { id: m.id },
        data: { cachedBalance: balance, cachedRewardsAvailable: available, cachedLeftoverCents: leftover },
      });
      await notify(
        tx,
        m,
        creditReversedMessage({
          tenant: await tenantName(tx, params.tenantId),
          quantity: entry.quantity,
          amountCents: entry.amountCents,
          cancelledRewards: toCancel.length,
          balance,
          goal: program.goal,
          units: unitsOf(program),
          rewardsAvailable: available,
        }),
      );
      return { reversal: rev, cancelledRewards: toCancel.length };
    });
  }

  // ───────────────────────── Reconciliação (RN-72) ─────────────────────────

  /** Recalcula saldos a partir do ledger e compara com os caches. Com `fix`, corrige os divergentes. */
  async reconcile(opts: { tenantId?: string; fix?: boolean } = {}) {
    const where = opts.tenantId ? { tenantId: opts.tenantId } : {};
    const [memberships, sums, rewardCounts] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        select: { id: true, tenantId: true, cachedBalance: true, cachedRewardsAvailable: true, cachedLeftoverCents: true },
      }),
      this.prisma.ledgerEntry.groupBy({ by: ['membershipId'], where, _sum: { quantity: true, rewardsDelta: true, leftoverDeltaCents: true } }),
      this.prisma.reward.groupBy({ by: ['membershipId'], where: { ...where, status: 'DISPONIVEL' }, _count: { _all: true } }),
    ]);
    const sumMap = new Map(sums.map((s) => [s.membershipId, s._sum]));
    const rewardMap = new Map(rewardCounts.map((r) => [r.membershipId, r._count._all]));
    const mismatches: Array<{
      membershipId: string;
      cachedBalance: number;
      ledgerBalance: number;
      cachedRewards: number;
      ledgerRewards: number;
      rewardsTable: number;
      cachedLeftoverCents: number;
      ledgerLeftoverCents: number;
    }> = [];
    for (const m of memberships) {
      const s = sumMap.get(m.id);
      const ledgerBalance = s?.quantity ?? 0;
      const ledgerRewards = s?.rewardsDelta ?? 0;
      const ledgerLeftoverCents = s?.leftoverDeltaCents ?? 0;
      const rewardsTable = rewardMap.get(m.id) ?? 0;
      if (
        ledgerBalance !== m.cachedBalance ||
        ledgerRewards !== m.cachedRewardsAvailable ||
        rewardsTable !== ledgerRewards ||
        ledgerLeftoverCents !== m.cachedLeftoverCents
      ) {
        mismatches.push({
          membershipId: m.id,
          cachedBalance: m.cachedBalance,
          ledgerBalance,
          cachedRewards: m.cachedRewardsAvailable,
          ledgerRewards,
          rewardsTable,
          cachedLeftoverCents: m.cachedLeftoverCents,
          ledgerLeftoverCents,
        });
        if (opts.fix) {
          await this.prisma.membership.update({
            where: { id: m.id },
            data: { cachedBalance: ledgerBalance, cachedRewardsAvailable: ledgerRewards, cachedLeftoverCents: ledgerLeftoverCents },
          });
        }
      }
    }
    return { checked: memberships.length, mismatches, fixed: !!opts.fix && mismatches.length > 0 };
  }

  /** Visitas = lançamentos de consumo não estornados. */
  async visitCounts(tenantId: string, membershipIds: string[]) {
    if (!membershipIds.length) return new Map<string, number>();
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ['membershipId'],
      where: { tenantId, membershipId: { in: membershipIds }, type: 'CREDITO', reversedBy: { is: null } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.membershipId, r._count._all]));
  }
}
