'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { AddressForm } from '@/components/address-form';
import { CardPreview } from '@/components/card-preview';
import { Alert, Badge, Button, Card, Field, FullPageSpinner, Input, Select, Switch, TenantAvatar, cx } from '@/components/ui';
import { AddressFields, addressPayload, draftOf, sameDraft } from '@/lib/address';
import { errorMessage, staffApi } from '@/lib/api';
import { BrandColors, CARD_STYLES, CardStyle, cardTheme, contrastRatio } from '@/lib/card-theme';
import { STAMP_ICONS, StampStyle, stampIconOf } from '@/lib/stamp-icons';
import { prepareLogo } from '@/lib/image';
import { useLoad } from '@/lib/use-load';

interface Segment {
  code: string;
  label: string;
  group: string;
}

interface Profile {
  tenant: { name: string; slug: string; segment: string | null; showInDirectory: boolean; signupUrl: string };
  segments: Segment[];
  branding: BrandColors & StampStyle & { logoUrl: string | null; version: number };
  stampOptions: { icons: string[]; allowedIcons: string[]; customImage: boolean; planName: string };
  store: { id: string; name: string; address: string | null; addressFields: AddressFields | null };
}

type Msg = { kind: 'success' | 'error'; text: string } | null;

type Tab = 'dados' | 'aparencia';
const TABS: Array<[Tab, string]> = [
  ['dados', 'Dados'],
  ['aparencia', 'Aparência do cartão'],
];

