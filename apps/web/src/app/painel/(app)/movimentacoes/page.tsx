'use client';

import { useState } from 'react';
import { LedgerItem, LedgerTable } from '@/components/ledger-table';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { LEDGER_LABELS } from '@/lib/format';
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
  const [filters, setFilters] = useState({ from: '', to: '', storeId: '', staffUserId: '', type: '' });
  const [page, setPage] = useState(1);
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
      <h1 className="text-2xl font-bold">Movimentações</h1>
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
      {error && <Alert>{error}</Alert>}
      <Card>
        <p className="mb-2 text-sm text-stone-500">{data?.total ?? 0} movimentação(ões)</p>
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
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
