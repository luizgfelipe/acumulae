'use client';

import { staffApi } from '@/lib/api';
import { CONTACT_EMAIL } from '@/lib/contact';
import { ComparePlan, ComparePlans, SUPPORT_LABELS, brl } from '@/lib/plan';
import { useLoad } from '@/lib/use-load';
import { Alert, Badge, Card, cx } from './ui';

const SUPPORT_RANK: Record<ComparePlan['supportChannel'], number> = { EMAIL: 0, WHATSAPP: 1, WHATSAPP_PRIORITARIO: 2 };

/** Limite numérico: null = ilimitado (vale mais que qualquer número). */
const rankLimit = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
const limit = (n: number | null, unit: string) => (n === null ? 'Ilimitados' : `Até ${n.toLocaleString('pt-BR')} ${unit}`);

interface Row {
  label: string;
  /** Texto da célula; boolean vira ✓ ou "—". */
  value: (p: ComparePlan) => string | boolean;
  /** Para destacar o que é melhor que o plano atual (maior = melhor). */
  rank: (p: ComparePlan) => number;
  hint?: (p: ComparePlan) => string | null;
}

const ROWS: Row[] = [
  {
    label: 'Programas ativos',
    value: (p) => (p.limits.activePrograms === null ? 'Ilimitados' : p.limits.activePrograms === 1 ? '1 programa' : `${p.limits.activePrograms} programas`),
    rank: (p) => rankLimit(p.limits.activePrograms),
  },
  {
    label: 'Unidades',
    value: (p) => (p.limits.includedStores === 1 ? '1 unidade' : `${p.limits.includedStores} unidades`),
    rank: (p) => p.limits.includedStores + (p.limits.extraStorePriceCents !== null ? 0.5 : 0),
    hint: (p) => (p.limits.extraStorePriceCents !== null ? `Extra: ${brl(p.limits.extraStorePriceCents)}/mês cada` : 'Sem unidade extra'),
  },
  { label: 'Funcionários', value: (p) => limit(p.limits.staff, 'pessoas'), rank: (p) => rankLimit(p.limits.staff) },
  {
    label: 'Notificações aos clientes',
    value: (p) => (p.limits.announcementsPerMonth === null ? 'Ilimitadas' : `${p.limits.announcementsPerMonth} por mês`),
    rank: (p) => rankLimit(p.limits.announcementsPerMonth),
  },
  { label: 'Ícones de selo', value: (p) => `${p.features.maxStampIcons} ícones`, rank: (p) => p.features.maxStampIcons },
  { label: 'Imagem própria no selo', value: (p) => p.features.customStampImage, rank: (p) => +p.features.customStampImage },
  { label: 'Cor secundária e modelos de cartão', value: (p) => p.features.cardCustomization, rank: (p) => +p.features.cardCustomization },
  {
    label: 'Relatórios (aniversariantes, inativos, funcionários)',
    value: (p) => p.features.reports,
    rank: (p) => +p.features.reports,
    hint: (p) => (p.features.reports ? 'Com envio de notificação para os filtrados' : null),
  },
  { label: 'Exportar clientes (CSV)', value: (p) => p.features.customerExport, rank: (p) => +p.features.customerExport },
  { label: 'Painel consolidado da rede', value: (p) => p.features.networkDashboard, rank: (p) => +p.features.networkDashboard },
  { label: 'Suporte', value: (p) => SUPPORT_LABELS[p.supportChannel], rank: (p) => SUPPORT_RANK[p.supportChannel] },
];

/** Comparação dos planos: o atual em destaque e, nos outros, o que muda em relação a ele. */
export function PlanCompare() {
  const { data, error } = useLoad(() => staffApi<ComparePlans>('/api/admin/plans'), []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const current = data.items.find((p) => p.code === data.current);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Compare os planos</h2>
        <p className="text-sm text-stone-600">Em verde, o que cada plano tem a mais que o seu.</p>
      </div>
      <div className={cx('grid gap-4 sm:grid-cols-2', data.items.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        {data.items.map((p) => {
          const mine = p.code === data.current;
          return (
            <Card key={p.code} className={cx('flex flex-col', mine && 'ring-2 ring-brand-500')}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-xl font-extrabold">{p.name}</h3>
                {mine && <Badge color="brand">Seu plano</Badge>}
              </div>
              {/* Preço 0 = valor personalizado, combinado com o Acumulaê (ex.: Piloto). */}
              {p.priceCents > 0 ? (
                <p className="mt-1">
                  <span className="text-2xl font-bold">{brl(p.priceCents)}</span>
                  <span className="text-sm text-stone-500"> /mês</span>
                </p>
              ) : (
                <p className="mt-1 font-semibold text-stone-600">Valor personalizado</p>
              )}
              <dl className="mt-4 flex-1 divide-y divide-stone-100 text-sm">
                {ROWS.map((r) => {
                  const v = r.value(p);
                  const better = !mine && current && r.rank(p) > r.rank(current);
                  const worse = !mine && current && r.rank(p) < r.rank(current);
                  const hint = r.hint?.(p);
                  return (
                    <div key={r.label} className="flex items-start justify-between gap-3 py-2">
                      <dt className="text-stone-600">{r.label}</dt>
                      <dd className={cx('text-right font-medium', better && 'text-emerald-700', worse && 'text-stone-400')}>
                        {typeof v === 'boolean' ? (
                          <span aria-label={v ? 'Incluído' : 'Não incluído'}>{v ? '✓' : '—'}</span>
                        ) : (
                          v
                        )}
                        {hint && <span className="block text-xs font-normal text-stone-500">{hint}</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {!mine && <p className="mt-4 text-xs text-stone-500">Para mudar para o {p.name}, fale com o suporte do Acumulaê pelo e-mail {CONTACT_EMAIL}.</p>}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
