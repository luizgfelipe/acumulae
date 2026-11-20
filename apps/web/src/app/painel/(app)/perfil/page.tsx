'use client';

import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { AddressForm } from '@/components/address-form';
import { CardPreview } from '@/components/card-preview';
import { Alert, Button, Card, Field, FullPageSpinner, Input, Select, TenantAvatar, cx } from '@/components/ui';
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
  tenant: { name: string; slug: string; segment: string | null; signupUrl: string };
  segments: Segment[];
  branding: BrandColors & StampStyle & { logoUrl: string | null; version: number };
  stampOptions: { icons: string[]; allowedIcons: string[]; customImage: boolean; planName: string };
  store: { id: string; name: string; address: string | null; addressFields: AddressFields | null };
}

type Msg = { kind: 'success' | 'error'; text: string } | null;

export default function ProfilePage() {
  const { reload: reloadPanel, plan } = usePanel();
  const { data, error, setData } = useLoad(() => staffApi<Profile>('/api/admin/profile'), []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const multiStore = (plan?.limits.stores.used ?? 1) > 1;
  const update = (p: Profile) => {
    setData(p);
    reloadPanel();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <AboutCard profile={data} onSaved={update} />
          <LogoCard profile={data} onSaved={update} />
          <StampCard profile={data} onSaved={update} />
          {multiStore ? (
            <Card>
              <h2 className="mb-1 font-semibold">Dados das unidades</h2>
              <p className="text-sm text-stone-600">
                Com mais de uma unidade, nome e endereço de cada uma ficam na aba{' '}
                <Link href="/painel/unidades" className="font-medium text-brand-700 underline">
                  Unidades
                </Link>
                .
              </p>
            </Card>
          ) : (
            <StoreCard profile={data} onSaved={update} />
          )}
        </div>
        <div className="space-y-6">
          <PreviewCard profile={data} />
          <CounterQrCard profile={data} />
        </div>
      </div>
    </div>
  );
}

// ───────────── Logo e cor ─────────────

function LogoCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
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
              <Link href="/painel/plano" className="font-medium text-brand-700 underline">
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = segment !== (profile.tenant.segment ?? '');

  const groups = profile.segments.reduce<Record<string, Segment[]>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await staffApi<Profile>('/api/admin/profile', { method: 'PUT', body: { segment: segment || null } }));
      setMsg({ kind: 'success', text: 'Segmento salvo.' });
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
        <Field label="Segmento" hint="Em breve, os clientes vão poder encontrar estabelecimentos por segmento e cidade no app.">
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

// ───────────── Pré-visualização e QR do balcão ─────────────

function PreviewCard({ profile }: { profile: Profile }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-stone-500">Como o cartão aparece no app do cliente</h2>
      <CardPreview name={profile.tenant.name} subtitle={profile.store.name} logoUrl={profile.branding.logoUrl} brand={profile.branding} />
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
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#E85D04'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-stone-300"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} />
      </div>
    </Field>
  );
}

function CounterQrCard({ profile }: { profile: Profile }) {
  const [copied, setCopied] = useState(false);
  const url = profile.tenant.signupUrl;

  function print() {
    const el = document.getElementById('counter-qr');
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!el || !w) return;
    w.document.write(
      `<!doctype html><html><head><title>QR do balcão</title><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;padding:40px;text-align:center}p{margin:6px 0}svg{width:320px;height:320px;margin:24px auto}</style></head><body><div>${el.innerHTML}</div><script>window.onload=()=>{window.print()}</script></body></html>`,
    );
    w.document.close();
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">QR do balcão</h2>
      <p className="mb-4 text-sm text-stone-600">Imprima e deixe no caixa: o cliente aponta a câmera, cria a conta e entra no programa.</p>
      <div id="counter-qr" className="rounded-2xl border border-stone-200 p-5 text-center">
        <p className="text-lg font-bold">{profile.tenant.name}</p>
        <p className="mb-3 text-sm text-stone-600">Participe do nosso programa de fidelidade</p>
        <div className="mx-auto w-fit">
          <QRCodeSVG value={url} size={180} level="M" marginSize={0} />
        </div>
        <p className="mt-3 text-sm font-medium">Aponte a câmera do celular</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Copiado!' : 'Copiar link'}
        </Button>
        <Button onClick={print}>Imprimir</Button>
      </div>
    </Card>
  );
}
