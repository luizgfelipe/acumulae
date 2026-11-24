'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Input, Spinner } from '@/components/ui';
import { staffApi } from '@/lib/api';
import { formatDate, formatE164 } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

interface CustomersPage {
  total: number;
  page: number;
  pageSize: number;
  items: Array<{
    membershipId: string;
    name: string;
    programName: string;
    phone: string | null;
    marketingConsent: boolean | null;
    balance: number;
    goal: number;
    rewardsAvailable: number;
    lastVisitAt: string | null;
    visits: number;
    deleted: boolean;
  }>;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading } = useLoad(
    () => staffApi<CustomersPage>('/api/admin/customers', { query: { search: query, page, pageSize: 25 } }),
    [query, page],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const manyPrograms = new Set(data?.items.map((i) => i.programName)).size > 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-stone-600">{data ? `${data.total} cliente(s) vinculados` : ' '}</p>
        </div>
        <Input className="max-w-xs" placeholder="Buscar por nome ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <Alert>{error}</Alert>}
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-3 py-3 font-medium">Telefone</th>
                <th className="px-3 py-3 font-medium">Saldo</th>
                <th className="px-3 py-3 font-medium">Visitas</th>
                <th className="px-3 py-3 font-medium">Último consumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data?.items.map((c) => (
                <tr key={c.membershipId} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/painel/clientes/${c.membershipId}`} className="font-medium hover:text-accent-600 transition-colors">
                      {c.name}
                    </Link>
                    {manyPrograms && <span className="block text-xs text-stone-500">{c.programName}</span>}
                    {c.rewardsAvailable > 0 && (
                      <span className="ml-2">
                        <Badge color="green">{c.rewardsAvailable} a resgatar</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-stone-600" title={c.marketingConsent ? 'Aceitou promoções' : 'Sem consentimento de marketing'}>
                    {c.marketingConsent ? formatE164(c.phone) : (c.phone ?? '—')}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {c.balance}/{c.goal}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{c.visits}</td>
                  <td className="px-3 py-3 text-stone-600">{formatDate(c.lastVisitAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <div className="flex justify-center py-6 text-brand-600">
            <Spinner />
          </div>
        )}
        {data && !data.items.length && !loading && <p className="py-8 text-center text-sm text-stone-500">Nenhum cliente encontrado.</p>}
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
      <p className="text-xs text-stone-500">O telefone completo só aparece para clientes que aceitaram receber promoções do seu estabelecimento.</p>
    </div>
  );
}
