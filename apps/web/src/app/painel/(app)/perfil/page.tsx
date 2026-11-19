'use client';

import { QRCodeSVG } from 'qrcode.react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { usePanel } from '@/components/panel-context';
import { CardPreview } from '@/components/card-preview';
import { Alert, Button, Card, Field, FullPageSpinner, Input, TenantAvatar, cx } from '@/components/ui';
import { errorMessage, staffApi } from '@/lib/api';
import { BrandColors, CARD_STYLES, CardStyle, cardTheme, contrastRatio } from '@/lib/card-theme';
import { prepareLogo } from '@/lib/image';
import { useLoad } from '@/lib/use-load';

interface Profile {
  tenant: { name: string; slug: string; signupUrl: string };
  branding: BrandColors & { logoUrl: string | null; version: number };
  store: { id: string; name: string; address: string | null };
}

type Msg = { kind: 'success' | 'error'; text: string } | null;

export default function ProfilePage() {
  const { reload: reloadPanel } = usePanel();
  const { data, error, setData } = useLoad(() => staffApi<Profile>('/api/admin/profile'), []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <FullPageSpinner />;

  const update = (p: Profile) => {
    setData(p);
    reloadPanel();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Perfil</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <LogoCard profile={data} onSaved={update} />
          <StoreCard profile={data} onSaved={update} />
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
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useSecondary} onChange={(e) => setUseSecondary(e.target.checked)} className="h-4 w-4" />
            Usar uma cor secundária
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
            {CARD_STYLES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setStyle(o.value)}
                aria-pressed={style === o.value}
                className={cx(
                  'rounded-xl border-2 p-1.5 text-center transition',
                  style === o.value ? 'border-stone-900' : 'border-transparent hover:border-stone-300',
                )}
              >
                <CardPreview compact name={profile.tenant.name} logoUrl={null} brand={{ ...draft, cardStyle: o.value }} />
                <span className="mt-1.5 block text-xs font-semibold">{o.label}</span>
              </button>
            ))}
          </div>
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

// ───────────── Dados da unidade ─────────────

function StoreCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(profile.store.name);
  const [address, setAddress] = useState(profile.store.address ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await staffApi<Profile>('/api/admin/profile', { method: 'PUT', body: { storeName: name, address: address || null } }));
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
        <Field label="Estabelecimento" hint="Para trocar o nome do estabelecimento, fale com o suporte do Acumulae.">
          <Input value={profile.tenant.name} disabled />
        </Field>
        <Field label="Nome da unidade" hint="Aparece no app do cliente e no caixa.">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Endereço">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="Rua, número - Cidade/UF" />
        </Field>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <Button type="submit" loading={busy}>
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
