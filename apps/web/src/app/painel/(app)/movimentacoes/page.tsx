'use client';

import { useState } from 'react';
import { LedgerItem, LedgerTable } from '@/components/ledger-table';
import { Alert, Button, Card, Field, Input, Select, cx } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { LEDGER_LABELS } from '@/lib/format';
import { tr } from '@/lib/region';
import { useLoad } from '@/lib/use-load';

interface LedgerPage {
  total: number;
  page: number;
  pageSize: number;
  items: LedgerItem[];
}

interface Staff {
  members: Array<{ userId: string; name: string }>;
}

export default function LedgerPage() {
  const EMPTY = { from: '', to: '', storeId: '', staffUserId: '', type: '' };
  const [filters, setFilters] = useState(EMPTY);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const clearFilters = () => {
    setFilters(EMPTY);
    setPage(1);
  };
  const stores = useLoad(() => staffApi<Array<{ id: string; name: string }>>('/api/admin/stores'), []);
  const staff = useLoad(() => staffApi<Staff>('/api/admin/staff'), []);
  const { data, error, reload } = useLoad(
    () => staffApi<LedgerPage>('/api/admin/ledger', { query: { ...filters, page, pageSize: 50 } }),
    [filters, page],
  );

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tr('Movimentações', 'Movimentos')}</h1>
        <div className="flex items-center gap-2">
          {activeFilters > 0 && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              Limpar
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filtros{activeFilters > 0 ? ` (${activeFilters})` : ''}
            <span className={cx('transition-transform', showFilters && 'rotate-180')}>▾</span>
          </Button>
        </div>
      </div>
      {showFilters && (
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="De">
            <Input type="date" value={filters.from} onChange={set('from')} />
          </Field>
          <Field label="Até">
            <Input type="date" value={filters.to} onChange={set('to')} />
          </Field>
          <Field label="Unidade">
            <Select value={filters.storeId} onChange={set('storeId')}>
              <option value="">Todas</option>
              {stores.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select value={filters.staffUserId} onChange={set('staffUserId')}>
              <option value="">Todos</option>
              {staff.data?.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={filters.type} onChange={set('type')}>
              <option value="">Todos</option>
              {Object.entries(LEDGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      )}
      {error && <Alert>{error}</Alert>}
      <Card>
        <p className="mb-2 text-sm text-stone-500">{data?.total ?? 0} {tr('movimentação(ões)', 'movimento(s)')}</p>
        {data && <LedgerTable items={data.items} onChanged={reload} />}
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span>
            Página {page} de {pages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {tr('Próxima', 'Seguinte')}
          </Button>
        </div>
      )}
    </div>
  );
}
