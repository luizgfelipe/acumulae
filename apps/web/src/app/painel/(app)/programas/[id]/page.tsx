'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ProgramForm } from '@/components/program-form';
import { Alert, Badge, Card, FullPageSpinner } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { ProgramItem } from '@/lib/programs';
import { useLoad } from '@/lib/use-load';

export default function EditProgramPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: p, error } = useLoad(() => staffApi<ProgramItem>(`/api/admin/programs/${id}`), [id]);

  if (error) return <Alert>{error}</Alert>;
  if (!p) return <FullPageSpinner />;

  return (
    <div className="space-y-5">
      <Link href="/painel/programas" className="text-sm font-semibold text-accent-600">
        ← Programas
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{p.name}</h1>
        <Badge color={p.active ? 'green' : 'stone'}>{p.active ? 'Ativo' : 'Desativado'}</Badge>
      </div>
      <Card className="max-w-2xl">
        <ProgramForm
          initial={p}
          valueLocked={p.valueLocked}
          submitLabel="Salvar alterações"
          extra={<p className="text-xs text-stone-500">Mudar a meta não altera recompensas já liberadas.</p>}
          onSubmit={async (fields) => {
            try {
              await staffApi(`/api/admin/programs/${id}`, { method: 'PUT', body: fields });
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
