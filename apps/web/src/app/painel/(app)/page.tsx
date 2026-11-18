'use client';

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
}

export default function DashboardPage() {
  const { me } = usePanel();
  const { data, error } = useLoad(() => staffApi<Dashboard>('/api/admin/dashboard'), []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const tiles = [
    { label: 'Clientes vinculados', value: data.members, hint: `+${data.newMembersThisMonth} este mês` },
    { label: `${cap(data.unitLabelPlural)} no mês`, value: data.stampsThisMonth, hint: `${data.visitsThisMonth} lançamentos` },
    { label: 'Recompensas liberadas no mês', value: data.rewardsUnlockedThisMonth },
    { label: 'Recompensas resgatadas no mês', value: data.rewardsRedeemedThisMonth },
    { label: 'Recompensas a resgatar', value: data.rewardsAvailableNow, hint: 'disponíveis agora' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {me.user.name.split(' ')[0]}!</h1>
        <p className="text-stone-600">Resumo desde {formatDate(data.since)}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <p className="text-sm text-stone-500">{t.label}</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">{t.value.toLocaleString('pt-BR')}</p>
            {t.hint && <p className="mt-1 text-xs text-stone-500">{t.hint}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
