'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { QrScanner } from '@/components/qr-scanner';
import { ProgressBar } from '@/components/stamps';
import { Alert, Badge, Button, FullPageSpinner, Input, Modal, Spinner, TenantAvatar, cx } from '@/components/ui';
import { ApiError, errorMessage, newIdempotencyKey, staffApi } from '@/lib/api';
import { formatTime, maskPhoneInput, plural } from '@/lib/format';
import { staffLogout, useStaff } from '@/lib/staff';

interface CustomerView {
  customerRef: string;
  source: 'QR_PESSOAL' | 'TELEFONE';
  name: string;
  firstVisit: boolean;
  card: { balance: number; goal: number; rewardsAvailable: number; unitLabel: string; unitLabelPlural: string; rewardDescription: string };
  rewards: { id: string; description: string; unlockedAt: string }[];
  maxPerEntry: number;
  redeem: { allowed: boolean; reason: string | null };
}

interface Recent {
  id: string;
  type: 'CREDITO' | 'RESGATE';
  quantity: number;
  source: string;
  createdAt: string;
  customerName: string;
  staffName: string | null;
  reversed: boolean;
}

type Mode = { kind: 'home' } | { kind: 'scan' } | { kind: 'phone' } | { kind: 'customer'; view: CustomerView } | { kind: 'checkout' };

interface Flash {
  kind: 'success' | 'error';
  title: string;
  detail?: string;
}

