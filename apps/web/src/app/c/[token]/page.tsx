'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { InstallNow } from '@/components/install-prompt';
import { StampGrid } from '@/components/stamps';
import { cardDisplay, leftoverLabel, rewardsLabel } from '@/lib/card-display';
import { Alert, FullPageSpinner, LinkButton, TenantAvatar } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { BrandColors, cardTheme } from '@/lib/card-theme';
import type { StampStyle } from '@/lib/stamp-icons';
import { useMe } from '@/lib/customer';
import { formatMoney, plural } from '@/lib/format';
import { tr } from '@/lib/region';

interface TokenInfo {
  status: 'PENDING' | 'USED' | 'CANCELLED' | 'EXPIRED';
  quantity: number;
  /** Programa por valor: valor da compra (os selos dependem do que o cliente já tem guardado). */
  amountCents: number | null;
  expiresAt: string;
  tenant: BrandColors & StampStyle & { name: string; slug: string; logoUrl: string | null; active: boolean };
  storeName: string;
  program: {
    unitLabel: string;
    unitLabelPlural: string;
    goal: number;
    rewardDescription: string;
    kind: 'SELO' | 'VALOR';
    stampValueCents: number | null;
  } | null;
}

interface ClaimResult {
  tenantName: string;
  quantity: number;
  amountCents: number | null;
  /** Selos que entraram de fato. */
  stamps: number;
  rewardsUnlocked: number;
  card: {
    membershipId: string;
    kind: 'SELO' | 'VALOR';
    stampValueCents: number | null;
    leftoverCents: number;
    balance: number;
    goal: number;
    rewardsAvailable: number;
    unitLabel: string;
    unitLabelPlural: string;
    rewardDescription: string;
  };
}

