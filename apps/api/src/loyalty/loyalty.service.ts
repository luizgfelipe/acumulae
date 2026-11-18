import { Injectable } from '@nestjs/common';
import { LedgerSource, LoyaltyProgram, Membership, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppError, badRequest, conflict, notFound } from '../common/errors';
import { describeWeekdays, isoWeekdaySaoPaulo } from '../common/time';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface CreditInput {
  tenantId: string;
  storeId: string;
  customerId: string;
  quantity: number;
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
  rewardId?: string | null;
  /** Quantas recompensas usar de uma vez (padrão 1). */
  quantity?: number;
  /** Como o cliente foi identificado no caixa. */
  source: 'QR_PESSOAL' | 'TELEFONE';
  idempotencyKey: string;
}

export interface CardSummary {
  membershipId: string;
  balance: number;
  goal: number;
  rewardsAvailable: number;
  unitLabel: string;
  unitLabelPlural: string;
  rewardDescription: string;
}

export function pluralize(label: string, plural?: string | null) {
  if (plural) return plural;
  if (/[aeiouáéíóú]$/i.test(label)) return `${label}s`;
  if (/ão$/i.test(label)) return label.replace(/ão$/i, 'ões');
  if (/[rsz]$/i.test(label)) return `${label}es`;
  if (/l$/i.test(label)) return label.replace(/l$/i, 'is');
  return `${label}s`;
}

export function summarize(m: Membership, p: LoyaltyProgram): CardSummary {
  return {
    membershipId: m.id,
    balance: m.cachedBalance,
    goal: p.goal,
    rewardsAvailable: m.cachedRewardsAvailable,
    unitLabel: p.unitLabel,
    unitLabelPlural: pluralize(p.unitLabel, p.unitLabelPlural),
    rewardDescription: p.rewardDescription,
  };
}

/** Situação do resgate hoje (RN-64). */
export function redeemRestriction(p: LoyaltyProgram, now = new Date()): string | null {
  if (!p.redeemWeekdays.length) return null;
  if (p.redeemWeekdays.includes(isoWeekdaySaoPaulo(now))) return null;
  return `Resgate permitido apenas: ${describeWeekdays(p.redeemWeekdays)}.`;
}

