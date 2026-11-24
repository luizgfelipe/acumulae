'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { QrScanner } from '@/components/qr-scanner';
import { ProgressBar } from '@/components/stamps';
import { Alert, Badge, Button, FullPageSpinner, Input, Modal, Spinner, TenantAvatar, cx } from '@/components/ui';
import { ApiError, errorMessage, newIdempotencyKey, staffApi } from '@/lib/api';
import { cardDisplay } from '@/lib/card-display';
import { formatTime, maskPhoneInput, plural } from '@/lib/format';
import { staffLogout, useStaff } from '@/lib/staff';

interface ProgramView {
  programId: string;
  programName: string;
  programActive: boolean;
  carryOverExcess: boolean;
  balance: number;
  goal: number;
  rewardsAvailable: number;
  unitLabel: string;
  unitLabelPlural: string;
  rewardDescription: string;
  maxPerEntry: number;
  rewards: { id: string; description: string; unlockedAt: string }[];
  redeem: { allowed: boolean; reason: string | null };
}

interface CustomerView {
  customerRef: string;
  source: 'QR_PESSOAL' | 'TELEFONE';
  name: string;
  firstVisit: boolean;
  /** Um item por programa ativo (e programas encerrados com recompensa a usar). */
  programs: ProgramView[];
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
          <Link href="/painel" className="rounded-lg px-2 py-1.5 text-sm font-semibold text-accent-600 hover:bg-accent-100 transition-colors">
            Painel
          </Link>
        )}
        <Link href="/caixa/unidade" className="rounded-lg px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100 transition-colors">
          Unidade
        </Link>
        <button
          onClick={async () => {
            await staffLogout();
            router.replace('/caixa/entrar');
          }}
          className="rounded-lg px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-100 transition-colors"
        >
          Sair
        </button>
      </header>

      <main className="flex-1 space-y-4 p-4">
        {suspended && <Alert>Este estabelecimento está suspenso. Lançamentos e resgates estão bloqueados. Fale com o suporte do Acumulaê.</Alert>}
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
      <button onClick={onBack} className="rounded-lg px-2 py-1 text-2xl leading-none text-stone-600 hover:bg-stone-200 transition-colors" aria-label="Voltar">
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

