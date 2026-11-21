'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { SendNotificationButton } from '@/components/send-notification';
import { Alert, Badge, Button, Card, Field, FullPageSpinner, Input, Select, cx } from '@/components/ui';
import { MONTHS } from '@/lib/announcements';
import { errorMessage, staffApi } from '@/lib/api';
import { formatShortDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

type Tab = 'birthdays' | 'inactive' | 'staff';
/** Linhas por página nos relatórios (a paginação é feita no servidor). */
const PAGE_SIZE = 25;

export default function ReportsPage() {
  const { plan } = usePanel();
  const [tab, setTab] = useState<Tab>('birthdays');
  if (!plan) return <FullPageSpinner />;

  if (!plan.features.reports) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <Card className="max-w-xl">
          <p className="text-3xl" aria-hidden>
            🔒
          </p>
          <h2 className="mt-2 font-semibold">Disponível a partir do plano Profissional</h2>
          <ul className="mt-3 space-y-1 text-sm text-stone-700">
            <li>• Aniversariantes do mês, para mandar um parabéns com desconto</li>
            <li>• Clientes inativos há 30, 60 ou 90 dias, para chamar de volta</li>
            <li>• Lançamentos por funcionário, para conferir o uso do telefone no caixa</li>
            <li>• Enviar notificação só para os aniversariantes ou os inativos</li>
            <li>• Exportar os clientes em CSV</li>
          </ul>
          <Link href="/painel/plano" className="mt-4 inline-block font-medium text-brand-700 underline">
            Ver meu plano
          </Link>
        </Card>
      </div>
    );
  }

  const tabs: Array<[Tab, string]> = [
    ['birthdays', 'Aniversariantes'],
    ['inactive', 'Inativos'],
    ['staff', 'Por funcionário'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        {plan.features.customerExport && <ExportButton />}
      </div>
      <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1 text-sm font-medium" role="tablist">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'flex-1 rounded-lg px-3 py-2 transition-colors',
              tab === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'birthdays' && <Birthdays />}
      {tab === 'inactive' && <Inactive />}
      {tab === 'staff' && <StaffReport />}
    </div>
  );
}

function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setErr(null);
    try {
      // Garante a sessão renovada antes de o navegador baixar o arquivo (o download não renova sozinho).
      await staffApi('/api/admin/plan');
      const a = document.createElement('a');
      a.href = '/api/admin/customers/export.csv';
      a.click();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="text-right">
      <Button variant="secondary" size="sm" onClick={download} loading={busy}>
        Exportar clientes (CSV)
      </Button>
      <p className="mt-1 text-xs text-stone-500">Clientes que aceitaram os Termos de Uso atuais.</p>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </div>
  );
}

// ───────────── Aniversariantes ─────────────

interface BirthdayItem {
  customerId: string;
  membershipId: string;
  name: string;
  day: number;
  phone: string | null;
  marketingConsent: boolean;
  lastVisitAt: string | null;
}

