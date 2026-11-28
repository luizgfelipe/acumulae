'use client';

import { LOCALE, tr } from '@/lib/region';
import Link from 'next/link';
import { usePanel } from '@/components/panel-context';
import { Alert, Card, FullPageSpinner } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

interface Dashboard {
  since: string;
  members: number;
  newMembersThisMonth: number;
  stampsThisMonth: number;
  visitsThisMonth: number;
  rewardsUnlockedThisMonth: number;
  rewardsRedeemedThisMonth: number;
  rewardsAvailableNow: number;
  unitLabelPlural: string;
  activePrograms: number;
}

export default function DashboardPage() {
  const { me } = usePanel();
  const { data, error } = useLoad(() => staffApi<Dashboard>('/api/admin/dashboard'), []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const tiles = [
    { label: 'Clientes vinculados', value: data.members, hint: `+${data.newMembersThisMonth} este mês` },
    { label: `${cap(data.unitLabelPlural)} no mês`, value: data.stampsThisMonth, hint: tr(`${data.visitsThisMonth} lançamentos`, `${data.visitsThisMonth} registos`) },
    { label: tr('Recompensas liberadas no mês', 'Recompensas desbloqueadas no mês'), value: data.rewardsUnlockedThisMonth },
    { label: 'Recompensas resgatadas no mês', value: data.rewardsRedeemedThisMonth },
    { label: 'Recompensas a resgatar', value: data.rewardsAvailableNow, hint: 'disponíveis agora' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {me.user.name.split(' ')[0]}!</h1>
        <p className="text-stone-600">Resumo desde {formatDate(data.since)}.</p>
      </div>
      {data.activePrograms === 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand-900">Falta o programa de fidelidade</p>
            <p className="text-sm text-brand-900/80">
              {tr(
                'Crie (ou ative) um programa para começar: por selo ou por valor gasto. Sem ele, o caixa não lança e os clientes não conseguem participar.',
                'Crie (ou ative) um programa para começar: por carimbo ou por valor gasto. Sem ele, o caixa não regista e os clientes não conseguem participar.',
              )}
            </p>
          </div>
          <Link
            href="/painel/programas"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 px-4 font-semibold text-white transition hover:bg-brand-700"
          >
            Ir para Programas
          </Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4 sm:p-5">
            <p className="text-xs leading-snug text-stone-500 sm:text-sm">{t.label}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums sm:text-4xl">{t.value.toLocaleString(LOCALE)}</p>
            {t.hint && <p className="mt-1 text-xs text-stone-500">{t.hint}</p>}
          </Card>
        ))}
      </div>
      <Link
        href="/painel/qr"
        className="flex items-center gap-4 rounded-2xl border border-secondary-300 bg-secondary-100 p-4 transition-colors hover:bg-secondary-300/50 sm:p-5"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-accent-600 shadow-sm" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-stone-900">QR do balcão</span>
          <span className="block text-sm text-stone-600">
            {tr(
              'Imprima o cartaz para os clientes entrarem no programa pela câmera do celular.',
              'Imprima o cartaz para os clientes entrarem no programa pela câmara do telemóvel.',
            )}
          </span>
        </span>
        <span aria-hidden className="text-xl text-accent-600">
          ›
        </span>
      </Link>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
