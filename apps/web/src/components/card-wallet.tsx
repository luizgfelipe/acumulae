'use client';

import { LOCALE, tr } from '@/lib/region';
import { ChevronRight, Gift, Layers, List, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CardSort, cardDisplay, isAlmostThere, isCardActive, leftoverLabel, rewardsLabel, sortCards } from '@/lib/card-display';
import { cardTheme } from '@/lib/card-theme';
import type { MembershipCard } from '@/lib/customer';
import { plural } from '@/lib/format';
import { ProgressBar } from './stamps';
import { Badge, Button, Modal, TenantAvatar, cx } from './ui';

type View = 'stack' | 'list';

const VIEW_KEY = 'acumulae:cartoes-visual';
const SORT_KEY = 'acumulae:cartoes-ordem';
/** Últimas recompensas já mostradas no modal (para só abrir sozinho quando aparecer uma nova). */
const REWARDS_SEEN_KEY = 'acumulae:recompensas-vistas';
/** A partir de quantos cartões aparece a busca. */
const SEARCH_FROM = 6;
/** Quanto um cartão fechado da pilha cobre o de cima (px). */
const OVERLAP = 14;

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* navegação privada: a preferência só vale nesta visita */
  }
}

/** Cartões do cliente: destaque das recompensas, ordem, pilha ou lista, busca e os pausados/encerrados à parte. */
export function CardWallet({ cards }: { cards: MembershipCard[] }) {
  const active = useMemo(() => cards.filter(isCardActive), [cards]);
  const inactive = useMemo(() => cards.filter((c) => !isCardActive(c)), [cards]);

  const [view, setViewState] = useState<View>(() => readPref(VIEW_KEY, ['stack', 'list'], active.length >= 3 ? 'stack' : 'list'));
  const [sort, setSortState] = useState<CardSort>(() => readPref(SORT_KEY, ['reward', 'recent'], 'reward'));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const setView = (v: View) => {
    setViewState(v);
    savePref(VIEW_KEY, v);
  };
  const setSort = (s: CardSort) => {
    setSortState(s);
    savePref(SORT_KEY, s);
    setSelected(null);
  };

  /** Nome do programa só aparece quando o mesmo estabelecimento tem mais de um cartão. */
  const multiProgram = useMemo(() => {
    const count = new Map<string, number>();
    cards.forEach((c) => count.set(c.tenant.slug, (count.get(c.tenant.slug) ?? 0) + 1));
    return (c: MembershipCard) => (count.get(c.tenant.slug) ?? 0) > 1;
  }, [cards]);

  const q = query.trim().toLocaleLowerCase(LOCALE);
  const matches = (c: MembershipCard) =>
    !q || [c.tenant.name, c.programName, c.rewardDescription].some((t) => t.toLocaleLowerCase(LOCALE).includes(q));

  const visible = sortCards(active, sort).filter(matches);
  const visibleInactive = sortCards(inactive, 'recent').filter(matches);
  const rewards = sortCards(
    active.filter((c) => c.rewardsAvailable > 0),
    'reward',
  );
  const openId = visible.some((c) => c.membershipId === selected) ? selected : (visible[0]?.membershipId ?? null);

  return (
    <div className="space-y-4">
      {rewards.length > 0 && <RewardsHighlight cards={rewards} />}

      {(active.length > 1 || cards.length >= SEARCH_FROM) && (
        <div className="space-y-3">
          {cards.length >= SEARCH_FROM && (
            <label className="relative block">
              <span className="sr-only">{tr('Buscar cartão', 'Pesquisar cartão')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr('Buscar por estabelecimento ou recompensa', 'Pesquisar por estabelecimento ou recompensa')}
                className="h-11 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-9 text-base outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          )}
          {active.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Segmented
                label="Ordem dos cartões"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'reward', label: 'Perto da recompensa' },
                  { value: 'recent', label: 'Recentes' },
                ]}
              />
              <Segmented
                label="Visualização"
                value={view}
                onChange={setView}
                options={[
                  { value: 'stack', label: <Layers className="h-4 w-4" aria-label="Pilha" /> },
                  { value: 'list', label: <List className="h-4 w-4" aria-label="Lista" /> },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {q && visible.length === 0 && visibleInactive.length === 0 && (
        <p className="py-6 text-center text-sm text-stone-500">
          {tr(<>Nenhum cartão encontrado para “{query.trim()}”.</>, <>Nenhum cartão encontrado para «{query.trim()}».</>)}
        </p>
      )}

      {view === 'stack' && visible.length > 1 ? (
        <CardStack cards={visible} openId={openId} onOpen={setSelected} showProgram={multiProgram} />
      ) : (
        <div className="space-y-4">
          {visible.map((c) => (
            <CardTile key={c.membershipId} card={c} showProgram={multiProgram(c)} />
          ))}
        </div>
      )}

      {visibleInactive.length > 0 && (
        <details className="group pt-2" open={active.length === 0 || undefined}>
          <summary className="flex list-none items-center gap-1 rounded-lg py-1 text-sm font-semibold text-stone-600 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
            {tr('Pausados e encerrados', 'Em pausa e encerrados')} ({visibleInactive.length})
          </summary>
          <div className="mt-3 space-y-4 opacity-75">
            {visibleInactive.map((c) => (
              <CardTile key={c.membershipId} card={c} showProgram={multiProgram(c)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Recompensas para usar: uma faixa fina no topo que abre um modal com a lista e o atalho para o QR.
 * O modal abre sozinho uma vez quando aparece recompensa nova (lembrado por aparelho); depois, só a faixa.
 */
function RewardsHighlight({ cards }: { cards: MembershipCard[] }) {
  const total = cards.reduce((n, c) => n + c.rewardsAvailable, 0);
  const router = useRouter();
  const signature = cards
    .map((c) => `${c.membershipId}:${c.rewardsAvailable}`)
    .sort()
    .join('|');
  const [open, setOpen] = useState(() => readPref(REWARDS_SEEN_KEY, [signature], '') !== signature);

  const close = () => {
    setOpen(false);
    savePref(REWARDS_SEEN_KEY, signature);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-secondary-300 bg-secondary-100 px-3 py-2.5 text-left transition-colors hover:bg-secondary-300/50"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white" aria-hidden>
          <Gift className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">{rewardsLabel(total)}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
      </button>

      <Modal open={open} onClose={close} title={rewardsLabel(total)}>
        <p className="-mt-2 text-sm text-stone-600">{tr('Mostre seu QR no caixa para resgatar.', 'Mostre o seu QR na caixa para resgatar.')}</p>
        <ul className="mt-3 divide-y divide-stone-200">
          {cards.map((c) => (
            <li key={c.membershipId}>
              <Link href={`/cartao/${c.membershipId}`} onClick={close} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent-600">
                <TenantAvatar name={c.tenant.name} logoUrl={c.tenant.logoUrl} color={cardTheme(c.tenant).accent} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.tenant.name}</span>
                  <span className="block truncate text-stone-600">{c.rewardDescription}</span>
                </span>
                {c.rewardsAvailable > 1 && <Badge color="brand">{c.rewardsAvailable}×</Badge>}
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2">
          <Button
            className="h-11"
            onClick={() => {
              close();
              router.push('/qr');
            }}
          >
            {tr('Mostrar meu QR', 'Mostrar o meu QR')}
          </Button>
          <Button variant="ghost" onClick={close} className="h-11">
            Agora não
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-stone-200 bg-white p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'grid h-8 place-items-center rounded-[10px] px-2.5 font-medium whitespace-nowrap transition-colors sm:px-3',
            value === o.value ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pilha estilo carteira: um cartão aberto e os outros só com o topo à mostra, um sobre o outro.
 * Tocar num cartão fechado abre esse; tocar no aberto leva ao detalhe.
 */
function CardStack({
  cards,
  openId,
  onOpen,
  showProgram,
}: {
  cards: MembershipCard[];
  openId: string | null;
  onOpen: (id: string) => void;
  showProgram: (c: MembershipCard) => boolean;
}) {
  return (
    <div className="pb-2">
      {cards.map((c, i) => {
        const open = c.membershipId === openId;
        const prevOpen = i > 0 && cards[i - 1].membershipId === openId;
        const tucked = !open && i < cards.length - 1;
        return (
          <div
            key={c.membershipId}
            className="relative transition-[margin] duration-300 ease-out"
            style={{ marginTop: i === 0 ? 0 : prevOpen ? 12 : -OVERLAP, zIndex: i }}
          >
            <StackCard card={c} open={open} tucked={tucked} raised={i > 0} showProgram={showProgram(c)} onOpen={() => onOpen(c.membershipId)} />
          </div>
        );
      })}
    </div>
  );
}

function StackCard({
  card: c,
  open,
  tucked,
  raised,
  showProgram,
  onOpen,
}: {
  card: MembershipCard;
  open: boolean;
  /** Tem outro cartão por cima cobrindo a parte de baixo: o topo ganha espaço para não ficar cortado. */
  tucked: boolean;
  /** Sombra para cima, separando do cartão de trás. */
  raised: boolean;
  showProgram: boolean;
  onOpen: () => void;
}) {
  const th = cardTheme(c.tenant);
  const { complete } = cardDisplay(c);
  const shell = cx(
    'block w-full overflow-hidden rounded-2xl border-2 bg-white text-left transition-shadow',
    raised ? 'shadow-[0_-6px_18px_-8px_rgba(28,25,23,0.35)]' : 'shadow-lg shadow-stone-900/10',
    open && 'shadow-xl shadow-stone-900/15',
    complete && 'card-complete',
  );
  const style = { borderColor: complete ? th.accent : th.border };
  const header = <CardHeader card={c} showProgram={showProgram} padBottom={tucked && !open ? 12 + OVERLAP : 12} />;

  if (!open) {
    return (
      <button type="button" onClick={onOpen} aria-expanded={false} aria-label={`Abrir cartão ${c.tenant.name}`} className={shell} style={style}>
        {header}
      </button>
    );
  }
  return (
    <Link href={`/cartao/${c.membershipId}`} className={cx(shell, 'stack-open')} style={style}>
      {header}
      <CardBody card={c} />
      <p className="flex items-center justify-end gap-0.5 px-4 pb-3 text-xs font-medium text-stone-500">
        Ver cartão <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </p>
    </Link>
  );
}

function CardTile({ card: c, showProgram }: { card: MembershipCard; showProgram: boolean }) {
  const th = cardTheme(c.tenant);
  const { complete } = cardDisplay(c);
  return (
    <Link
      href={`/cartao/${c.membershipId}`}
      className={cx(
        'block overflow-hidden rounded-2xl border-2 bg-white shadow-lg shadow-stone-900/10 transition hover:shadow-xl active:scale-[0.99]',
        complete && 'card-complete',
      )}
      style={{ borderColor: complete ? th.accent : th.border }}
    >
      <CardHeader card={c} showProgram={showProgram} />
      <CardBody card={c} />
    </Link>
  );
}

function CardHeader({ card: c, showProgram, padBottom = 12 }: { card: MembershipCard; showProgram: boolean; padBottom?: number }) {
  const th = cardTheme(c.tenant);
  const { shown } = cardDisplay(c);
  return (
    <div className="flex items-center gap-3 px-4 pt-3 transition-[padding] duration-300" style={{ ...th.header, paddingBottom: padBottom }}>
      <TenantAvatar name={c.tenant.name} logoUrl={c.tenant.logoUrl} color="rgba(255,255,255,0.25)" size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{c.tenant.name}</p>
        <p className="truncate text-xs opacity-85">{showProgram ? `${c.programName} · ${c.rewardDescription}` : c.rewardDescription}</p>
      </div>
      {c.rewardsAvailable > 0 && <Gift className="h-5 w-5 shrink-0" aria-label="Recompensa para usar" />}
      <span className="text-2xl font-extrabold tabular-nums">
        {shown}
        <span className="text-base font-semibold opacity-80">/{c.goal}</span>
      </span>
    </div>
  );
}

function CardBody({ card: c }: { card: MembershipCard }) {
  const th = cardTheme(c.tenant);
  const { complete, shown } = cardDisplay(c);
  const missing = Math.max(0, c.goal - c.balance);
  const leftover = leftoverLabel(c);
  return (
    <div className="space-y-2 px-4 py-3">
      <ProgressBar value={shown} max={c.goal} color={th.accent} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {complete ? (
          <span className="font-semibold" style={{ color: th.accent }}>
            {tr('🎉 Cartão completo! Resgate no caixa', '🎉 Cartão completo! Resgate na caixa')}
          </span>
        ) : (
          <span className="text-stone-600">{missing === 0 ? 'Meta atingida!' : `${missing === 1 ? 'Falta' : 'Faltam'} ${plural(missing, c.unitLabel, c.unitLabelPlural)}`}</span>
        )}
        <span className="flex flex-wrap gap-1.5">
          {isAlmostThere(c) && isCardActive(c) && <Badge color="brand">Quase lá!</Badge>}
          {c.rewardsAvailable > 0 && !complete && <Badge color="green">{rewardsLabel(c.rewardsAvailable)}</Badge>}
          {complete && c.rewardsAvailable > 1 && <Badge color="green">{c.rewardsAvailable} recompensas</Badge>}
          {!c.tenant.active && <Badge color="amber">{tr('Pausado', 'Em pausa')}</Badge>}
          {c.tenant.active && !c.programActive && <Badge color="stone">Encerrado</Badge>}
        </span>
      </div>
      {leftover && <p className="text-xs text-stone-500">{leftover}</p>}
    </div>
  );
}