/** Seletor de programa (só aparece quando há mais de um). */
function ProgramPicker({
  programs,
  value,
  onChange,
}: {
  programs: { programId: string; programName: string; programActive: boolean; rewardsAvailable?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (programs.length <= 1) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-stone-700">Programa</p>
      <div className="flex flex-wrap gap-2">
        {programs.map((p) => (
          <button
            key={p.programId}
            type="button"
            onClick={() => onChange(p.programId)}
            className={cx(
              'rounded-xl border px-3 py-2 text-sm font-semibold',
              value === p.programId ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-300 bg-white text-stone-700',
            )}
          >
            {p.programName}
            {!p.programActive && ' (encerrado)'}
            {!!p.rewardsAvailable && <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 text-xs text-white">{p.rewardsAvailable}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Quantos selos seriam descartados num programa que não guarda o excedente. */
function discardPreview(p: ProgramView, qty: number) {
  if (p.carryOverExcess) return 0;
  const total = p.balance + qty;
  return total >= p.goal ? total % p.goal : 0;
}

function CustomerStep({ view, onBack, onDone }: { view: CustomerView; onBack: () => void; onDone: (f: Flash) => void }) {
  const initial = view.programs.find((p) => p.programActive) ?? view.programs[0];
  const [programId, setProgramId] = useState(initial?.programId ?? '');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRedeem, setConfirmRedeem] = useState(false);
  /** Lançar selo com recompensa disponível pede confirmação: o mais comum é o cliente querer usar a recompensa. */
  const [confirmCredit, setConfirmCredit] = useState(false);
  const [redeemQty, setRedeemQty] = useState(1);
  const creditKey = useRef(newIdempotencyKey());
  const redeemKey = useRef(newIdempotencyKey());
  const c = view.programs.find((p) => p.programId === programId) ?? initial;

  if (!c) {
    return (
      <div className="space-y-4">
        <StepHeader title="Cliente" onBack={onBack} />
        <Alert kind="warning">Este estabelecimento não tem programa ativo. Ative um programa no painel.</Alert>
      </div>
    );
  }

  const discard = discardPreview(c, qty);
  const canRedeem = c.rewardsAvailable > 0 && c.redeem.allowed;
  const { complete, shown } = cardDisplay(c);

  function openRedeem() {
    setConfirmCredit(false);
    setRedeemQty(1);
    redeemKey.current = newIdempotencyKey();
    setConfirmRedeem(true);
  }

  function selectProgram(id: string) {
    setProgramId(id);
    setQty(1);
    setError(null);
    creditKey.current = newIdempotencyKey();
  }

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      const r = await staffApi<{ rewardsUnlocked: number; discarded: number; card: ProgramView }>('/api/pos/credits', {
        method: 'POST',
        headers: { 'Idempotency-Key': creditKey.current },
        body: { customerRef: view.customerRef, programId: c.programId, quantity: qty },
      });
      const parts = [
        r.rewardsUnlocked > 0 ? `🎉 Recompensa liberada: ${c.rewardDescription}!` : null,
        r.discarded > 0 ? `${plural(r.discarded, c.unitLabel, c.unitLabelPlural)} além da meta descartado(s).` : null,
        `Agora: ${r.card.balance}/${r.card.goal}`,
      ];
      onDone({
        kind: 'success',
        title: `+${plural(qty, c.unitLabel, c.unitLabelPlural)} para ${view.name}`,
        detail: [view.programs.length > 1 ? c.programName : null, ...parts].filter(Boolean).join(' · '),
      });
    } catch (e) {
      setConfirmCredit(false);
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function redeem() {
    setBusy(true);
    setError(null);
    try {
      const r = await staffApi<{ redeemed: number; rewards: { description: string }[] }>('/api/pos/redemptions', {
        method: 'POST',
        headers: { 'Idempotency-Key': redeemKey.current },
        body: { customerRef: view.customerRef, programId: c.programId, quantity: redeemQty },
      });
      onDone({
        kind: 'success',
        title: r.redeemed === 1 ? 'Recompensa utilizada' : `${r.redeemed} recompensas utilizadas`,
        detail: `${r.redeemed}× ${r.rewards[0]?.description ?? c.rewardDescription} para ${view.name}`,
      });
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

        <div className="mt-4">
          <ProgramPicker programs={view.programs} value={c.programId} onChange={selectProgram} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-stone-600">{view.programs.length > 1 ? c.programName : 'Progresso'}</span>
            <span className="text-xl font-bold tabular-nums">
              {complete && <span className="mr-2 text-sm font-semibold text-emerald-700">Cartão completo</span>}
              {shown}/{c.goal}
            </span>
          </div>
          <ProgressBar value={shown} max={c.goal} color={complete ? '#059669' : '#F26419'} />
        </div>
      </div>

      {/* Com recompensa disponível, usar a recompensa é a ação principal. */}
      {c.rewardsAvailable > 0 && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 text-emerald-950">
          <p className="text-sm font-medium text-emerald-800">
            {c.rewardsAvailable === 1 ? '1 recompensa disponível' : `${c.rewardsAvailable} recompensas disponíveis`}
          </p>
          <p className="text-xl font-bold">🎁 {c.rewardDescription}</p>
          {c.redeem.allowed ? (
            <Button size="xl" variant="success" className="mt-4 w-full" onClick={openRedeem}>
              Utilizar recompensa
            </Button>
          ) : (
            <div className="mt-3">
              <Alert kind="warning">{c.redeem.reason}</Alert>
            </div>
          )}
        </div>
      )}

      {c.programActive ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="mb-3 text-sm font-medium text-stone-700">Quantidade de {c.unitLabelPlural}</p>
          <div className="flex items-center justify-center gap-4">
            <Button variant="secondary" size="lg" className="w-16 text-2xl" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>
              −
            </Button>
            <span className="w-16 text-center text-5xl font-extrabold tabular-nums">{qty}</span>
            <Button variant="secondary" size="lg" className="w-16 text-2xl" onClick={() => setQty((q) => Math.min(c.maxPerEntry, q + 1))} disabled={qty >= c.maxPerEntry}>
              +
            </Button>
          </div>
          {discard > 0 && (
            <div className="mt-4">
              <Alert kind="warning">
                Este programa não guarda o excedente: o cliente ganha a recompensa e {plural(discard, c.unitLabel, c.unitLabelPlural)}{' '}
                {discard === 1 ? 'será descartado' : 'serão descartados'}.
              </Alert>
            </div>
          )}
          <Button
            size={canRedeem ? 'lg' : 'xl'}
            variant={canRedeem ? 'secondary' : undefined}
            className="mt-4 w-full"
            loading={busy && !confirmRedeem}
            onClick={() => (canRedeem ? setConfirmCredit(true) : launch())}
          >
            Lançar {plural(qty, c.unitLabel, c.unitLabelPlural)}
          </Button>
        </div>
      ) : (
        <Alert kind="info">
          O programa &quot;{c.programName}&quot; foi encerrado: não aceita novos lançamentos, mas as recompensas já liberadas podem ser usadas.
        </Alert>
      )}

      {error && <Alert>{error}</Alert>}

      <Modal open={confirmCredit} onClose={() => !busy && setConfirmCredit(false)} title="Lançar sem usar a recompensa?">
        <div className="space-y-3 text-stone-700">
          <p>
            <strong>{view.name}</strong> tem {c.rewardsAvailable === 1 ? '1 recompensa disponível' : `${c.rewardsAvailable} recompensas disponíveis`}:{' '}
            <strong>{c.rewardDescription}</strong>.
          </p>
          <p className="text-sm text-stone-500">Se o cliente veio usar a recompensa, toque em &quot;Utilizar recompensa&quot;. A recompensa continua guardada se você só lançar.</p>
        </div>
        <div className="mt-5 grid gap-3">
          <Button size="lg" variant="success" className="w-full" onClick={openRedeem} disabled={busy}>
            Utilizar recompensa
          </Button>
          <Button size="lg" variant="secondary" className="w-full" onClick={launch} loading={busy && confirmCredit}>
            Só lançar {plural(qty, c.unitLabel, c.unitLabelPlural)}
          </Button>
        </div>
      </Modal>

      <Modal open={confirmRedeem} onClose={() => setConfirmRedeem(false)} title="Utilizar recompensa">
        <div className="space-y-2 text-stone-700">
          <p>
            Cliente: <strong>{view.name}</strong>
          </p>
          <p>
            Recompensa: <strong>{c.rewards[0]?.description ?? c.rewardDescription}</strong>
            {view.programs.length > 1 && <span className="text-stone-500"> ({c.programName})</span>}
          </p>
          <p className="text-sm text-stone-500">
            {c.rewardsAvailable === 1 ? '1 disponível' : `${c.rewardsAvailable} disponíveis`}. Quantas o cliente vai usar agora?
          </p>
        </div>
        <div className="my-4 flex items-center justify-center gap-4">
          <Button variant="secondary" size="lg" className="w-14 text-2xl" onClick={() => setRedeemQty((q) => Math.max(1, q - 1))} disabled={redeemQty <= 1}>
            −
          </Button>
          <span className="w-12 text-center text-4xl font-extrabold tabular-nums">{redeemQty}</span>
          <Button
            variant="secondary"
            size="lg"
            className="w-14 text-2xl"
            onClick={() => setRedeemQty((q) => Math.min(c.rewardsAvailable, q + 1))}
            disabled={redeemQty >= c.rewardsAvailable}
          >
            +
          </Button>
        </div>
        {view.source === 'TELEFONE' && (
          <Alert kind="warning">Cliente encontrado pelo telefone: confirme o nome dele antes de entregar.</Alert>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setConfirmRedeem(false)}>
            Cancelar
          </Button>
          <Button variant="success" onClick={redeem} loading={busy}>
            Confirmar {redeemQty > 1 ? `(${redeemQty})` : ''}
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
  programName: string;
}

function CheckoutStep({ onBack, onDone }: { onBack: () => void; onDone: (f: Flash) => void }) {
  const [qty, setQty] = useState(1);
  const [programs, setPrograms] = useState<ProgramView[] | null>(null);
  const [programId, setProgramId] = useState('');
  const [token, setToken] = useState<CheckoutToken | null>(null);
  const [left, setLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffApi<ProgramView[]>('/api/pos/programs')
      .then((ps) => {
        setPrograms(ps);
        setProgramId(ps[0]?.programId ?? '');
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setToken(
        await staffApi<CheckoutToken>('/api/pos/checkout-tokens', {
          method: 'POST',
          body: { quantity: qty, programId: programId || undefined },
        }),
      );
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
        {programs && programs.length > 1 && (
          <div className="mb-4">
            <ProgramPicker programs={programs} value={programId} onChange={setProgramId} />
          </div>
        )}
        {programs && programs.length === 0 && (
          <div className="mb-4">
            <Alert kind="warning">Nenhum programa ativo. Ative um programa no painel.</Alert>
          </div>
        )}
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
