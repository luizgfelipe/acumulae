'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card, FullPageSpinner, LinkButton, Modal } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { ProgramItem, ProgramsList } from '@/lib/programs';
import { useLoad } from '@/lib/use-load';

export default function ProgramsPage() {
  const { data, error, setData } = useLoad(() => staffApi<ProgramsList>('/api/admin/programs'), []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'deactivate' | 'delete'; program: ProgramItem } | null>(null);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const { limit } = data;
  const atLimit = limit.active >= limit.maxActive;

  async function act(p: ProgramItem, action: 'activate' | 'deactivate' | 'delete') {
    setBusy(p.id);
    setActionError(null);
    try {
      const r =
        action === 'delete'
          ? await staffApi<ProgramsList>(`/api/admin/programs/${p.id}`, { method: 'DELETE' })
          : await staffApi<ProgramsList>(`/api/admin/programs/${p.id}/${action}`, { method: 'POST' });
      setData(r);
      setConfirm(null);
    } catch (e) {
      setConfirm(null);
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programas</h1>
          <p className="text-sm text-stone-600">
            {limit.active} de {limit.maxActive} {limit.maxActive === 1 ? 'programa ativo' : 'programas ativos'} · plano {limit.planName}
          </p>
        </div>
        <LinkButton href="/painel/programas/novo" className="h-10 text-sm">
          + Novo programa
        </LinkButton>
      </div>

      {atLimit && (
        <Alert kind="info">
          Seu plano permite {limit.maxActive === 1 ? '1 programa ativo' : `${limit.maxActive} programas ativos`}. Você pode criar outros
          programas desativados e trocar quando quiser.
        </Alert>
      )}
      {actionError && <Alert>{actionError}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.items.map((p) => (
          <Card key={p.id} className={p.active ? '' : 'bg-stone-50'}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{p.name}</p>
                <p className="text-sm text-stone-600">
                  A cada {p.goal} {p.unitLabelPluralResolved}: {p.rewardDescription}
                </p>
              </div>
              <Badge color={p.active ? 'green' : 'stone'}>{p.active ? 'Ativo' : 'Desativado'}</Badge>
            </div>
            <ul className="mt-3 space-y-0.5 text-xs text-stone-500">
              <li>{p.carryOverExcess ? 'Guarda o excedente para o próximo cartão' : 'Não guarda o excedente (cartão recomeça do zero)'}</li>
              <li>Resgate: {p.redeemWeekdaysText ?? 'qualquer dia'} · máximo {p.maxPerEntry} por lançamento</li>
              <li>
                {p.members} {p.members === 1 ? 'cliente' : 'clientes'} · {p.rewardsAvailable} recompensa(s) a resgatar
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <LinkButton href={`/painel/programas/${p.id}`} variant="secondary" className="h-9 px-3 text-sm">
                Editar
              </LinkButton>
              {p.active ? (
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setConfirm({ kind: 'deactivate', program: p })}>
                  Desativar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === p.id}
                  disabled={atLimit}
                  title={atLimit ? 'Desative um programa ativo antes' : undefined}
                  onClick={() => act(p, 'activate')}
                >
                  Ativar
                </Button>
              )}
              {p.members === 0 && (
                <Button size="sm" variant="ghost" className="text-stone-500" onClick={() => setConfirm({ kind: 'delete', program: p })}>
                  Excluir
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {data.items.length === 0 && (
        <Card className="text-center">
          <p className="text-stone-600">Nenhum programa ainda.</p>
          <Link href="/painel/programas/novo" className="mt-2 inline-block font-semibold text-brand-700">
            Criar o primeiro programa
          </Link>
        </Card>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'delete' ? 'Excluir programa' : 'Desativar programa'}
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-stone-700">
              {confirm.kind === 'delete' ? (
                <>
                  O programa <strong>{confirm.program.name}</strong> será excluído. Como ele ainda não tem clientes, nada se perde.
                </>
              ) : (
                <>
                  O caixa deixa de lançar consumo em <strong>{confirm.program.name}</strong>. Os clientes continuam vendo o cartão e
                  podem usar as recompensas já liberadas. Você pode reativar depois.
                </>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
              <Button variant="danger" loading={busy === confirm.program.id} onClick={() => act(confirm.program, confirm.kind)}>
                {confirm.kind === 'delete' ? 'Excluir' : 'Desativar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
