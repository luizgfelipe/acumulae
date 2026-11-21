'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PublicShell } from '@/components/customer-shell';
import { InstallNow } from '@/components/install-prompt';
import { StampGrid } from '@/components/stamps';
import { cardDisplay, rewardsLabel } from '@/lib/card-display';
import { Alert, FullPageSpinner, LinkButton, TenantAvatar } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { BrandColors, cardTheme } from '@/lib/card-theme';
import type { StampStyle } from '@/lib/stamp-icons';
import { useMe } from '@/lib/customer';
import { plural } from '@/lib/format';

interface TokenInfo {
  status: 'PENDING' | 'USED' | 'CANCELLED' | 'EXPIRED';
  quantity: number;
  expiresAt: string;
  tenant: BrandColors & StampStyle & { name: string; slug: string; logoUrl: string | null; active: boolean };
  storeName: string;
  program: { unitLabel: string; unitLabelPlural: string; goal: number; rewardDescription: string } | null;
}

interface ClaimResult {
  tenantName: string;
  quantity: number;
  rewardsUnlocked: number;
  card: { membershipId: string; balance: number; goal: number; rewardsAvailable: number; unitLabel: string; unitLabelPlural: string; rewardDescription: string };
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

  const color = info?.tenant.primaryColor ?? '#E85D04';
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
            <h1 className="text-3xl font-extrabold">+{plural(result.quantity, c.unitLabel, c.unitLabelPlural)}</h1>
            <p className="mt-1 text-lg text-stone-600">
              no {result.tenantName}. Você tem <strong>{cardDisplay(c).shown}/{c.goal}</strong>.
            </p>
          </div>
          {result.rewardsUnlocked > 0 && (
            <Alert kind="success">
              🎉 Você ganhou <strong>{c.rewardDescription}</strong>! Para resgatar, mostre seu QR ou informe seu telefone no caixa.
            </Alert>
          )}
          {result.rewardsUnlocked === 0 && c.rewardsAvailable > 0 && (
            <Alert kind="info">
              🎁 {rewardsLabel(c.rewardsAvailable)}: {c.rewardDescription}. Para resgatar, mostre seu QR ou informe seu telefone no caixa.
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
            Ver meu cartão
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
          ? 'Este código foi cancelado. Peça um novo ao atendente.'
          : 'Este código expirou, peça um novo ao atendente.');
    return (
      <PublicShell>
        {header}
        <Alert kind="warning">{msg}</Alert>
        <Link href="/" className="mt-6 block text-center font-semibold text-brand-700">
          Ir para meus cartões
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
        Você ganhou {p ? plural(info!.quantity, p.unitLabel, p.unitLabelPlural) : info!.quantity}!
      </h1>
      <p className="mt-2 text-stone-600">
        Entre ou crie sua conta grátis para guardar no seu cartão fidelidade
        {p ? ` (a cada ${p.goal}, ganhe ${p.rewardDescription})` : ''}. O código vale por alguns minutos.
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