/** RN-44: QR temporário escaneado pela câmera do celular. */
export default function CheckoutClaimPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { me, loading } = useMe();
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const claimed = useRef(false);

  useEffect(() => {
    api<TokenInfo>(`/api/c/${token}`)
      .then(setInfo)
      .catch((e) => setError(errorMessage(e)));
  }, [token]);

  useEffect(() => {
    if (!info || loading || !me || claimed.current) return;
    if (!me.profileComplete) {
      router.replace(`/completar-perfil?next=${encodeURIComponent(`/c/${token}`)}`);
      return;
    }
    if (info.status !== 'PENDING') return;
    claimed.current = true;
    api<ClaimResult>(`/api/c/${token}/claim`, { method: 'POST' })
      .then(setResult)
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : errorMessage(e));
      });
  }, [info, me, loading, token, router]);

  if (!info && !error) return <FullPageSpinner />;

  const color = info?.tenant.primaryColor ?? '#F26419';
  const th = cardTheme(info?.tenant ?? {});
  const header = info && (
    <div className="mb-6 flex items-center gap-3">
      <TenantAvatar name={info.tenant.name} logoUrl={info.tenant.logoUrl} color={color} size={48} />
      <div>
        <p className="font-semibold">{info.tenant.name}</p>
        <p className="text-sm text-stone-500">{info.storeName}</p>
      </div>
    </div>
  );

  if (result) {
    const c = result.card;
    return (
      <PublicShell>
        {header}
        <div className="space-y-6 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full" style={{ background: th.accent, color: th.accentFg }}>
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold">
              {result.stamps > 0 ? `+${plural(result.stamps, c.unitLabel, c.unitLabelPlural)}` : tr('Compra registrada!', 'Compra registada!')}
            </h1>
            <p className="mt-1 text-lg text-stone-600">
              {result.amountCents != null && <>Compra de {formatMoney(result.amountCents)} </>}
              {tr(
                <>
                  no {result.tenantName}. Você tem <strong>{cardDisplay(c).shown}/{c.goal}</strong>.
                </>,
                <>
                  no {result.tenantName}. Tem <strong>{cardDisplay(c).shown}/{c.goal}</strong>.
                </>,
              )}
            </p>
            {leftoverLabel(c) && <p className="mt-1 text-sm text-stone-500">{leftoverLabel(c)}</p>}
          </div>
          {result.rewardsUnlocked > 0 && (
            <Alert kind="success">
              {tr(
                <>
                  🎉 Você ganhou <strong>{c.rewardDescription}</strong>! Para resgatar, mostre seu QR ou informe seu telefone no caixa.
                </>,
                <>
                  🎉 Ganhou <strong>{c.rewardDescription}</strong>! Para resgatar, mostre o seu QR ou indique o seu telemóvel na caixa.
                </>,
              )}
            </Alert>
          )}
          {result.rewardsUnlocked === 0 && c.rewardsAvailable > 0 && (
            <Alert kind="info">
              🎁 {rewardsLabel(c.rewardsAvailable)}: {c.rewardDescription}.{' '}
              {tr(
                'Para resgatar, mostre seu QR ou informe seu telefone no caixa.',
                'Para resgatar, mostre o seu QR ou indique o seu telemóvel na caixa.',
              )}
            </Alert>
          )}
          <StampGrid
            filled={cardDisplay(c).shown}
            goal={c.goal}
            color={th.accent}
            checkColor={th.accentFg}
            icon={info?.tenant.stampIcon}
            imageUrl={info?.tenant.stampImageUrl}
            size={c.goal > 15 ? 'sm' : 'md'}
            complete={cardDisplay(c).complete}
          />
          <LinkButton href={`/cartao/${c.membershipId}`} className="h-13 w-full text-lg">
            {tr('Ver meu cartão', 'Ver o meu cartão')}
          </LinkButton>
        </div>
        {/* A cada selo ganho, enquanto o app não estiver instalado. */}
        <InstallNow />
      </PublicShell>
    );
  }

  if (error || (info && info.status !== 'PENDING')) {
    const msg =
      error ??
      (info?.status === 'USED'
        ? 'Este código já foi usado.'
        : info?.status === 'CANCELLED'
          ? tr('Este código foi cancelado. Peça um novo ao atendente.', 'Este código foi cancelado. Peça um novo ao operador de caixa.')
          : tr('Este código expirou, peça um novo ao atendente.', 'Este código expirou. Peça um novo ao operador de caixa.'));
    return (
      <PublicShell>
        {header}
        <Alert kind="warning">{msg}</Alert>
        <Link href="/" className="mt-6 block text-center font-semibold text-accent-600">
          {tr('Ir para meus cartões', 'Ir para os meus cartões')}
        </Link>
      </PublicShell>
    );
  }

  if (loading || me) return <FullPageSpinner />;

  // Não logado: cadastro ou login, com crédito automático ao concluir (RN-44).
  const back = encodeURIComponent(`/c/${token}`);
  const p = info!.program;
  return (
    <PublicShell>
      {header}
      <h1 className="text-2xl font-bold">
        {info!.amountCents != null
          ? tr(
              `Sua compra de ${formatMoney(info!.amountCents)} vale ${p?.unitLabelPlural ?? 'selos'}!`,
              `A sua compra de ${formatMoney(info!.amountCents)} vale ${p?.unitLabelPlural ?? 'carimbos'}!`,
            )
          : tr(
              `Você ganhou ${p ? plural(info!.quantity, p.unitLabel, p.unitLabelPlural) : info!.quantity}!`,
              `Ganhou ${p ? plural(info!.quantity, p.unitLabel, p.unitLabelPlural) : info!.quantity}!`,
            )}
      </h1>
      <p className="mt-2 text-stone-600">
        {tr(
          'Entre ou crie sua conta grátis para guardar no seu cartão fidelidade',
          'Entre ou crie a sua conta grátis para guardar no seu cartão de fidelização',
        )}
        {p?.kind === 'VALOR' && p.stampValueCents ? ` (cada ${formatMoney(p.stampValueCents)} em compras vale 1 ${p.unitLabel}; a cada ${p.goal}, ganhe ${p.rewardDescription})` : p ? ` (a cada ${p.goal}, ganhe ${p.rewardDescription})` : ''}.{' '}
        {tr('O código vale por alguns minutos.', 'O código é válido durante alguns minutos.')}
      </p>
      <div className="mt-6 space-y-3">
        <LinkButton href={`/cadastro?next=${back}`} className="h-13 w-full text-lg">
          Criar conta e receber
        </LinkButton>
        <LinkButton href={`/entrar?next=${back}`} variant="secondary" className="h-13 w-full text-lg">
          Já tenho conta
        </LinkButton>
      </div>
    </PublicShell>
  );
}
