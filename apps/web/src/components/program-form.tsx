'use client';

import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, cx } from './ui';
import { WEEKDAYS } from '@/lib/format';

export interface ProgramFields {
  name: string;
  unitLabel: string;
  unitLabelPlural: string | null;
  goal: number;
  rewardDescription: string;
  maxPerEntry: number;
  redeemWeekdays: number[];
  carryOverExcess: boolean;
}

export const EMPTY_PROGRAM: ProgramFields = {
  name: '',
  unitLabel: 'selo',
  unitLabelPlural: '',
  goal: 10,
  rewardDescription: '',
  maxPerEntry: 20,
  redeemWeekdays: [],
  carryOverExcess: true,
};

/** Formulário de programa de fidelidade (criar e editar). */
export function ProgramForm({
  initial,
  submitLabel,
  onSubmit,
  extra,
}: {
  initial: ProgramFields;
  submitLabel: string;
  onSubmit: (p: ProgramFields) => Promise<void>;
  extra?: React.ReactNode;
}) {
  const [p, setP] = useState<ProgramFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...p, unitLabelPlural: p.unitLabelPlural || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo deu errado.');
    } finally {
      setSaving(false);
    }
  }

  const toggleDay = (d: number) =>
    setP({ ...p, redeemWeekdays: p.redeemWeekdays.includes(d) ? p.redeemWeekdays.filter((x) => x !== d) : [...p.redeemWeekdays, d] });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome do programa" hint='Aparece no cartão do cliente. Ex.: "Cartão Rodízio".'>
        <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required minLength={2} maxLength={60} />
      </Field>
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

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-brand-600"
          checked={p.carryOverExcess}
          onChange={(e) => setP({ ...p, carryOverExcess: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-medium text-stone-800">Guardar o excedente para o próximo cartão</span>
          <span className="block text-xs text-stone-500">
            {p.carryOverExcess
              ? `Ex.: meta ${p.goal}, cliente com ${p.goal - 1} recebe 3: ganha a recompensa e o cartão já começa com 2.`
              : `Ex.: meta ${p.goal}, cliente com ${p.goal - 1} recebe 3: ganha a recompensa e o cartão recomeça do zero (2 são descartados). O caixa avisa antes de lançar.`}
          </span>
        </span>
      </label>

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

      {extra}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={saving}>
        {submitLabel}
      </Button>
    </form>
  );
}
