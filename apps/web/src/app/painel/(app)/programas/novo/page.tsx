'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EMPTY_PROGRAM, ProgramForm } from '@/components/program-form';
import { Card, FullPageSpinner } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { ProgramsList } from '@/lib/programs';
import { useLoad } from '@/lib/use-load';

export default function NewProgramPage() {
  const router = useRouter();
  const { data } = useLoad(() => staffApi<ProgramsList>('/api/admin/programs'), []);
  const [activate, setActivate] = useState<boolean | null>(null);

  if (!data) return <FullPageSpinner />;
  const canActivate = data.limit.active < data.limit.maxActive;
  const active = activate ?? canActivate;

  return (
    <div className="space-y-5">
      <Link href="/painel/programas" className="text-sm font-semibold text-brand-700">
        ← Programas
      </Link>
      <h1 className="text-2xl font-bold">Novo programa</h1>
      <Card className="max-w-2xl">
        <ProgramForm
          initial={EMPTY_PROGRAM}
          submitLabel="Criar programa"
          extra={
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 accent-brand-600"
                checked={active}
                disabled={!canActivate}
                onChange={(e) => setActivate(e.target.checked)}
              />
              <span>
                Ativar agora
                {!canActivate && (
                  <span className="block text-xs text-stone-500">
                    Seu plano já está no limite de programas ativos: o programa será criado desativado.
                  </span>
                )}
              </span>
            </label>
          }
          onSubmit={async (fields) => {
            try {
              await staffApi('/api/admin/programs', { method: 'POST', body: { ...fields, active: active && canActivate } });
              router.replace('/painel/programas');
            } catch (e) {
              throw new Error(errorMessage(e));
            }
          }}
        />
      </Card>
    </div>
  );
}
