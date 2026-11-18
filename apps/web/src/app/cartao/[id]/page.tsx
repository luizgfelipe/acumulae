'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CustomerShell } from '@/components/customer-shell';
import { StampGrid } from '@/components/stamps';
import { Alert, Badge, Button, Card, FullPageSpinner, LinkButton, TenantAvatar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/customer';
import { LEDGER_LABELS, formatDate, formatDateTime, formatShortDate, plural, readableOn } from '@/lib/format';

interface Detail {
  membershipId: string;
  balance: number;
  goal: number;
  rewardsAvailable: number;
  unitLabel: string;
  unitLabelPlural: string;
  rewardDescription: string;
  tenant: { name: string; logoUrl: string | null; primaryColor: string; active: boolean };
  rules: { redeemWeekdaysText: string | null; redeemBlockedToday: string | null };
  firstVisitAt: string | null;
  marketingConsent: boolean | null;
  rewards: Array<{ id: string; description: string; status: string; unlockedAt: string; redeemedAt: string | null; redeemedStore: string | null }>;
  history: Array<{ id: string; type: string; quantity: number; createdAt: string; storeName: string | null }>;
}

export default function Page() {
  return (
    <Suspense>
      <MembershipPage />
    </Suspense>
  );
}

function MembershipPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = useSearchParams().get('novo') === '1';
  const { me } = useMe({ required: true });
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentMsg, setConsentMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api<Detail>(`/api/me/memberships/${id}`).then(setD).catch((e) => setError(errorMessage(e)));
  }, [id, me]);

  async function consent(value: boolean) {
    if (!d) return;
    setD({ ...d, marketingConsent: value });
    setConsentMsg(value ? `Combinado! O ${d.tenant.name} poderá enviar promoções para você.` : null);
    try {
      await api(`/api/me/memberships/${d.membershipId}/consent`, { method: 'PATCH', body: { marketingConsent: value } });
    } catch (e) {
      setD({ ...d, marketingConsent: null });
      setConsentMsg(null);
      setError(errorMessage(e));
    }
  }

  if (error)
    return (
      <CustomerShell>
        <Alert>{error}</Alert>
      </CustomerShell>
    );
  if (!d) return <FullPageSpinner />;

  const color = d.tenant.primaryColor;
  const fg = readableOn(color);
  const available = d.rewards.filter((r) => r.status === 'DISPONIVEL');
  const redeemed = d.rewards.filter((r) => r.status === 'RESGATADA');
  const missing = Math.max(0, d.goal - d.balance);

  return (
    <CustomerShell>
      <div className="space-y-5 pt-2">
        {isNew && <Alert kind="success">Pronto! Agora é só acumular a cada visita ao {d.tenant.name}.</Alert>}

        <div className="overflow-hidden rounded-3xl border-2 shadow-lg shadow-stone-900/10" style={{ background: color, color: fg, borderColor: color }}>
          <div className="flex items-center gap-3 px-5 pt-5">
            <TenantAvatar name={d.tenant.name} logoUrl={d.tenant.logoUrl} color="rgba(255,255,255,0.25)" size={48} />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{d.tenant.name}</h1>
              <p className="text-sm opacity-85">
                A cada {d.goal} {d.unitLabelPlural}: {d.rewardDescription}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-t-3xl bg-white p-5 text-stone-900">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-4xl font-extrabold tabular-nums">
                {d.balance}
                <span className="text-xl text-stone-400">/{d.goal}</span>
              </span>
              <span className="text-sm text-stone-600">{missing === 0 ? 'Meta atingida!' : `Faltam ${plural(missing, d.unitLabel, d.unitLabelPlural)}`}</span>
            </div>
            <StampGrid filled={d.balance} goal={d.goal} color={color} size={d.goal > 15 ? 'sm' : 'md'} />
          </div>
        </div>

        {!d.tenant.active && <Alert kind="warning">O programa deste estabelecimento está pausado. Seu progresso continua guardado.</Alert>}

        {/* RN-35: consentimento de marketing por estabelecimento, perguntado no app do cliente. */}
        {d.marketingConsent === null && (
          <Card>
            <p className="font-medium">
              Quer receber promoções do <strong>{d.tenant.name}</strong>?
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Só esse estabelecimento verá seu telefone para enviar ofertas. Você pode mudar isso quando quiser em Conta.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => consent(true)} style={{ background: color, color: fg }}>
                Quero receber
              </Button>
              <Button size="sm" variant="secondary" onClick={() => consent(false)}>
                Agora não
              </Button>
            </div>
          </Card>
        )}
        {consentMsg && <Alert kind="success">{consentMsg}</Alert>}

        {available.length > 0 && (
          <Card className="border-emerald-200 bg-emerald-50">
            <h2 className="font-semibold text-emerald-900">🎉 {available.length === 1 ? 'Recompensa disponível' : `${available.length} recompensas disponíveis`}</h2>
            <ul className="mt-2 space-y-1 text-sm text-emerald-900">
              {available.map((r) => (
                <li key={r.id}>
                  {r.description} <span className="text-emerald-700">· liberada em {formatShortDate(r.unlockedAt)}</span>
                </li>
              ))}
            </ul>
            {d.rules.redeemBlockedToday ? (
              <p className="mt-3 text-sm text-amber-800">{d.rules.redeemBlockedToday}</p>
            ) : (
              <p className="mt-3 text-sm text-emerald-800">Para resgatar, mostre seu QR no caixa.</p>
            )}
            <LinkButton href="/qr" variant="dark" className="mt-3 w-full">
              Mostrar meu QR
            </LinkButton>
          </Card>
        )}

        <Card>
          <h2 className="mb-2 font-semibold">Regras</h2>
          <ul className="space-y-1 text-sm text-stone-700">
            <li>
              Meta: {d.goal} {d.unitLabelPlural} = {d.rewardDescription}.
            </li>
            <li>O que passar da meta fica para o próximo cartão.</li>
            {d.rules.redeemWeekdaysText && <li>Resgate permitido: {d.rules.redeemWeekdaysText}.</li>}
            {d.firstVisitAt && <li>Primeira visita em {formatDate(d.firstVisitAt)}.</li>}
          </ul>
        </Card>

        {redeemed.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Recompensas resgatadas</h2>
            <ul className="space-y-1 text-sm text-stone-700">
              {redeemed.map((r) => (
                <li key={r.id}>
                  {r.description}: resgatada em {formatShortDate(r.redeemedAt)}
                  {r.redeemedStore ? ` no ${r.redeemedStore}` : ''}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">Histórico</h2>
          {d.history.length === 0 && <p className="text-sm text-stone-500">Nenhuma movimentação ainda.</p>}
          <ul className="divide-y divide-stone-100">
            {d.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{LEDGER_LABELS[h.type] ?? h.type}</p>
                  <p className="text-xs text-stone-500">
                    {formatDateTime(h.createdAt)}
                    {h.storeName ? ` · ${h.storeName}` : ''}
                  </p>
                </div>
                <HistoryAmount type={h.type} quantity={h.quantity} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </CustomerShell>
  );
}

function HistoryAmount({ type, quantity }: { type: string; quantity: number }) {
  if (type === 'RESGATE') return <Badge color="green">Resgatada</Badge>;
  if (type === 'ESTORNO_RESGATE') return <Badge color="amber">Devolvida</Badge>;
  if (type === 'RECOMPENSA_LIBERADA') return <Badge color="brand">Ganhou!</Badge>;
  if (type === 'RECOMPENSA_CANCELADA') return <Badge color="red">Cancelada</Badge>;
  return <span className={quantity >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>{quantity >= 0 ? `+${quantity}` : quantity}</span>;
}
