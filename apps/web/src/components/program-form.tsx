'use client';

import { FormEvent, useState } from 'react';
import { Alert, Button, Field, Input, cx } from './ui';
import { MoneyInput } from './money-input';
import { WEEKDAYS, formatMoney } from '@/lib/format';
import { tr } from '@/lib/region';
import { MAX_AMOUNT_PER_ENTRY_CENTS } from '@/lib/value';

/** Rótulo padrão da unidade do programa (sugestão; o gestor pode trocar). */
const DEFAULT_UNIT = tr('selo', 'carimbo');

export type ProgramKind = 'SELO' | 'VALOR';

export interface ProgramFields {
  name: string;
  /** SELO: o caixa lança selos. VALOR: o caixa informa o valor da compra e o app converte. */
  kind: ProgramKind;
  /** VALOR: quanto vale 1 selo, em centavos. */
  stampValueCents: number | null;
  /** VALOR: maior compra aceita num lançamento, em centavos (obrigatória, até R$ 10.000). */
  maxAmountPerEntryCents: number | null;
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
  kind: 'SELO',
  stampValueCents: null,
  maxAmountPerEntryCents: 100_000,
  unitLabel: DEFAULT_UNIT,
  unitLabelPlural: '',
  goal: 10,
  rewardDescription: '',
  maxPerEntry: 20,
  redeemWeekdays: [],
  carryOverExcess: true,
};

const KINDS: Array<{ value: ProgramKind; label: string; hint: string }> = tr(
  [
    { value: 'SELO', label: 'Por selo', hint: 'O atendente escolhe quantos selos o cliente ganha. Ex.: 1 por rodízio.' },
    { value: 'VALOR', label: 'Por valor gasto', hint: 'O atendente digita o valor da compra e o app converte em selos, guardando o troco.' },
  ],
  [
    { value: 'SELO', label: 'Por carimbo', hint: 'O operador escolhe quantos carimbos o cliente ganha. Ex.: 1 por café.' },
    { value: 'VALOR', label: 'Por valor gasto', hint: 'O operador introduz o valor da compra e a app converte em carimbos e guarda o que sobra.' },
  ],
);

/** "Ex.: compra de R$ 45,00 → 4 selos, e R$ 5,00 ficam guardados para a próxima." */
function valueExample(stampValueCents: number, one: string, many: string) {
  const purchase = Math.round(stampValueCents * 4.5);
  const stamps = Math.floor(purchase / stampValueCents);
  const left = purchase % stampValueCents;
  const units = stamps === 1 ? one : many || `${one}s`;
  return `Ex.: compra de ${formatMoney(purchase)} → ${stamps} ${units}, e ${formatMoney(left)} ficam guardados para a próxima compra.`;
}

