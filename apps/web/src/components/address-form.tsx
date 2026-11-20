'use client';

import { useEffect, useRef, useState } from 'react';
import { AddressDraft, AddressFields, UFS, cepDigits, maskCep } from '@/lib/address';
import { ApiError, staffApi } from '@/lib/api';
import { Field, Input, Select, Spinner, cx } from './ui';

type Lookup = 'idle' | 'loading' | 'found' | 'not-found' | 'unavailable';

const CORREIOS_SEARCH = 'https://buscacepinter.correios.com.br/app/endereco/index.php';

/**
 * Endereço da unidade preenchido pelo CEP: ao completar os 8 dígitos busca rua, bairro, cidade e UF.
 * Cidade e UF vindas do CEP ficam travadas (é o que o guia usa para filtrar); se o CEP não for
 * encontrado, o gestor preenche à mão.
 */
export function AddressForm({
  value,
  onChange,
  legacy,
  lockedInitially = false,
}: {
  value: AddressDraft;
  onChange: (v: AddressDraft) => void;
  /** Endereço antigo em texto livre, mostrado até o gestor informar o CEP. */
  legacy?: string | null;
  /** O valor inicial já veio de um CEP (edição): cidade e UF começam travadas. */
  lockedInitially?: boolean;
}) {
  const [lookup, setLookup] = useState<Lookup>(lockedInitially ? 'found' : 'idle');
  const numberRef = useRef<HTMLInputElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);
  const lastCep = useRef(lockedInitially ? cepDigits(value.cep) : '');
  // O valor mais recente, para a resposta da busca não apagar o que foi digitado enquanto isso.
  const latest = useRef(value);
  latest.current = value;

  const digits = cepDigits(value.cep);
  const set = (patch: Partial<AddressDraft>) => onChange({ ...latest.current, ...patch });

  useEffect(() => {
    if (digits.length !== 8) {
      lastCep.current = '';
      setLookup('idle');
      return;
    }
    if (digits === lastCep.current) return;
    lastCep.current = digits;
    let cancelled = false;
    setLookup('loading');
    staffApi<Omit<AddressFields, 'number' | 'complement'>>(`/api/admin/cep/${digits}`)
      .then((r) => {
        if (cancelled) return;
        set({ street: r.street || latest.current.street, district: r.district || latest.current.district, city: r.city, state: r.state });
        setLookup('found');
        // CEP geral (cidade pequena) não traz a rua.
        setTimeout(() => (r.street ? numberRef : streetRef).current?.focus(), 0);
      })
      .catch((e) => {
        if (cancelled) return;
        setLookup(e instanceof ApiError && e.status === 404 ? 'not-found' : 'unavailable');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const locked = lookup === 'found';
  const showRest = digits.length === 8 || !!value.street || !!value.city;

  return (
    <div className="space-y-3">
      {legacy && !digits && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Endereço atual: <strong>{legacy}</strong>. Informe o CEP para atualizar e aparecer certinho na sua cidade.
        </p>
      )}
      <Field
        label="CEP"
        error={
          lookup === 'not-found'
            ? 'CEP não encontrado. Confira o número ou preencha o endereço abaixo.'
            : lookup === 'unavailable'
              ? 'Não conseguimos consultar o CEP agora. Preencha o endereço abaixo.'
              : null
        }
        hint={
          <a href={CORREIOS_SEARCH} target="_blank" rel="noreferrer" className="underline hover:text-stone-700">
            Não sabe o CEP? Consulte nos Correios
          </a>
        }
      >
        <div className="relative w-44">
          <Input
            value={value.cep}
            onChange={(e) => set({ cep: maskCep(e.target.value) })}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            maxLength={9}
          />
          {lookup === 'loading' && <Spinner className="absolute right-3 top-3.5 h-4 w-4 text-brand-600" />}
          {locked && <span className="absolute right-3 top-2.5 text-emerald-600" aria-label="CEP encontrado">✓</span>}
        </div>
      </Field>

      {showRest && (
        <>
          <Field label="Rua">
            <Input ref={streetRef} value={value.street} onChange={(e) => set({ street: e.target.value })} maxLength={200} autoComplete="address-line1" />
          </Field>
          <div className="grid grid-cols-[7rem_1fr] gap-3">
            <Field label="Número">
              <Input ref={numberRef} value={value.number} onChange={(e) => set({ number: e.target.value })} maxLength={20} placeholder="S/N" />
            </Field>
            <Field label="Complemento">
              <Input value={value.complement} onChange={(e) => set({ complement: e.target.value })} maxLength={80} placeholder="Sala, loja, bloco…" />
            </Field>
          </div>
          <Field label="Bairro">
            <Input value={value.district} onChange={(e) => set({ district: e.target.value })} maxLength={120} />
          </Field>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field label="Cidade" hint={locked ? 'Pelo CEP.' : undefined}>
              <Input
                value={value.city}
                onChange={(e) => set({ city: e.target.value })}
                maxLength={120}
                disabled={locked}
                className={cx(locked && 'bg-stone-50 text-stone-600')}
              />
            </Field>
            <Field label="UF">
              <Select value={value.state} onChange={(e) => set({ state: e.target.value })} disabled={locked} className={cx(locked && 'bg-stone-50 text-stone-600')}>
                <option value="">--</option>
                {UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      )}
    </div>
  );
}
