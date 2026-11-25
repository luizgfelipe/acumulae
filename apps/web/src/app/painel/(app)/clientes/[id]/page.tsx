'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LedgerItem, LedgerTable } from '@/components/ledger-table';
import { ProgressBar } from '@/components/stamps';
import { Alert, Badge, Card, FullPageSpinner } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { leftoverLabel } from '@/lib/card-display';
import { formatDate, formatE164 } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

interface CustomerDetail {
  membershipId: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  marketingConsent: boolean | null;
  joinedAt: string;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  visits: number;
  card: {
    balance: number;
    goal: number;
    rewardsAvailable: number;
    rewardDescription: string;
    unitLabel: string;
    unitLabelPlural: string;
    kind: 'SELO' | 'VALOR';
    stampValueCents: number | null;
    leftoverCents: number;
  };
  rewards: Array<{ id: string; description: string; status: string; unlockedAt: string; redeemedAt: string | null }>;
  ledger: LedgerItem[];
}

const REWARD_STATUS: Record<string, { label: string; color: 'green' | 'stone' | 'red' | 'amber' }> = {
  DISPONIVEL: { label: 'Disponível', color: 'green' },
  RESGATADA: { label: 'Resgatada', color: 'stone' },
  ESTORNADA: { label: 'Cancelada', color: 'red' },
  EXPIRADA: { label: 'Expirada', color: 'amber' },
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error, reload } = useLoad(() => staffApi<CustomerDetail>(`/api/admin/customers/${id}`), [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!c) return <FullPageSpinner />;

  return (
    <div className="space-y-5">
      <Link href="/painel/clientes" className="text-sm font-semibold text-accent-600">
        ← Clientes
      </Link>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h1 className="text-xl font-bold">{c.name}</h1>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Telefone" value={c.marketingConsent ? formatE164(c.phone) : (c.phone ?? '—')} />
            {c.marketingConsent && <Row label="E-mail" value={c.email ?? '—'} />}
            {c.marketingConsent && <Row label="Nascimento" value={formatDate(c.birthDate)} />}
            <Row label="Promoções" value={c.marketingConsent ? 'Aceitou' : c.marketingConsent === false ? 'Recusou' : 'Não respondeu'} />
            <Row label="Cliente desde" value={formatDate(c.joinedAt)} />
            <Row label="Último consumo" value={formatDate(c.lastVisitAt)} />
            <Row label="Visitas" value={String(c.visits)} />
          </dl>
        </Card>
        <Card className="lg:col-span-2">
          <p className="text-sm text-stone-500">Progresso atual</p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            {c.card.balance}/{c.card.goal} <span className="text-base font-medium text-stone-500">{c.card.unitLabelPlural}</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={c.card.balance} max={c.card.goal} color="#F26419" />
          </div>
          {leftoverLabel(c.card) && <p className="mt-2 text-sm text-stone-600">{leftoverLabel(c.card)}</p>}
          <h2 className="mt-5 mb-2 text-sm font-semibold text-stone-700">Recompensas</h2>
          {c.rewards.length === 0 && <p className="text-sm text-stone-500">Nenhuma recompensa ainda.</p>}
          <ul className="space-y-1.5 text-sm">
            {c.rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span>
                  {r.description} <span className="text-stone-500">· {formatDate(r.unlockedAt)}</span>
                </span>
                <Badge color={REWARD_STATUS[r.status]?.color ?? 'stone'}>
                  {REWARD_STATUS[r.status]?.label ?? r.status}
                  {r.redeemedAt ? ` em ${formatDate(r.redeemedAt)}` : ''}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Histórico</h2>
        <LedgerTable items={c.ledger} onChanged={reload} showCustomer={false} />
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
