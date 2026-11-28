'use client';

import { LOCALE, tr } from '@/lib/region';
import Link from 'next/link';
import { usePanel } from '@/components/panel-context';
import { Alert, Badge, Card, FullPageSpinner, cx } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

interface StoreRow {
  storeId: string;
  name: string;
  active: boolean;
  stamps: number;
  visits: number;
  newCustomers: number;
  rewardsRedeemed: number;
  activeCustomers: number;
}

interface Network {
  since: string;
  activeCustomerDays: number;
  items: StoreRow[];
  totals: Omit<StoreRow, 'storeId' | 'name' | 'active'>;
}

const COLUMNS: Array<[keyof Network['totals'], string]> = [
  ['visits', 'Visitas'],
  ['stamps', tr('Selos', 'Carimbos')],
  ['newCustomers', 'Clientes novos'],
  ['rewardsRedeemed', 'Resgates'],
  ['activeCustomers', 'Clientes ativos'],
];

export default function NetworkPage() {
  const { plan } = usePanel();
  if (!plan) return <FullPageSpinner />;
  if (!plan.features.networkDashboard) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Rede</h1>
        <Card className="max-w-xl">
          <p className="text-3xl" aria-hidden>
            🔒
          </p>
          <h2 className="mt-2 font-semibold">Disponível no plano Rede</h2>
          <p className="mt-2 text-sm text-stone-700">
            {tr(
              'Compare as unidades lado a lado: visitas, selos, clientes novos, resgates e clientes ativos de cada uma, com os totais da rede.',
              'Compare as unidades lado a lado: visitas, carimbos, clientes novos, resgates e clientes ativos de cada uma, com os totais da rede.',
            )}
          </p>
          <Link href="/painel/plano" className="mt-4 inline-block font-medium text-accent-600 underline">
            {tr('Ver meu plano', 'Ver o meu plano')}
          </Link>
        </Card>
      </div>
    );
  }
  return <NetworkTable />;
}

function NetworkTable() {
  const { data, error } = useLoad(() => staffApi<Network>('/api/admin/network'), []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  // Destaca a melhor unidade em cada coluna (com mais de uma unidade e algum movimento).
  const best = Object.fromEntries(
    COLUMNS.map(([k]) => {
      const max = Math.max(0, ...data.items.map((s) => s[k]));
      return [k, data.items.length > 1 && max > 0 ? max : null];
    }),
  ) as Record<keyof Network['totals'], number | null>;
  const month = new Date(data.since).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Rede</h1>
        <p className="text-sm text-stone-600">
          Movimento de {month} por unidade. Clientes ativos: com visita nos últimos {data.activeCustomerDays} dias.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {COLUMNS.map(([k, label]) => (
          <Card key={k} className="p-4">
            <p className="text-xs font-medium text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{data.totals[k]}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-5 py-2.5">Unidade</th>
              {COLUMNS.map(([k, label]) => (
                <th key={k} className="px-5 py-2.5 text-right">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.items.map((s) => (
              <tr key={s.storeId} className="transition-colors hover:bg-stone-50">
                <td className="px-5 py-3 font-medium">
                  {s.name} {!s.active && <Badge color="stone">inativa</Badge>}
                </td>
                {COLUMNS.map(([k]) => (
                  <td key={k} className={cx('px-5 py-3 text-right tabular-nums', best[k] !== null && s[k] === best[k] && 'font-bold text-emerald-700')}>
                    {s[k]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 font-semibold">
            <tr>
              <td className="px-5 py-3">Total da rede</td>
              {COLUMNS.map(([k]) => (
                <td key={k} className="px-5 py-3 text-right tabular-nums">
                  {data.totals[k]}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="text-xs text-stone-500">O total de clientes ativos conta uma vez quem frequenta mais de uma unidade.</p>
    </div>
  );
}
