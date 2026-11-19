'use client';

import { useEffect } from 'react';
import { usePanel } from '@/components/panel-context';
import { ProgressBar } from '@/components/stamps';
import { Alert, Badge, Card, FullPageSpinner, cx } from '@/components/ui';
import { CUSTOMER_WARNING_RATIO, PlanInfo, SUPPORT_LABELS, Usage, brl, daysLeft, planNotice } from '@/lib/plan';

export default function PlanPage() {
  const { plan, reload } = usePanel();
  // O uso muda com o que é feito nas outras abas: atualiza ao abrir.
  useEffect(() => {
    reload();
  }, [reload]);
  if (!plan) return <FullPageSpinner />;
  const notice = planNotice(plan);
  const left = daysLeft(plan.expiresAt);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Meu plano</h1>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">Plano contratado</p>
                <p className="text-2xl font-extrabold">{plan.contracted.name}</p>
                {plan.expired && <p className="text-sm text-red-700">Vencido: valendo os recursos do plano {plan.plan.name}</p>}
              </div>
              {plan.plan.priceCents > 0 && !plan.expired && (
                <p className="text-right">
                  <span className="text-xl font-bold">{brl(plan.plan.priceCents)}</span>
                  <span className="block text-xs text-stone-500">por mês</span>
                </p>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-stone-500">Validade</dt>
                <dd className="font-medium">
                  {plan.expiresAt ? new Date(plan.expiresAt).toLocaleDateString('pt-BR') : 'Sem data de vencimento'}
                  {left !== null && left > 0 && <span className="text-stone-500"> · {left === 1 ? 'falta 1 dia' : `faltam ${left} dias`}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-stone-500">Suporte</dt>
                <dd className="font-medium">{SUPPORT_LABELS[plan.plan.supportChannel]}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">Uso do plano</h2>
            <div className="space-y-4">
              <UsageRow
                label={`Clientes ativos (últimos ${plan.activeCustomerDays} dias)`}
                usage={plan.limits.activeCustomers}
                hint="Passar do limite não trava o caixa: os clientes continuam acumulando normalmente."
                warnRatio={CUSTOMER_WARNING_RATIO}
              />
              <UsageRow label="Programas ativos" usage={plan.limits.activePrograms} />
              <UsageRow
                label="Unidades ativas"
                usage={plan.limits.stores}
                hint={
                  plan.limits.stores.extraPriceCents !== null
                    ? `Inclusas no plano: ${plan.limits.stores.included}. Unidade extra: ${brl(plan.limits.stores.extraPriceCents)} por mês.`
                    : undefined
                }
              />
              <UsageRow label="Funcionários (com convites pendentes)" usage={plan.limits.staff} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">Recursos</h2>
            <ul className="space-y-2.5 text-sm">
              <Feature on>Caixa com QR pessoal, QR temporário e telefone</Feature>
              <Feature on>Painel com clientes e histórico</Feature>
              <Feature on>Logo e cor do cartão</Feature>
              <Feature on={plan.features.maxStampIcons > 5}>
                {plan.features.maxStampIcons > 5 ? `${plan.features.maxStampIcons} ícones de selo` : `${plan.features.maxStampIcons} ícones de selo (15 nos planos acima)`}
              </Feature>
              <Feature on={plan.features.cardCustomization}>Cor secundária e modelos de cartão</Feature>
              <Feature on={plan.features.customStampImage}>Imagem própria no selo</Feature>
              <Feature on={plan.features.reports}>Relatórios de aniversariantes, inativos e por funcionário</Feature>
              <Feature on={plan.features.customerExport}>Exportar clientes (CSV), só os que aceitaram promoções</Feature>
              <Feature on={plan.features.networkDashboard}>Painel consolidado da rede</Feature>
            </ul>
          </Card>

          <Card className="border-brand-200 bg-brand-50">
            <h2 className="font-semibold">Quer mudar de plano ou contratar unidades extras?</h2>
            <p className="mt-1 text-sm text-stone-700">
              Fale com o suporte do Acumulaê pelo {SUPPORT_LABELS[plan.plan.supportChannel].toLowerCase()}. A troca vale na hora, e nada do que você já
              configurou é apagado: recursos que voltarem a ser liberados reaparecem como estavam.
            </p>
            <UpgradeHint plan={plan} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function UsageRow({ label, usage, hint, warnRatio = 1 }: { label: string; usage: Usage; hint?: string; warnRatio?: number }) {
  // Vermelho só quando passa do limite; no limite (ex.: 1 de 1 programa) é só um aviso.
  const over = usage.max !== null && usage.used > usage.max;
  const warn = usage.max !== null && usage.used >= usage.max * warnRatio;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cx('tabular-nums', over ? 'font-semibold text-red-700' : warn ? 'font-semibold text-amber-700' : 'text-stone-600')}>
          {usage.max === null ? `${usage.used} · ilimitado` : `${usage.used} de ${usage.max}`}
        </span>
      </div>
      {usage.max !== null && <ProgressBar value={usage.used} max={usage.max} color={over ? '#b91c1c' : warn ? '#d97706' : '#16a34a'} />}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

function Feature({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <li className={cx('flex items-start gap-2', !on && 'text-stone-400')}>
      <span aria-hidden className={on ? 'text-emerald-600' : ''}>
        {on ? '✓' : '🔒'}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Sugere o plano seguinte com base no que está no limite. */
function UpgradeHint({ plan }: { plan: PlanInfo }) {
  const full = Object.entries(plan.limits).filter(([, u]) => u.max !== null && u.used >= u.max).map(([k]) => k);
  if (!full.length || plan.plan.code === 'REDE') return null;
  const labels: Record<string, string> = { activeCustomers: 'clientes ativos', activePrograms: 'programas', stores: 'unidades', staff: 'funcionários' };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span>No limite:</span>
      {full.map((k) => (
        <Badge key={k} color="amber">
          {labels[k]}
        </Badge>
      ))}
    </div>
  );
}