function Birthdays() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(
    () =>
      staffApi<{ month: number; total: number; page: number; pageSize: number; items: BirthdayItem[] }>('/api/admin/reports/birthdays', {
        query: { month, page, pageSize: PAGE_SIZE },
      }),
    [month, page],
  );
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 p-5">
        <div>
          <h2 className="font-semibold">Aniversariantes</h2>
          <p className="text-sm text-stone-600">
            {data ? `${data.total === 1 ? '1 cliente faz' : `${data.total} clientes fazem`} aniversário em ${MONTHS[month - 1]}. ` : ''}
            Telefone completo só de quem aceitou receber promoções.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SendNotificationButton
            segment={{ type: 'birthdays', month }}
            suggestion={{ title: 'Feliz aniversário! 🎉', body: 'Neste mês do seu aniversário, venha comemorar com a gente.' }}
          />
          <div className="w-44">
            <Select
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Mês"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m[0].toUpperCase() + m.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <ReportBody error={error} loading={!data} empty={data?.items.length === 0} emptyText={`Nenhum cliente faz aniversário em ${MONTHS[month - 1]}.`}>
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-5 py-2.5">Dia</th>
              <th className="px-5 py-2.5">Cliente</th>
              <th className="px-5 py-2.5">Telefone</th>
              <th className="hidden px-5 py-2.5 sm:table-cell">Última visita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data?.items.map((b) => (
              <tr key={b.customerId} className="transition-colors hover:bg-stone-50">
                <td className="px-5 py-3 font-semibold tabular-nums">{String(b.day).padStart(2, '0')}</td>
                <td className="px-5 py-3">
                  <Link href={`/painel/clientes/${b.membershipId}`} className="font-medium transition-colors hover:text-brand-700">
                    {b.name}
                  </Link>
                </td>
                <td className="px-5 py-3 tabular-nums">
                  {b.phone ?? '—'} {b.marketingConsent && <Badge color="green">aceita promoções</Badge>}
                </td>
                <td className="hidden px-5 py-3 text-stone-600 sm:table-cell">{b.lastVisitAt ? formatShortDate(b.lastVisitAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={page} total={data?.total ?? 0} pageSize={data?.pageSize ?? PAGE_SIZE} onPage={setPage} />
      </ReportBody>
    </Card>
  );
}

// ───────────── Inativos ─────────────

interface InactiveItem {
  membershipId: string;
  name: string;
  phone: string | null;
  marketingConsent: boolean;
  programName: string;
  balance: number;
  goal: number;
  rewardsAvailable: number;
  lastVisitAt: string;
}

function Inactive() {
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(1);
  const { data, error } = useLoad(
    () => staffApi<{ total: number; page: number; pageSize: number; items: InactiveItem[] }>('/api/admin/reports/inactive', { query: { days, page, pageSize: PAGE_SIZE } }),
    [days, page],
  );
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 p-5">
        <div>
          <h2 className="font-semibold">Clientes inativos</h2>
          <p className="text-sm text-stone-600">{data ? `${data.total} ${data.total === 1 ? 'cartão' : 'cartões'} sem visita há mais de ${days} dias.` : ' '}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SendNotificationButton
            segment={{ type: 'inactive', days }}
            suggestion={{ title: 'Estamos com saudade!', body: 'Faz tempo que você não aparece. Passe aqui e continue juntando selos no seu cartão.' }}
          />
          <div className="w-44">
            <Select
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Sem visita há"
            >
              {[30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  Mais de {d} dias
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
      <ReportBody error={error} loading={!data} empty={data?.items.length === 0} emptyText="Nenhum cliente inativo nesse período.">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-5 py-2.5">Cliente</th>
              <th className="hidden px-5 py-2.5 md:table-cell">Programa</th>
              <th className="px-5 py-2.5">Saldo</th>
              <th className="px-5 py-2.5">Última visita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data?.items.map((m) => (
              <tr key={m.membershipId} className="transition-colors hover:bg-stone-50">
                <td className="px-5 py-3">
                  <Link href={`/painel/clientes/${m.membershipId}`} className="font-medium transition-colors hover:text-brand-700">
                    {m.name}
                  </Link>
                  <p className="text-xs tabular-nums text-stone-500">{m.phone ?? '—'}</p>
                </td>
                <td className="hidden px-5 py-3 text-stone-600 md:table-cell">{m.programName}</td>
                <td className="px-5 py-3 tabular-nums">
                  {m.balance}/{m.goal} {m.rewardsAvailable > 0 && <Badge color="green">{m.rewardsAvailable} para usar</Badge>}
                </td>
                <td className="px-5 py-3 text-stone-600">{formatShortDate(m.lastVisitAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager page={page} total={data?.total ?? 0} pageSize={data?.pageSize ?? PAGE_SIZE} onPage={setPage} />
      </ReportBody>
    </Card>
  );
}

// ───────────── Por funcionário ─────────────

interface StaffItem {
  staffUserId: string;
  name: string;
  credits: number;
  stamps: number;
  phoneCredits: number;
  phoneShare: number;
  reversedCredits: number;
  redemptions: number;
  phoneRedemptions: number;
  attention: boolean;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const isoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

function StaffReport() {
  const today = isoDay(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const { data, error } = useLoad(() => staffApi<{ teamPhoneShare: number; items: StaffItem[] }>('/api/admin/reports/staff', { query: { from, to } }), [from, to]);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 p-5">
        <div className="max-w-md">
          <h2 className="font-semibold">Lançamentos por funcionário</h2>
          <p className="text-sm text-stone-600">
            Lançar pelo telefone dispensa o QR do cliente. Um uso muito acima da média da equipe ({data ? pct(data.teamPhoneShare) : '…'}) vale uma conferida.
          </p>
        </div>
        <div className="flex gap-2">
          <Field label="De">
            <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </Field>
          <Field label="Até">
            <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </Field>
        </div>
      </div>
      <ReportBody error={error} loading={!data} empty={data?.items.length === 0} emptyText="Nenhum lançamento no período.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-2.5">Funcionário</th>
                <th className="px-5 py-2.5 text-right">Lançamentos</th>
                <th className="px-5 py-2.5 text-right">Selos</th>
                <th className="px-5 py-2.5 text-right">Pelo telefone</th>
                <th className="px-5 py-2.5 text-right">Estornados</th>
                <th className="px-5 py-2.5 text-right">Resgates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.items.map((s) => (
                <tr key={s.staffUserId} className={cx('transition-colors hover:bg-stone-50', s.attention && 'bg-amber-50/60')}>
                  <td className="px-5 py-3 font-medium">
                    {s.name} {s.attention && <Badge color="amber">conferir</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.credits}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.stamps}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {s.phoneCredits} <span className="text-stone-500">({pct(s.phoneShare)})</span>
                  </td>
                  <td className={cx('px-5 py-3 text-right tabular-nums', s.reversedCredits > 0 && 'text-red-700')}>{s.reversedCredits}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {s.redemptions}
                    {s.phoneRedemptions > 0 && <span className="text-stone-500"> ({s.phoneRedemptions} pelo telefone)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportBody>
    </Card>
  );
}

/** Anterior / Próxima das listas paginadas no servidor. */
function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-stone-100 px-5 py-3 text-sm">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Anterior
      </Button>
      <span className="text-stone-600">
        Página {page} de {pages}
      </span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Próxima
      </Button>
    </div>
  );
}

function ReportBody({
  error,
  loading,
  empty,
  emptyText,
  children,
}: {
  error: string | null;
  loading: boolean;
  empty: boolean | undefined;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (error)
    return (
      <div className="p-5">
        <Alert>{error}</Alert>
      </div>
    );
  if (loading) return <p className="p-5 text-sm text-stone-500">Carregando…</p>;
  if (empty) return <p className="p-5 text-sm text-stone-500">{emptyText}</p>;
  return <>{children}</>;
}