export default function ProfilePage() {
  const { reload: reloadPanel, plan } = usePanel();
  const { data, error, setData } = useLoad(() => staffApi<Profile>('/api/admin/profile'), []);
  const [tab, setTab] = useState<Tab>('dados');
  /** Cores e modelo escolhidos e ainda não salvos: a prévia mostra na hora. */
  const [draft, setDraft] = useState<BrandColors | null>(null);

  // A aba fica no endereço (?aba=aparencia) para dar para mandar o link direto.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('aba');
    if (t === 'aparencia' || t === 'dados') setTab(t);
  }, []);
  function choose(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('aba', t);
    window.history.replaceState(null, '', url);
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const multiStore = (plan?.limits.stores.used ?? 1) > 1;
  const update = (p: Profile) => {
    setData(p);
    reloadPanel();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Perfil</h1>
          <p className="text-stone-600">Como o {data.tenant.name} aparece para os clientes no app.</p>
        </div>
        <Link
          href="/painel/qr"
          className="inline-flex items-center gap-2 rounded-xl border border-secondary-300 bg-secondary-100 px-3 py-2 text-sm font-medium text-secondary-900 transition-colors hover:bg-secondary-300/50"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
          </svg>
          QR do balcão
        </Link>
      </div>

      <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1 text-sm font-medium" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => choose(key)}
            className={cx(
              'flex-1 rounded-lg px-3 py-2 transition-colors',
              tab === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dados' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AboutCard profile={data} onSaved={update} />
          {multiStore ? (
            <Card className="h-fit">
              <h2 className="mb-1 font-semibold">Dados das unidades</h2>
              <p className="text-sm text-stone-600">
                Com mais de uma unidade, nome e endereço de cada uma ficam na aba{' '}
                <Link href="/painel/unidades" className="font-medium text-accent-600 underline">
                  Unidades
                </Link>
                .
              </p>
            </Card>
          ) : (
            <StoreCard profile={data} onSaved={update} />
          )}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="space-y-6">
            <LogoCard profile={data} onSaved={update} onDraft={setDraft} />
            <StampCard profile={data} onSaved={update} />
          </div>
          {/* No celular a prévia vem antes dos controles, para ver a mudança sem rolar a tela. */}
          <div className="order-first lg:sticky lg:top-6 lg:order-none">
            <PreviewCard profile={data} draft={draft} />
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────── Logo e cor ─────────────

function LogoCard({ profile, onSaved, onDraft }: { profile: Profile; onSaved: (p: Profile) => void; onDraft: (d: BrandColors | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Cor secundária e modelos: Profissional e Rede. Enquanto carrega, não trava.
  const custom = usePanel().plan?.features.cardCustomization ?? true;
  const saved = profile.branding;
  const [color, setColor] = useState(saved.primaryColor);
  const [useSecondary, setUseSecondary] = useState(saved.secondaryColor !== null);
  const [secondary, setSecondary] = useState(saved.secondaryColor ?? saved.primaryColor);
  const [style, setStyle] = useState<CardStyle>(saved.cardStyle);
  const [busy, setBusy] = useState<'logo' | 'color' | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    setColor(saved.primaryColor);
    setUseSecondary(saved.secondaryColor !== null);
    setSecondary(saved.secondaryColor ?? saved.primaryColor);
    setStyle(saved.cardStyle);
  }, [saved.primaryColor, saved.secondaryColor, saved.cardStyle]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('logo');
    setMsg(null);
    try {
      const image = await prepareLogo(file);
      onSaved(await staffApi<Profile>('/api/admin/branding/logo', { method: 'PUT', body: { image } }));
      setMsg({ kind: 'success', text: 'Logo atualizado. Os cartões dos clientes já mostram a nova versão.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error && !('status' in err) ? err.message : errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    setBusy('logo');
    setMsg(null);
    try {
      onSaved(await staffApi<Profile>('/api/admin/branding/logo', { method: 'DELETE' }));
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function saveColor(e: FormEvent) {
    e.preventDefault();
    setBusy('color');
    setMsg(null);
    try {
      onSaved(await staffApi<Profile>('/api/admin/branding', { method: 'PUT', body: draft }));
      setMsg({ kind: 'success', text: 'Cores e modelo atualizados. Os cartões dos clientes já mostram a nova versão.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const isHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
  const valid = isHex(color) && (!useSecondary || isHex(secondary));
  const draft: BrandColors = {
    primaryColor: color.toUpperCase(),
    secondaryColor: useSecondary ? secondary.toUpperCase() : null,
    cardStyle: style,
  };
  const changed =
    draft.primaryColor !== saved.primaryColor.toUpperCase() ||
    draft.secondaryColor !== (saved.secondaryColor?.toUpperCase() ?? null) ||
    draft.cardStyle !== saved.cardStyle;
  // Avisa a prévia do que ainda não foi salvo (só cores válidas).
  useEffect(() => {
    onDraft(changed && valid ? draft : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, valid, draft.primaryColor, draft.secondaryColor, draft.cardStyle, onDraft]);
  useEffect(() => () => onDraft(null), [onDraft]);

  // Selos e barra ficam sobre fundo branco: avisa quando a cor deles quase some.
  const lowContrast = valid && contrastRatio(cardTheme(draft).accent, '#ffffff') < 3;

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Identidade visual</h2>
      <div className="flex items-center gap-4">
        <TenantAvatar name={profile.tenant.name} logoUrl={profile.branding.logoUrl} color={profile.branding.primaryColor} size={80} />
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={busy === 'logo'}>
            {profile.branding.logoUrl ? 'Trocar logo' : 'Enviar logo'}
          </Button>
          {profile.branding.logoUrl && (
            <Button size="sm" variant="ghost" className="block text-red-700" onClick={removeLogo} disabled={busy !== null}>
              Remover
            </Button>
          )}
          <p className="text-xs text-stone-500">PNG, JPG ou WebP. A imagem é reduzida para 256 × 256 px.</p>
        </div>
      </div>

      <form onSubmit={saveColor} className="mt-5 space-y-3">
        <ColorField label="Cor principal" value={color} onChange={setColor} />
        <div>
          <label className={cx('mb-2 flex items-center gap-2 text-sm', !custom && 'text-stone-400')}>
            <input
              type="checkbox"
              checked={useSecondary}
              disabled={!custom && !useSecondary}
              onChange={(e) => setUseSecondary(e.target.checked)}
              className="h-4 w-4"
            />
            Usar uma cor secundária {!custom && <PlanLock />}
          </label>
          {useSecondary ? (
            <ColorField label="Cor secundária" value={secondary} onChange={setSecondary} />
          ) : (
            <p className="text-xs text-stone-500">Sem secundária, a cor principal é usada no cartão inteiro.</p>
          )}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Modelo do cartão</legend>
          <div className="grid grid-cols-3 gap-2">
            {CARD_STYLES.map((o) => {
              const locked = !custom && o.value !== 'CLASSICO';
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStyle(o.value)}
                  aria-pressed={style === o.value}
                  disabled={locked}
                  title={locked ? 'Disponível a partir do plano Profissional' : undefined}
                  className={cx(
                    'rounded-xl border-2 p-1.5 text-center transition',
                    style === o.value ? 'border-stone-900' : 'border-transparent hover:border-stone-300',
                    locked && 'cursor-not-allowed opacity-50 hover:border-transparent',
                  )}
                >
                  <CardPreview compact name={profile.tenant.name} logoUrl={null} brand={{ ...draft, cardStyle: o.value }} />
                  <span className="mt-1.5 block text-xs font-semibold">
                    {o.label} {locked && <PlanLock />}
                  </span>
                </button>
              );
            })}
          </div>
          {!custom && (
            <p className="mt-2 text-xs text-stone-500">
              Cor secundária e os modelos Degradê e Moldura estão disponíveis a partir do plano Profissional.{' '}
              <Link href="/painel/plano" className="font-medium text-accent-600 underline">
                Ver meu plano
              </Link>
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">{CARD_STYLES.find((o) => o.value === style)?.hint}</p>
        </fieldset>

        {lowContrast && (
          <Alert kind="warning">Os selos e a barra de progresso ficam sobre fundo branco, e essa cor pode ficar difícil de enxergar. Prefira um tom mais escuro.</Alert>
        )}
        <Button type="submit" variant="secondary" loading={busy === 'color'} disabled={!valid || !changed}>
          Salvar cores e modelo
        </Button>
      </form>
      {msg && (
        <div className="mt-4">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}
    </Card>
  );
}

// ───────────── Selo ─────────────

function StampCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const { branding, stampOptions } = profile;
  const th = cardTheme(branding);
  const hasImage = branding.stampImageUrl !== null;
  const locked = stampOptions.icons.length - stampOptions.allowedIcons.length;

  async function run(key: string, call: () => Promise<Profile>, success: string) {
    setBusy(key);
    setMsg(null);
    try {
      onSaved(await call());
      setMsg({ kind: 'success', text: success });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error && !('status' in err) ? err.message : errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const chooseIcon = (icon: string) =>
    run(icon, () => staffApi<Profile>('/api/admin/branding', { method: 'PUT', body: { stampIcon: icon } }), 'Ícone do selo atualizado.');

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // Selo é pequeno na tela: 128 px e até ~64 KB.
    await run(
      'image',
      async () => staffApi<Profile>('/api/admin/branding/stamp-image', { method: 'PUT', body: { image: await prepareLogo(file, 128, 85_000) } }),
      'Imagem do selo atualizada.',
    );
  }

  const removeImage = () =>
    run('image', () => staffApi<Profile>('/api/admin/branding/stamp-image', { method: 'DELETE' }), 'Imagem removida. O selo voltou a usar o ícone.');

  return (
    <Card>
      <h2 className="mb-1 font-semibold">Selo</h2>
      <p className="mb-4 text-sm text-stone-600">
        É o que aparece em cada selo cheio do cartão. {hasImage ? 'Hoje o selo usa a sua imagem; remova para voltar ao ícone.' : ''}
      </p>

      <div className={cx('grid grid-cols-5 gap-2', hasImage && 'opacity-50')}>
        {stampOptions.icons.map((key) => {
          const Icon = stampIconOf(key);
          const allowed = stampOptions.allowedIcons.includes(key);
          const selected = !hasImage && branding.stampIcon === key;
          const label = STAMP_ICONS[key]?.label ?? key;
          return (
            <button
              key={key}
              type="button"
              title={allowed ? label : `${label}: disponível em planos acima do ${stampOptions.planName}`}
              aria-label={label}
              aria-pressed={selected}
              disabled={!allowed || busy !== null}
              onClick={() => chooseIcon(key)}
              className={cx(
                'relative grid h-14 place-items-center rounded-xl border-2 transition',
                selected ? 'border-stone-900' : 'border-stone-200 hover:border-stone-400',
                !allowed && 'cursor-not-allowed hover:border-stone-200',
              )}
            >
              <span
                className={cx('grid h-9 w-9 place-items-center rounded-full', !allowed && 'opacity-30 grayscale')}
                style={{ background: th.accent, color: th.accentFg }}
              >
                <Icon className="h-5 w-5" strokeWidth={key === 'check' ? 3 : 2.25} aria-hidden />
              </span>
              {!allowed && (
                <span className="absolute right-1 top-1 text-xs" aria-hidden>
                  🔒
                </span>
              )}
            </button>
          );
        })}
      </div>
      {locked > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          O plano {stampOptions.planName} libera {stampOptions.allowedIcons.length} ícones. Os outros {locked} e a imagem própria vêm nos planos acima.
        </p>
      )}

      <div className="mt-5 border-t border-stone-100 pt-4">
        <p className="mb-2 text-sm font-medium">Imagem própria</p>
        {stampOptions.customImage ? (
          <div className="flex items-center gap-3">
            {hasImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.stampImageUrl!} alt="Selo atual" className="h-12 w-12 rounded-full border-2 object-cover" style={{ borderColor: th.accent }} />
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={busy === 'image'}>
              {hasImage ? 'Trocar imagem' : 'Enviar imagem'}
            </Button>
            {hasImage && (
              <Button size="sm" variant="ghost" className="text-red-700" onClick={removeImage} disabled={busy !== null}>
                Remover
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-stone-500">🔒 Disponível em planos acima do {stampOptions.planName}. Fale com o suporte do Acumulaê para mudar de plano.</p>
        )}
        {stampOptions.customImage && <p className="mt-2 text-xs text-stone-500">PNG, JPG ou WebP. A imagem é recortada num quadrado de 128 px; fica melhor com o desenho centralizado.</p>}
      </div>
      {msg && (
        <div className="mt-4">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}
    </Card>
  );
}

// ───────────── Sobre o estabelecimento ─────────────

function AboutCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [segment, setSegment] = useState(profile.tenant.segment ?? '');
  const [listed, setListed] = useState(profile.tenant.showInDirectory);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = segment !== (profile.tenant.segment ?? '') || listed !== profile.tenant.showInDirectory;

  const groups = profile.segments.reduce<Record<string, Segment[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await staffApi<Profile>('/api/admin/profile', { method: 'PUT', body: { segment: segment || null, showInDirectory: listed } }));
      setMsg({ kind: 'success', text: 'Alterações salvas.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Sobre o estabelecimento</h2>
      <form onSubmit={save} className="space-y-4">
        <Field label="Nome" hint="Para trocar o nome do estabelecimento, fale com o suporte do Acumulaê.">
          <Input value={profile.tenant.name} disabled />
        </Field>
        <Field label="Segmento" hint="Usado para os clientes encontrarem você no guia do app, por segmento e cidade.">
          <Select value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="">Selecione…</option>
            {Object.entries(groups).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="flex items-start justify-between gap-4 rounded-xl border border-stone-200 p-3">
          <div>
            <p className="text-sm font-medium text-stone-800">Aparecer no guia do app</p>
            <p className="text-xs text-stone-500">
              Clientes do Acumulaê encontram seu estabelecimento por cidade e segmento. Em breve no app.
            </p>
          </div>
          <Switch checked={listed} onChange={setListed} label="Aparecer no guia do app" />
        </div>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Button type="submit" loading={busy} disabled={!dirty}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}

// ───────────── Dados da unidade ─────────────

function StoreCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const initial = draftOf(profile.store.addressFields);
  const [name, setName] = useState(profile.store.name);
  const [address, setAddress] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = name.trim() !== profile.store.name || !sameDraft(address, initial);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const parsed = addressPayload(address);
    if (!parsed.ok) return setMsg({ kind: 'error', text: parsed.error });
    setBusy(true);
    try {
      // Endereço antigo em texto livre continua até o gestor informar o CEP.
      const keepLegacy = !parsed.value && !profile.store.addressFields && profile.store.address;
      const body = { storeName: name, ...(keepLegacy ? {} : { address: parsed.value }) };
      const p = await staffApi<Profile>('/api/admin/profile', { method: 'PUT', body });
      setAddress(draftOf(p.store.addressFields));
      onSaved(p);
      setMsg({ kind: 'success', text: 'Dados da unidade salvos.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Dados da unidade</h2>
      <form onSubmit={save} className="space-y-4">
        <Field label="Nome da unidade" hint="Aparece no app do cliente e no caixa.">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <AddressForm
          value={address}
          onChange={setAddress}
          legacy={profile.store.addressFields ? null : profile.store.address}
          lockedInitially={!!profile.store.addressFields}
        />
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Button type="submit" loading={busy} disabled={!dirty}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}

// ───────────── Pré-visualização ─────────────

function PreviewCard({ profile, draft }: { profile: Profile; draft: BrandColors | null }) {
  const brand = { ...profile.branding, ...(draft ?? {}) };
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-500">Como o cartão aparece no app do cliente</h2>
        {draft && <Badge color="amber">Prévia, não salvo</Badge>}
      </div>
      <CardPreview name={profile.tenant.name} subtitle={profile.store.name} logoUrl={profile.branding.logoUrl} brand={brand} />
      <p className="mt-3 text-xs text-stone-500">
        {draft ? 'Clique em "Salvar cores e modelo" para os clientes verem assim.' : 'Exemplo com 7 de 10 selos. Logo, cores, modelo e selo aparecem como os clientes veem.'}
      </p>
    </Card>
  );
}

function PlanLock() {
  return (
    <span aria-label="bloqueado no seu plano" className="text-xs">
      🔒
    </span>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#F26419'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-stone-300"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </div>
    </Field>
  );
}
