'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Alert, Badge, Button, Field, Input, Modal, cx } from './ui';
import { errorMessage, staffApi } from '@/lib/api';
import { LEDGER_LABELS, SOURCE_LABELS, formatMoney, formatDateTime } from '@/lib/format';
import { tr } from '@/lib/region';

export interface LedgerItem {
  id: string;
  type: string;
  quantity: number;
  /** Programa por valor: valor da compra (negativo no estorno). */
  amountCents?: number | null;
  rewardsDelta: number;
  source: string;
  createdAt: string;
  membershipId: string;
  customerName: string;
  programName?: string;
  staffName: string | null;
  storeName: string | null;
  reason: string | null;
  reversedBy: { id: string; createdAt: string; reason: string | null } | null;
  reversible: boolean;
}

function amount(e: LedgerItem) {
  if (e.type === 'RESGATE' || e.type === 'ESTORNO_RESGATE' || e.type === 'RECOMPENSA_LIBERADA' || e.type === 'RECOMPENSA_CANCELADA') {
    const sign = e.rewardsDelta > 0 ? '+' : '';
    return <Badge color={e.rewardsDelta > 0 ? 'green' : 'stone'}>{`${sign}${e.rewardsDelta} recompensa`}</Badge>;
  }
  const stamps = (
    <span className={cx('font-semibold tabular-nums', e.quantity >= 0 ? 'text-emerald-700' : 'text-red-700')}>{e.quantity >= 0 ? `+${e.quantity}` : e.quantity}</span>
  );
  if (e.amountCents == null) return stamps;
  // Programa por valor: o valor da compra e os selos que ela fechou.
  return (
    <span className="whitespace-nowrap">
      {stamps}
      <span className="ml-1.5 text-xs text-stone-500 tabular-nums">
        {e.amountCents < 0 ? '−' : ''}
        {formatMoney(Math.abs(e.amountCents))}
      </span>
    </span>
  );
}

/** Tabela de movimentações do ledger com estorno (RN-70, RN-73). */
export function LedgerTable({ items, onChanged, showCustomer = true }: { items: LedgerItem[]; onChanged: () => void; showCustomer?: boolean }) {
  const [target, setTarget] = useState<LedgerItem | null>(null);
  // Só mostra o programa quando há movimentações de mais de um.
  const manyPrograms = new Set(items.map((i) => i.programName)).size > 1;

  if (!items.length) return <p className="py-6 text-center text-sm text-stone-500">{tr('Nenhuma movimentação encontrada.', 'Nenhum movimento encontrado.')}</p>;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="py-2 pr-3 font-medium">Quando</th>
              <th className="py-2 pr-3 font-medium">Tipo</th>
              {showCustomer && <th className="py-2 pr-3 font-medium">Cliente</th>}
              <th className="py-2 pr-3 font-medium">Qtd.</th>
              <th className="py-2 pr-3 font-medium">Unidade</th>
              <th className="py-2 pr-3 font-medium">Funcionário</th>
              <th className="py-2 pr-3 font-medium">Origem</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((e) => (
              <tr key={e.id} className={cx(e.reversedBy && 'text-stone-400')}>
                <td className="py-2.5 pr-3 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                <td className="py-2.5 pr-3">
                  {LEDGER_LABELS[e.type] ?? e.type}
                  {manyPrograms && e.programName && <span className="block text-xs text-stone-500">{e.programName}</span>}
                  {e.reason && <span className="block text-xs text-stone-500">Motivo: {e.reason}</span>}
                  {e.reversedBy && <span className="block text-xs text-red-600">{tr('Estornado em', 'Anulado em')} {formatDateTime(e.reversedBy.createdAt)}</span>}
                </td>
                {showCustomer && (
                  <td className="py-2.5 pr-3">
                    <Link href={`/painel/clientes/${e.membershipId}`} className="font-medium text-stone-800 hover:text-accent-600 transition-colors">
                      {e.customerName}
                    </Link>
                  </td>
                )}
                <td className="py-2.5 pr-3">{amount(e)}</td>
                <td className="py-2.5 pr-3">{e.storeName ?? '—'}</td>
                <td className="py-2.5 pr-3">{e.staffName ?? '—'}</td>
                <td className="py-2.5 pr-3 text-stone-500">{SOURCE_LABELS[e.source] ?? e.source}</td>
                <td className="py-2.5 text-right">
                  {e.reversible && (
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setTarget(e)}>
                      {tr('Estornar', 'Anular')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReverseModal entry={target} onClose={() => setTarget(null)} onDone={onChanged} />
    </>
  );
}

function ReverseModal({ entry, onClose, onDone }: { entry: LedgerItem | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await staffApi(`/api/admin/ledger/${entry.id}/reverse`, { method: 'POST', body: { reason } });
      setReason('');
      onClose();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!entry} onClose={onClose} title={tr('Estornar movimentação', 'Anular movimento')}>
      {entry && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-stone-700">
            {LEDGER_LABELS[entry.type]} de <strong>{entry.customerName}</strong> em {formatDateTime(entry.createdAt)}
            {entry.type === 'CREDITO' ? ` (${entry.amountCents != null ? `compra de ${formatMoney(entry.amountCents)}` : entry.quantity})` : ''}.{' '}
            {tr(
              'O lançamento original continua visível; será criada uma movimentação contrária.',
              'O registo original continua visível; será criado um movimento contrário.',
            )}
          </p>
          {entry.type === 'CREDITO' && (
            <p className="text-xs text-stone-500">
              {tr(
                'Se este consumo liberou uma recompensa ainda não resgatada, ela também será cancelada.',
                'Se este consumo desbloqueou uma recompensa ainda não resgatada, esta também será cancelada.',
              )}
            </p>
          )}
          <Field label="Motivo (obrigatório)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} autoFocus />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              {tr('Estornar', 'Anular')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