export default function PosPage() {
  const router = useRouter();
  const { me } = useStaff('caixa', { needStore: true });
  const [mode, setMode] = useState<Mode>({ kind: 'home' });
  const [flash, setFlash] = useState<Flash | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);

  const loadRecent = useCallback(() => {
    staffApi<Recent[]>('/api/pos/recent').then(setRecent).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (me?.context?.storeId) loadRecent();
  }, [me, loadRecent]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.kind === 'success' ? 4000 : 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const done = useCallback(
    (f: Flash) => {
      setFlash(f);
      setMode({ kind: 'home' });
      loadRecent();
    },
    [loadRecent],
  );

  if (!me?.context?.storeId) return <FullPageSpinner />;
  const ctx = me.context;
  const suspended = ctx.tenantStatus !== 'ACTIVE';

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-stone-50">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
        <TenantAvatar name={ctx.tenantName} logoUrl={ctx.logoUrl} color={ctx.primaryColor} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{ctx.tenantName}</p>
          <p className="truncate text-xs text-stone-500">
            {ctx.storeName} · {me.user.name.split(' ')[0]}
          </p>
        </div>
        {ctx.role === 'MANAGER' && (
          <Link href="/painel" className="rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            Painel
          </Link>
        )}
        <Link href="/caixa/unidade" className="rounded-lg px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100">
          Unidade
        </Link>
        <button
          onClick={async () => {
            await staffLogout();
            router.replace('/caixa/entrar');
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          Sair
        </button>
      </header>

      <main className="flex-1 space-y-4 p-4">
        {suspended && <Alert>Este estabelecimento está suspenso. Lançamentos e resgates estão bloqueados. Fale com o suporte do Acumulae.</Alert>}
        {flash && (
          <div
            className={cx(
              'rounded-2xl px-5 py-4 text-white shadow-lg',
              flash.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600',
            )}
            role="status"
          >
            <p className="text-lg font-bold">{flash.title}</p>
            {flash.detail && <p className="text-sm opacity-90">{flash.detail}</p>}
          </div>
        )}

        {mode.kind === 'home' && (
          <>
            <div className="grid gap-3">
              <Button size="xl" onClick={() => setMode({ kind: 'scan' })} disabled={suspended}>
                <QrIcon /> Ler cliente
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" variant="secondary" className="h-16" onClick={() => setMode({ kind: 'phone' })} disabled={suspended}>
                  Buscar por telefone
                </Button>
                <Button size="lg" variant="dark" className="h-16" onClick={() => setMode({ kind: 'checkout' })} disabled={suspended}>
                  Gerar QR
                </Button>
              </div>
              <p className="text-center text-xs text-stone-500">Mesa com várias pessoas? Cada um registra no próprio cadastro.</p>
            </div>
            <RecentList items={recent} />
          </>
        )}

        {mode.kind === 'scan' && <ScanStep onBack={() => setMode({ kind: 'home' })} onFound={(view) => setMode({ kind: 'customer', view })} />}
        {mode.kind === 'phone' && <PhoneStep onBack={() => setMode({ kind: 'home' })} onFound={(view) => setMode({ kind: 'customer', view })} onCheckout={() => setMode({ kind: 'checkout' })} />}
        {mode.kind === 'customer' && <CustomerStep view={mode.view} onBack={() => setMode({ kind: 'home' })} onDone={done} />}
        {mode.kind === 'checkout' && <CheckoutStep onBack={() => setMode({ kind: 'home' })} onDone={done} />}
      </main>
    </div>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2zM18 14h2v2h-2z" />
    </svg>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="rounded-lg px-2 py-1 text-2xl leading-none text-stone-600 hover:bg-stone-200" aria-label="Voltar">
        ←
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

// ───────────── Fluxo A: ler QR pessoal ─────────────

function ScanStep({ onBack, onFound }: { onBack: () => void; onFound: (v: CustomerView) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [attempt, setAttempt] = useState(0);

  async function resolve(qr: string) {
    setBusy(true);
    setError(null);
    try {
      onFound(await staffApi<CustomerView>('/api/pos/customers/resolve-qr', { method: 'POST', body: { qr: qr.trim() } }));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setAttempt((a) => a + 1); // reinicia o leitor
    }
  }

  return (
    <div className="space-y-4">
      <StepHeader title="Ler QR do cliente" onBack={onBack} />
      <p className="text-sm text-stone-600">Peça para o cliente abrir o app e tocar em “Meu QR”.</p>
      {busy ? (
        <div className="grid aspect-square w-full max-w-sm place-items-center rounded-2xl bg-stone-200 text-brand-600">
          <Spinner className="h-10 w-10" />
        </div>
      ) : (
        <QrScanner key={attempt} onResult={resolve} />
      )}
      {error && <Alert>{error}</Alert>}
      <details className="text-sm text-stone-600">
        <summary className="cursor-pointer">Digitar/colar o código manualmente</summary>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual) resolve(manual);
          }}
        >
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="AC1...." />
          <Button type="submit" variant="secondary">
            OK
          </Button>
        </form>
      </details>
    </div>
  );
}

// ───────────── Fluxo A': telefone ─────────────

function PhoneStep({ onBack, onFound, onCheckout }: { onBack: () => void; onFound: (v: CustomerView) => void; onCheckout: () => void }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<{ msg: string; notFound: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onFound(await staffApi<CustomerView>('/api/pos/customers', { query: { phone } }));
    } catch (err) {
      setError({ msg: errorMessage(err), notFound: err instanceof ApiError && err.code === 'CUSTOMER_NOT_FOUND' });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <StepHeader title="Buscar por telefone" onBack={onBack} />
      <form onSubmit={search} className="space-y-3">
        <Input
          autoFocus
          value={phone}
          onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
          inputMode="tel"
          placeholder="(47) 9 9999-9999"
          className="h-14 text-xl"
        />
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={phone.replace(/\D/g, '').length < 10}>
          Buscar
        </Button>
      </form>
      {error && (
        <Alert kind={error.notFound ? 'warning' : 'error'}>
          {error.msg}
          {error.notFound && (
            <Button size="sm" variant="dark" className="mt-3 w-full" onClick={onCheckout}>
              Gerar QR temporário
            </Button>
          )}
        </Alert>
      )}
    </div>
  );
}

// ───────────── Cliente identificado: lançar / resgatar ─────────────

function CustomerStep({ view, onBack, onDone }: { view: CustomerView; onBack: () => void; onDone: (f: Flash) => void }) {
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRedeem, setConfirmRedeem] = useState(false);
  const creditKey = useRef(newIdempotencyKey());
  const redeemKey = useRef(newIdempotencyKey());
  const c = view.card;

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      const r = await staffApi<{ rewardsUnlocked: number; card: CustomerView['card'] }>('/api/pos/credits', {
        method: 'POST',
        headers: { 'Idempotency-Key': creditKey.current },
        body: { customerRef: view.customerRef, quantity: qty },
      });
      onDone({
        kind: 'success',
        title: `+${plural(qty, c.unitLabel, c.unitLabelPlural)} para ${view.name}`,
        detail:
          r.rewardsUnlocked > 0
            ? `🎉 Recompensa liberada: ${c.rewardDescription}! Agora: ${r.card.balance}/${r.card.goal}`
            : `Agora: ${r.card.balance}/${r.card.goal}`,
      });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const r = await staffApi<{ reward: { description: string } }>('/api/pos/redemptions', {
        method: 'POST',
        headers: { 'Idempotency-Key': redeemKey.current },
        body: { customerRef: view.customerRef, rewardId: view.rewards[0]?.id },
      });
      onDone({ kind: 'success', title: 'Recompensa resgatada', detail: `${r.reward.description} para ${view.name}` });
    } catch (e) {
      setConfirmRedeem(false);
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <StepHeader title="Cliente" onBack={onBack} />
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold">{view.name}</p>
            <p className="text-sm text-stone-500">{view.source === 'TELEFONE' ? 'Encontrado pelo telefone: confirme o nome com o cliente.' : 'QR pessoal lido'}</p>
          </div>
          {view.firstVisit && <Badge color="brand">Primeira visita</Badge>}
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-stone-600">Progresso</span>
            <span className="text-xl font-bold tabular-nums">
              {c.balance}/{c.goal}
            </span>
          </div>
          <ProgressBar value={c.balance} max={c.goal} color="#E85D04" />
        </div>
        {c.rewardsAvailable > 0 && (
          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
            <p className="font-semibold">
              {c.rewardsAvailable === 1 ? '1 recompensa disponível' : `${c.rewardsAvailable} recompensas disponíveis`}: {c.rewardDescription}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-stone-700">Quantos {c.unitLabelPlural}?</p>
        <div className="flex items-center justify-center gap-4">
          <Button variant="secondary" size="lg" className="w-16 text-2xl" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
            −
          </Button>
          <span className="w-16 text-center text-5xl font-extrabold tabular-nums">{qty}</span>
          <Button variant="secondary" size="lg" className="w-16 text-2xl" onClick={() => setQty((q) => Math.min(view.maxPerEntry, q + 1))} disabled={qty >= view.maxPerEntry}>
            +
          </Button>
        </div>
        <Button size="xl" className="mt-4 w-full" loading={busy && !confirmRedeem} onClick={launch}>
          Lançar {plural(qty, c.unitLabel, c.unitLabelPlural)}
        </Button>
      </div>

      {c.rewardsAvailable > 0 &&
        (view.redeem.allowed ? (
          <Button size="lg" variant="dark" className="w-full" onClick={() => setConfirmRedeem(true)}>
            Resgatar recompensa
          </Button>
        ) : (
          <Alert kind="warning">{view.redeem.reason}</Alert>
        ))}

      {error && <Alert>{error}</Alert>}

      <Modal open={confirmRedeem} onClose={() => setConfirmRedeem(false)} title="Confirmar resgate">
        <div className="space-y-2 text-stone-700">
          <p>
            Cliente: <strong>{view.name}</strong>
          </p>
          <p>
            Recompensa: <strong>{view.rewards[0]?.description ?? c.rewardDescription}</strong>
          </p>
          <p className="text-sm text-stone-500">Entregue a recompensa ao cliente após confirmar.</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmRedeem(false)}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={redeem} loading={busy}>
            Resgatar
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ───────────── Fluxo B: QR temporário ─────────────

interface CheckoutToken {
  id: string;
  url: string;
  quantity: number;
  expiresAt: string;
}

function CheckoutStep({ onBack, onDone }: { onBack: () => void; onDone: (f: Flash) => void }) {
  const [qty, setQty] = useState(1);
  const [token, setToken] = useState<CheckoutToken | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setToken(await staffApi<CheckoutToken>('/api/pos/checkout-tokens', { method: 'POST', body: { quantity: qty } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // RN-45: acompanha o token até ser usado.
  useEffect(() => {
    if (!token) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const s = await staffApi<{ status: string; customerName: string | null }>(`/api/pos/checkout-tokens/${token.id}`);
        if (s.status === 'USED') {
          onDone({ kind: 'success', title: `Creditado para ${s.customerName}`, detail: `+${token.quantity} via QR temporário` });
          return;
        }
        if (s.status === 'EXPIRED') {
          setToken(null);
          setError('O QR expirou. Gere um novo se precisar.');
          return;
        }
      } catch {
        /* tenta de novo */
      }
      if (!stop) setTimeout(tick, 1500);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [token, onDone]);

  useEffect(() => {
    if (!token) return;
    const update = () => setLeft(Math.max(0, Math.round((new Date(token.expiresAt).getTime() - Date.now()) / 1000)));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [token]);

  async function cancel() {
    if (token) await staffApi(`/api/pos/checkout-tokens/${token.id}`, { method: 'DELETE' }).catch(() => undefined);
    onBack();
  }

  if (token) {
    const mm = String(Math.floor(left / 60)).padStart(1, '0');
    const ss = String(left % 60).padStart(2, '0');
    return (
      <div className="space-y-4 text-center">
        <StepHeader title={`QR temporário · ${token.quantity}`} onBack={cancel} />
        <p className="text-stone-600">Peça para o cliente apontar a câmera do celular.</p>
        <div className="mx-auto w-fit rounded-3xl border-4 border-stone-900 bg-white p-4">
          <QRCodeSVG value={token.url} size={280} level="M" marginSize={0} />
        </div>
        <p className="flex items-center justify-center gap-2 text-stone-600">
          <Spinner className="h-4 w-4" /> Aguardando o cliente… expira em {mm}:{ss}
        </p>
        <Button variant="secondary" onClick={cancel} className="w-full">
          Cancelar QR
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StepHeader title="Gerar QR temporário" onBack={onBack} />
      <p className="text-sm text-stone-600">O cliente escaneia com a câmera do celular. Se ainda não tiver conta, ele se cadastra na hora e recebe o crédito.</p>
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-stone-700">Quantidade</p>
        <div className="flex items-center justify-center gap-4">
          <Button variant="secondary" size="lg" className="w-16 text-2xl" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
            −
          </Button>
          <span className="w-16 text-center text-5xl font-extrabold tabular-nums">{qty}</span>
          <Button variant="secondary" size="lg" className="w-16 text-2xl" onClick={() => setQty((q) => Math.min(100, q + 1))}>
            +
          </Button>
        </div>
        <Button size="xl" variant="dark" className="mt-4 w-full" onClick={generate} loading={busy}>
          Gerar QR
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function RecentList({ items }: { items: Recent[] }) {
  if (!items.length) return null;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <h3 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-700">Últimos lançamentos desta unidade</h3>
      <ul className="divide-y divide-stone-100">
        {items.map((r) => (
          <li key={r.id} className={cx('flex items-center justify-between px-4 py-2.5 text-sm', r.reversed && 'opacity-50 line-through')}>
            <span>
              <span className="font-medium">{r.customerName}</span>
              <span className="text-stone-500"> · {formatTime(r.createdAt)}{r.staffName ? ` · ${r.staffName.split(' ')[0]}` : ''}</span>
            </span>
            {r.type === 'RESGATE' ? <Badge color="green">Resgate</Badge> : <span className="font-semibold text-emerald-700">+{r.quantity}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
