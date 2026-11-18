'use client';

import { QRCodeSVG } from 'qrcode.react';
import { FormEvent, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { Alert, Badge, Button, Card, Field, FullPageSpinner, Input, Modal } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

interface Store {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  signupUrl: string;
}

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function StoresPage() {
  const { me } = usePanel();
  const { data, error, setData } = useLoad(() => staffApi<Store[]>('/api/admin/stores'), []);
  const [form, setForm] = useState({ name: '', address: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Store | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      setData(await staffApi<Store[]>('/api/admin/stores', { method: 'POST', body: { name: form.name, slug: slugify(form.name), address: form.address || null } }));
      setForm({ name: '', address: '' });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Store) {
    try {
      setData(await staffApi<Store[]>(`/api/admin/stores/${s.id}`, { method: 'PATCH', body: { status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' } }));
    } catch (err) {
      alertError(errorMessage(err));
    }
  }

  const [toggleError, alertError] = useState<string | null>(null);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Unidades</h1>
      {toggleError && <Alert>{toggleError}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {data.map((s) => (
          <Card key={s.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-stone-500">{s.address ?? 'Sem endereço'}</p>
              </div>
              <Badge color={s.status === 'ACTIVE' ? 'green' : 'stone'}>{s.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setPrinting(s)}>
                QR do balcão
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toggle(s)}>
                {s.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="max-w-xl">
        <h2 className="mb-3 font-semibold">Nova unidade</h2>
        <form onSubmit={create} className="space-y-3">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Sushi X - Shopping" required />
          </Field>
          <Field label="Endereço (opcional)">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          {formError && <Alert>{formError}</Alert>}
          <Button type="submit" loading={busy}>
            Adicionar unidade
          </Button>
        </form>
      </Card>

      <Modal open={!!printing} onClose={() => setPrinting(null)} title="QR do balcão">
        {printing && (
          <div className="space-y-4">
            <div id="print-area" className="rounded-2xl border border-stone-200 p-6 text-center">
              <p className="text-lg font-bold">{me.context?.tenantName}</p>
              <p className="mb-4 text-sm text-stone-600">Participe do nosso programa de fidelidade</p>
              <div className="mx-auto w-fit">
                <QRCodeSVG value={printing.signupUrl} size={220} level="M" marginSize={0} />
              </div>
              <p className="mt-4 text-sm font-medium">Aponte a câmera do celular</p>
              <p className="mt-1 text-xs text-stone-500">{printing.signupUrl}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(printing.signupUrl)}>
                Copiar link
              </Button>
              <Button onClick={() => printQr()}>Imprimir</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Imprime só o cartaz do QR, numa janela separada. */
function printQr() {
  const el = document.getElementById('print-area');
  if (!el) return;
  const w = window.open('', '_blank', 'width=600,height=800');
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><title>QR do balcão</title><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;padding:40px;text-align:center}p{margin:4px 0}.big{font-size:28px;font-weight:800}svg{width:320px;height:320px;margin:24px auto}</style></head><body><div>${el.innerHTML}</div><script>window.onload=()=>{window.print()}</script></body></html>`,
  );
  w.document.close();
}
