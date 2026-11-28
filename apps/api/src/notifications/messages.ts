import { NotificationKind } from '@prisma/client';
import { tr } from '../common/region';
import { formatMoney } from '../loyalty/value';
import type { Tx } from '../prisma/prisma.service';

/** Unidade do programa no singular e no plural ("rodízio"/"rodízios"). */
export interface Units {
  one: string;
  many: string;
}

const qty = (n: number, u: Units) => `${n} ${n === 1 ? u.one : u.many}`;

export interface NotificationText {
  kind: NotificationKind;
  title: string;
  body: string;
}

/** Selos recebidos sem completar o cartão. */
export function creditMessage(p: {
  tenant: string;
  quantity: number;
  balance: number;
  goal: number;
  units: Units;
  reward: string;
  /** Recompensas já liberadas e ainda não resgatadas: o aviso lembra o cliente. */
  rewardsAvailable?: number;
  /** Programa por valor: a compra, a sobra que ficou e quanto vale o selo. */
  value?: { amountCents: number; leftoverCents: number; stampValueCents: number };
}): NotificationText {
  const missing = Math.max(0, p.goal - p.balance);
  const pending = p.rewardsAvailable ?? 0;
  const reminder =
    pending === 0
      ? ''
      : pending === 1
        ? tr(' Você tem 1 recompensa para usar.', ' Tem 1 recompensa para usar.')
        : tr(` Você tem ${pending} recompensas para usar.`, ` Tem ${pending} recompensas para usar.`);
  const card = tr(`Seu cartão está com ${p.balance} de ${p.goal}.`, `O seu cartão está com ${p.balance} de ${p.goal}.`);
  if (p.value) {
    const purchase = formatMoney(p.value.amountCents);
    // Compra que não fechou selo: só a sobra mudou.
    if (p.quantity === 0) {
      return {
        kind: 'CREDITO',
        title: tr(`Compra de ${purchase} registrada no ${p.tenant}`, `Compra de ${purchase} registada no ${p.tenant}`),
        body: `Faltam ${formatMoney(p.value.stampValueCents - p.value.leftoverCents)} para o próximo ${p.units.one}. ${card}${reminder}`,
      };
    }
    const saved = p.value.leftoverCents > 0 ? ` ${formatMoney(p.value.leftoverCents)} já contam para o próximo ${p.units.one}.` : '';
    return {
      kind: 'CREDITO',
      title: `+${qty(p.quantity, p.units)} no ${p.tenant}`,
      body: `Compra de ${purchase}. ${card} ${missing === 1 ? 'Falta' : 'Faltam'} ${qty(missing, p.units)} para: ${p.reward}.${saved}${reminder}`,
    };
  }
  return {
    kind: 'CREDITO',
    title: `+${qty(p.quantity, p.units)} no ${p.tenant}`,
    body: `${card} ${missing === 1 ? 'Falta' : 'Faltam'} ${qty(missing, p.units)} para: ${p.reward}.${reminder}`,
  };
}

export function rewardUnlockedMessage(p: { tenant: string; count: number; reward: string }): NotificationText {
  return {
    kind: 'RECOMPENSA_LIBERADA',
    title:
      p.count === 1
        ? tr(`Recompensa liberada no ${p.tenant}!`, `Recompensa desbloqueada no ${p.tenant}!`)
        : tr(`${p.count} recompensas liberadas no ${p.tenant}!`, `${p.count} recompensas desbloqueadas no ${p.tenant}!`),
    body: tr(
      `${p.reward}. Para resgatar, mostre seu QR ou informe seu telefone no caixa.`,
      `${p.reward}. Para resgatar, mostre o seu QR ou indique o seu telemóvel na caixa.`,
    ),
  };
}

export function redeemedMessage(p: { tenant: string; count: number; reward: string }): NotificationText {
  return {
    kind: 'RESGATE',
    title: p.count === 1 ? `Recompensa resgatada no ${p.tenant}` : `${p.count} recompensas resgatadas no ${p.tenant}`,
    body: `${p.reward}. Bom proveito!`,
  };
}

export function creditReversedMessage(p: {
  tenant: string;
  quantity: number;
  /** Programa por valor: valor da compra estornada (o texto fala da compra, não dos selos). */
  amountCents?: number | null;
  cancelledRewards: number;
  balance: number;
  goal: number;
  units: Units;
  /** Recompensas que continuam disponíveis depois do estorno. */
  rewardsAvailable?: number;
}): NotificationText {
  const what = p.amountCents != null ? `a compra de ${formatMoney(p.amountCents)}` : qty(p.quantity, p.units);
  const cancelled =
    p.cancelledRewards === 0 ? '' : p.cancelledRewards === 1 ? ' 1 recompensa foi cancelada.' : ` ${p.cancelledRewards} recompensas foram canceladas.`;
  const pending = p.rewardsAvailable ?? 0;
  const rewards = pending === 1 ? '1 recompensa para usar' : `${pending} recompensas para usar`;
  // Saldo zerado com recompensa pendente: no app o cartão aparece completo, então o texto acompanha.
  const status =
    pending > 0 && p.balance === 0
      ? tr(` Seu cartão continua completo: você tem ${rewards}.`, ` O seu cartão continua completo: tem ${rewards}.`)
      : tr(
          ` Seu cartão está com ${p.balance} de ${p.goal}.${pending > 0 ? ` Você tem ${rewards}.` : ''}`,
          ` O seu cartão está com ${p.balance} de ${p.goal}.${pending > 0 ? ` Tem ${rewards}.` : ''}`,
        );
  return {
    kind: 'ESTORNO',
    title: tr(`Lançamento estornado no ${p.tenant}`, `Registo anulado no ${p.tenant}`),
    body: tr(`O estabelecimento estornou ${what}.${cancelled}${status}`, `O estabelecimento anulou ${what}.${cancelled}${status}`),
  };
}

export function redeemReversedMessage(p: { tenant: string; reward: string }): NotificationText {
  return {
    kind: 'ESTORNO',
    title: tr(`Resgate desfeito no ${p.tenant}`, `Resgate anulado no ${p.tenant}`),
    body: tr(`A recompensa "${p.reward}" voltou para o seu cartão.`, `A recompensa "${p.reward}" voltou ao seu cartão.`),
  };
}

/**
 * Cria a notificação na transação da movimentação: se o lançamento for desfeito por erro,
 * a notificação some junto; um replay (mesma chave de idempotência) não passa por aqui.
 */
export async function notify(tx: Tx, m: { customerId: string; tenantId: string; id: string }, text: NotificationText) {
  await tx.notification.create({
    data: { customerId: m.customerId, tenantId: m.tenantId, membershipId: m.id, kind: text.kind, title: text.title, body: text.body },
  });
}

/** Nome do estabelecimento, para o texto das notificações. */
export async function tenantName(tx: Tx, tenantId: string) {
  return (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } })).name;
}
