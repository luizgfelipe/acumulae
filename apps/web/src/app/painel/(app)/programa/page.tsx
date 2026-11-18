'use client';

import { FormEvent, useEffect, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { ProgressBar } from '@/components/stamps';
import { Alert, Button, Card, Field, FullPageSpinner, Input, TenantAvatar, cx } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { WEEKDAYS, readableOn } from '@/lib/format';
import { useLoad } from '@/lib/use-load';

interface ProgramData {
  program: {
    unitLabel: string;
    unitLabelPlural: string | null;
    goal: number;
    rewardDescription: string;
    maxPerEntry: number;
    redeemWeekdays: number[];
  };
  branding: { logoUrl: string | null; primaryColor: string };
  tenant: { name: string; slug: string; signupUrl: string };
}

export default function ProgramPage() {
  const { reload: reloadPanel } = usePanel();
  const { data, error, setData } = useLoad(() => staffApi<ProgramData>('/api/admin/program'), []);
  const [p, setP] = useState<ProgramData['program'] | null>(null);
  const [b, setB] = useState<ProgramData['branding'] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [bMsg, setBMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setP(data.program);
      setB(data.branding);
    }
  }, [data]);

  if (error) return <Alert>{error}</Alert>;
  if (!data || !p || !b) return <FullPageSpinner />;

  async function saveProgram(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const r = await staffApi<ProgramData>('/api/admin/program', {
        method: 'PUT',
        body: { ...p, unitLabelPlural: p!.unitLabelPlural || null },
      });
      setData(r);
      setMsg({ kind: 'success', text: 'Programa atualizado. Recompensas já liberadas não mudam.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    setBMsg(null);
    try {
      const r = await staffApi<ProgramData>('/api/admin/branding', {
        method: 'PUT',
        body: { logoUrl: b!.logoUrl || null, primaryColor: b!.primaryColor },
      });
      setData(r);
      reloadPanel();
      setBMsg({ kind: 'success', text: 'Identidade visual atualizada. Os cartões dos clientes já mostram a nova versão.' });
    } catch (err) {
      setBMsg({ kind: 'error', text: errorMessage(err) });
    }
  }

  const toggleDay = (d: number) =>
    setP({ ...p, redeemWeekdays: p.redeemWeekdays.includes(d) ? p.redeemWeekdays.filter((x) => x !== d) : [...p.redeemWeekdays, d] });
  const validColor = /^#[0-9a-fA-F]{6}$/.test(b.primaryColor);
  const fg = validColor ? readableOn(b.primaryColor) : '#ffffff';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Programa de fidelidade</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={saveProgram} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Meta de selos" hint="De 2 a 50.">
                <Input type="number" min={2} max={50} value={p.goal} onChange={(e) => setP({ ...p, goal: Number(e.target.value) })} required />
              </Field>
              <Field label="Máximo por lançamento" hint="Antifraude.">
                <Input type="number" min={1} max={100} value={p.maxPerEntry} onChange={(e) => setP({ ...p, maxPerEntry: Number(e.target.value) })} required />
              </Field>
            </div>
            <Field label="Recompensa" hint='Ex.: "1 rodízio grátis".'>
              <Input value={p.rewardDescription} onChange={(e) => setP({ ...p, rewardDescription: e.target.value })} required maxLength={120} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome do selo (singular)" hint='Ex.: "rodízio".'>
                <Input value={p.unitLabel} onChange={(e) => setP({ ...p, unitLabel: e.target.value })} required maxLength={30} />
              </Field>
              <Field label="Plural (opcional)" hint='Ex.: "rodízios".'>
                <Input value={p.unitLabelPlural ?? ''} onChange={(e) => setP({ ...p, unitLabelPlural: e.target.value })} maxLength={30} />
              </Field>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-stone-700">Dias em que o resgate é permitido</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = p.redeemWeekdays.includes(d.value);
                  return (
                    <button
                      type="button"
                      key={d.value}
                      onClick={() => toggleDay(d.value)}
                      className={cx('h-10 w-12 rounded-lg border text-sm font-semibold', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-700')}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-stone-500">Nenhum selecionado = resgate em qualquer dia.</p>
            </div>
            {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
            <Button type="submit" loading={saving}>
              Salvar programa
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Identidade visual</h2>
            <form onSubmit={saveBranding} className="space-y-4">
              <Field label="URL do logo" hint="Imagem quadrada (PNG/JPG/SVG) hospedada publicamente. O upload de arquivos chega na Fase 2.">
                <Input type="url" value={b.logoUrl ?? ''} onChange={(e) => setB({ ...b, logoUrl: e.target.value })} placeholder="https://..." />
              </Field>
              <Field label="Cor principal">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={validColor ? b.primaryColor : '#E85D04'}
                    onChange={(e) => setB({ ...b, primaryColor: e.target.value.toUpperCase() })}
                    className="h-11 w-14 cursor-pointer rounded-lg border border-stone-300"
                  />
                  <Input value={b.primaryColor} onChange={(e) => setB({ ...b, primaryColor: e.target.value })} maxLength={7} />
                </div>
              </Field>
              {bMsg && <Alert kind={bMsg.kind}>{bMsg.text}</Alert>}
              <Button type="submit" variant="secondary" disabled={!validColor}>
                Salvar identidade visual
              </Button>
            </form>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-stone-500">Pré-visualização no app do cliente</h2>
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3" style={{ background: validColor ? b.primaryColor : '#E85D04', color: fg }}>
                <TenantAvatar name={data.tenant.name} logoUrl={b.logoUrl} color="rgba(255,255,255,0.25)" size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{data.tenant.name}</p>
                  <p className="truncate text-xs opacity-85">{p.rewardDescription}</p>
                </div>
                <span className="text-2xl font-extrabold">
                  7<span className="text-base opacity-80">/{p.goal}</span>
                </span>
              </div>
              <div className="px-4 py-3">
                <ProgressBar value={7} max={p.goal} color={validColor ? b.primaryColor : '#E85D04'} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