/**
 * Núcleo do programa de fidelidade. Toda alteração de saldo passa por aqui e gera
 * movimentações imutáveis no ledger (RN-71, RN-72); os caches da membership são
 * atualizados na mesma transação, com a linha da membership travada (FOR UPDATE).
 *
 * Convenção do ledger: `quantity` = variação de selos; `rewardsDelta` = variação de recompensas disponíveis.
 */
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async activeProgram(tx: Tx, tenantId: string): Promise<LoyaltyProgram> {
    const p = await tx.loyaltyProgram.findFirst({ where: { tenantId, active: true }, orderBy: { createdAt: 'desc' } });
    if (!p) throw new AppError(409, 'NO_ACTIVE_PROGRAM', 'O estabelecimento não tem programa de fidelidade ativo.');
    return p;
  }

  /** RN-34 / Q-04: cria o vínculo se não existir. */
  async ensureMembership(tx: Tx, tenantId: string, customerId: string, programId: string) {
    return tx.membership.upsert({
      where: { tenantId_customerId: { tenantId, customerId } },
      create: { tenantId, customerId, programId },
      update: {},
    });
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
      const m = await tx.membership.findUniqueOrThrow({ where: { id: existing.membershipId } });
      const p = await this.activeProgram(tx, input.tenantId);
      const unlocked = await tx.ledgerEntry.count({ where: { parentEntryId: existing.id, type: 'RECOMPENSA_LIBERADA' } });
      return { replay: true, entry: existing, rewardsUnlocked: unlocked, card: summarize(m, p), firstVisit: false };
    }

    const program = await this.activeProgram(tx, input.tenantId);
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw badRequest('INVALID_QUANTITY', 'A quantidade deve ser um inteiro maior ou igual a 1.');
    }
    if (input.quantity > program.maxPerEntry) {
      throw badRequest('QUANTITY_ABOVE_LIMIT', `O máximo por lançamento é ${program.maxPerEntry}.`);
    }

    const ensured = await this.ensureMembership(tx, input.tenantId, input.customerId, program.id);
    const m = await this.lock(tx, ensured.id);
    const now = new Date();

    const entry = await tx.ledgerEntry.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        membershipId: m.id,
        type: 'CREDITO',
        quantity: input.quantity,
        source: input.source,
        staffUserId: input.staffUserId,
        checkoutTokenId: input.checkoutTokenId ?? null,
        idempotencyKey: input.idempotencyKey,
      },
    });

    // RN-37: o excedente fica para o próximo ciclo; pode liberar mais de uma recompensa.
    let balance = m.cachedBalance + input.quantity;
    let available = m.cachedRewardsAvailable;
    let unlocked = 0;
    while (balance >= program.goal) {
      unlocked++;
      const rewardId = randomUUID();
      const rl = await tx.ledgerEntry.create({
        data: {
          tenantId: input.tenantId,
          storeId: input.storeId,
          membershipId: m.id,
          type: 'RECOMPENSA_LIBERADA',
          quantity: -program.goal,
          rewardsDelta: 1,
          source: 'SISTEMA',
          staffUserId: input.staffUserId,
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

    const updated = await tx.membership.update({
      where: { id: m.id },
      data: {
        cachedBalance: balance,
        cachedRewardsAvailable: available,
        programId: program.id,
        lastVisitAt: now,
        firstVisitAt: m.firstVisitAt ?? now,
      },
    });
    return {
      replay: false,
      entry,
      rewardsUnlocked: unlocked,
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

  private async redeemInTx(tx: Tx, input: RedeemInput) {
    const quantity = input.quantity ?? 1;
    const program = await this.activeProgram(tx, input.tenantId);
    const keys = this.redeemKeys(input.idempotencyKey, quantity);

    const existing = await tx.ledgerEntry.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      const entries = await tx.ledgerEntry.findMany({ where: { tenantId: input.tenantId, idempotencyKey: { in: keys } } });
      const m = await tx.membership.findUniqueOrThrow({ where: { id: existing.membershipId } });
      const rewards = await tx.reward.findMany({ where: { id: { in: entries.map((e) => e.rewardId!).filter(Boolean) } } });
      return { replay: true, entries, rewards, card: summarize(m, program) };
    }

    const membership = await tx.membership.findUnique({
      where: { tenantId_customerId: { tenantId: input.tenantId, customerId: input.customerId } },
    });
    if (!membership) throw new AppError(409, 'NO_REWARD', 'O cliente não tem recompensa disponível.');
    const m = await this.lock(tx, membership.id);

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
    return { replay: false, entries, rewards, card: summarize(updated, program) };
  }

  // ───────────────────────── Estorno (RN-70, RN-71) ─────────────────────────

  /**
   * Estorna um CREDITO ou um RESGATE criando a movimentação contrária.
   * Se o crédito liberou recompensas: as ainda disponíveis são canceladas (RECOMPENSA_CANCELADA);
   * se alguma já foi resgatada, o estorno é bloqueado até o resgate ser estornado.
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
        return { reversal: rev, cancelledRewards: 0 };
      }

      // CREDITO
      const rev = await tx.ledgerEntry.create({
        data: { ...base, type: 'ESTORNO_CREDITO', quantity: -entry.quantity, reversesEntryId: entry.id, idempotencyKey: key },
      });
      let balance = m.cachedBalance - entry.quantity;
      let available = m.cachedRewardsAvailable;
      let cancelled = 0;
      while (balance < 0) {
        const candidates = await tx.reward.findMany({
          where: { membershipId: m.id, status: 'DISPONIVEL' },
          orderBy: { createdAt: 'desc' },
        });
        const reward = candidates.find((r) => r.sourceEntryId === entry.id) ?? candidates[0];
        if (!reward) {
          throw conflict(
            'REWARD_ALREADY_REDEEMED',
            'Este consumo liberou uma recompensa que já foi resgatada. Estorne o resgate antes de estornar o consumo.',
          );
        }
        cancelled++;
        await tx.ledgerEntry.create({
          data: {
            ...base,
            type: 'RECOMPENSA_CANCELADA',
            quantity: reward.stampsCost,
            rewardsDelta: -1,
            parentEntryId: rev.id,
            rewardId: reward.id,
            idempotencyKey: `${key}:cancel:${cancelled}`,
          },
        });
        await tx.reward.update({ where: { id: reward.id }, data: { status: 'ESTORNADA' } });
        balance += reward.stampsCost;
        available--;
      }
      await tx.membership.update({ where: { id: m.id }, data: { cachedBalance: balance, cachedRewardsAvailable: available } });
      return { reversal: rev, cancelledRewards: cancelled };
    });
  }

  // ───────────────────────── Reconciliação (RN-72) ─────────────────────────

  /** Recalcula saldos a partir do ledger e compara com os caches. Com `fix`, corrige os divergentes. */
  async reconcile(opts: { tenantId?: string; fix?: boolean } = {}) {
    const where = opts.tenantId ? { tenantId: opts.tenantId } : {};
    const [memberships, sums, rewardCounts] = await Promise.all([
      this.prisma.membership.findMany({ where, select: { id: true, tenantId: true, cachedBalance: true, cachedRewardsAvailable: true } }),
      this.prisma.ledgerEntry.groupBy({ by: ['membershipId'], where, _sum: { quantity: true, rewardsDelta: true } }),
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
    }> = [];
    for (const m of memberships) {
      const s = sumMap.get(m.id);
      const ledgerBalance = s?.quantity ?? 0;
      const ledgerRewards = s?.rewardsDelta ?? 0;
      const rewardsTable = rewardMap.get(m.id) ?? 0;
      if (ledgerBalance !== m.cachedBalance || ledgerRewards !== m.cachedRewardsAvailable || rewardsTable !== ledgerRewards) {
        mismatches.push({ membershipId: m.id, cachedBalance: m.cachedBalance, ledgerBalance, cachedRewards: m.cachedRewardsAvailable, ledgerRewards, rewardsTable });
        if (opts.fix) {
          await this.prisma.membership.update({
            where: { id: m.id },
            data: { cachedBalance: ledgerBalance, cachedRewardsAvailable: ledgerRewards },
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