/** Formulário de programa de fidelidade (criar e editar). */
export function ProgramForm({
  initial,
  submitLabel,
  onSubmit,
  extra,
  valueLocked = false,
}: {
  initial: ProgramFields;
  submitLabel: string;
  onSubmit: (p: ProgramFields) => Promise<void>;
  extra?: React.ReactNode;
  /** Programa com clientes: o tipo e o valor do selo não mudam mais. */
  valueLocked?: boolean;
}) {
  const [p, setP] = useState<ProgramFields>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const byValue = p.kind === 'VALOR';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (byValue && !p.stampValueCents) {
      setError(tr('Informe quanto a compra precisa somar para valer 1 selo.', 'Indique quanto a compra tem de somar para valer 1 carimbo.'));
      return;
    }
    if (byValue && !p.maxAmountPerEntryCents) {
      setError(tr('Informe a compra máxima por lançamento.', 'Indique a compra máxima por registo.'));
      return;
    }
    if (byValue && p.maxAmountPerEntryCents! > MAX_AMOUNT_PER_ENTRY_CENTS) {
      setError(
        tr(
          `A compra máxima por lançamento vai até ${formatMoney(MAX_AMOUNT_PER_ENTRY_CENTS)}.`,
          `A compra máxima por registo vai até ${formatMoney(MAX_AMOUNT_PER_ENTRY_CENTS)}.`,
        ),
      );
      return;
    }
    if (byValue && p.maxAmountPerEntryCents && p.stampValueCents && p.maxAmountPerEntryCents < p.stampValueCents) {
      setError(
        tr(
          'A compra máxima por lançamento não pode ser menor que o valor do selo.',
          'A compra máxima por registo não pode ser inferior ao valor do carimbo.',
        ),
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...p, unitLabelPlural: p.unitLabelPlural || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Algo deu errado.', 'Algo correu mal.'));
    } finally {
      setSaving(false);
    }
  }

  const toggleDay = (d: number) =>
    setP({ ...p, redeemWeekdays: p.redeemWeekdays.includes(d) ? p.redeemWeekdays.filter((x) => x !== d) : [...p.redeemWeekdays, d] });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nome do programa" hint={tr('Aparece no cartão do cliente. Ex.: "Cartão Rodízio".', 'Aparece no cartão do cliente. Ex.: "Cartão Café".')}>
        <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required minLength={2} maxLength={60} />
      </Field>
      <fieldset disabled={valueLocked}>
        <legend className="mb-1.5 text-sm font-medium text-stone-700">Como o cliente acumula</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => {
            const on = p.kind === k.value;
            return (
              <button
                type="button"
                key={k.value}
                aria-pressed={on}
                onClick={() => setP({ ...p, kind: k.value })}
                className={cx(
                  'rounded-xl border-2 p-3 text-left transition disabled:cursor-not-allowed',
                  on ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white hover:border-stone-300',
                  valueLocked && !on && 'opacity-50',
                )}
              >
                <span className={cx('block text-sm font-semibold', on ? 'text-brand-800' : 'text-stone-800')}>{k.label}</span>
                <span className="mt-0.5 block text-xs text-stone-500">{k.hint}</span>
              </button>
            );
          })}
        </div>
        {valueLocked && (
          <p className="mt-1.5 text-xs text-stone-500">
            Este programa já tem clientes: o tipo{byValue ? tr(' e o valor do selo', ' e o valor do carimbo') : ''} não podem mudar. Para outra regra, crie um programa novo.
          </p>
        )}
      </fieldset>

      {byValue && (
        <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cada compra de" hint={`vale 1 ${p.unitLabel || DEFAULT_UNIT}.`}>
              <MoneyInput cents={p.stampValueCents} onCents={(v) => setP({ ...p, stampValueCents: v })} disabled={valueLocked} required />
            </Field>
            <Field
              label={tr('Compra máxima por lançamento', 'Compra máxima por registo')}
              hint={tr(
                `Evita erro de digitação (ex.: 15000 no lugar de 150,00). Até ${formatMoney(MAX_AMOUNT_PER_ENTRY_CENTS)}.`,
                `Evita erros ao introduzir o valor (ex.: 15000 em vez de 150,00). Até ${formatMoney(MAX_AMOUNT_PER_ENTRY_CENTS)}.`,
              )}
            >
              <MoneyInput cents={p.maxAmountPerEntryCents} onCents={(v) => setP({ ...p, maxAmountPerEntryCents: v })} required />
            </Field>
          </div>
          {p.stampValueCents ? <p className="text-xs text-stone-600">{valueExample(p.stampValueCents, p.unitLabel || DEFAULT_UNIT, p.unitLabelPlural || '')}</p> : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Meta de ${p.unitLabelPlural || tr('selos', 'carimbos')}`} hint="De 2 a 50.">
          <Input type="number" min={2} max={50} value={p.goal} onChange={(e) => setP({ ...p, goal: Number(e.target.value) })} required />
        </Field>
        {byValue ? (
          p.stampValueCents ? (
            <div className="self-end pb-1 text-xs text-stone-500">
              Cartão completo a cada <strong className="text-stone-700">{formatMoney(p.stampValueCents * p.goal)}</strong> em compras.
            </div>
          ) : (
            <div />
          )
        ) : (
          <Field label={tr('Máximo por lançamento', 'Máximo por registo')} hint="Antifraude.">
            <Input type="number" min={1} max={100} value={p.maxPerEntry} onChange={(e) => setP({ ...p, maxPerEntry: Number(e.target.value) })} required />
          </Field>
        )}
      </div>
      <Field label="Recompensa" hint={tr('Ex.: "1 rodízio grátis".', 'Ex.: "1 café grátis".')}>
        <Input value={p.rewardDescription} onChange={(e) => setP({ ...p, rewardDescription: e.target.value })} required maxLength={120} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={tr('Nome do selo (singular)', 'Nome do carimbo (singular)')} hint={tr('Ex.: "rodízio".', 'Ex.: "café".')}>
          <Input value={p.unitLabel} onChange={(e) => setP({ ...p, unitLabel: e.target.value })} required maxLength={30} />
        </Field>
        <Field label="Plural (opcional)" hint={tr('Ex.: "rodízios".', 'Ex.: "cafés".')}>
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
              : tr(
                  `Ex.: meta ${p.goal}, cliente com ${p.goal - 1} recebe 3: ganha a recompensa e o cartão recomeça do zero (2 são descartados). O caixa avisa antes de lançar.`,
                  `Ex.: meta ${p.goal}, cliente com ${p.goal - 1} recebe 3: ganha a recompensa e o cartão recomeça do zero (2 são descartados). O caixa avisa antes de registar.`,
                )}
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
