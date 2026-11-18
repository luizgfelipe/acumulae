'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, Field, FullPageSpinner, Input, cx } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { WEEKDAYS } from '@/lib/format';
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
}

export default function ProgramPage() {
  const { data, error, setData } = useLoad(() => staffApi<ProgramData>('/api/admin/program'), []);
  const [p, setP] = useState<ProgramData['program'] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setP(data.program);
  }, [data]);

  if (error) return <Alert>{error}</Alert>;
  if (!data || !p) return <FullPageSpinner />;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      setData(await staffApi<ProgramData>('/api/admin/program', { method: 'PUT', body: { ...p, unitLabelPlural: p!.unitLabelPlural || null } }));
      setMsg({ kind: 'success', text: 'Programa atualizado. Recompensas já liberadas não mudam.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const toggleDay = (d: number) =>
    setP({ ...p, redeemWeekdays: p.redeemWeekdays.includes(d) ? p.redeemWeekdays.filter((x) => x !== d) : [...p.redeemWeekdays, d] });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Programa de fidelidade</h1>
      <Card className="max-w-2xl">
        <form onSubmit={save} className="space-y-4">
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
      <p className="text-sm text-stone-500">Logo, cor e dados da unidade ficam em Perfil.</p>
    </div>
  );
}
