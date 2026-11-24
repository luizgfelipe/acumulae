'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, BellRing, ChartColumn, Check, Copy, ExternalLink, Gift, Mail, Palette, QrCode, ShieldCheck, Smartphone, Store, Users, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cardTheme, type CardStyle } from '@/lib/card-theme';
import { CONTACT_EMAIL } from '@/lib/contact';
import { ProgressBar, StampGrid } from './stamps';
import { LinkButton, Logo, Modal, TenantAvatar, cx } from './ui';

/** Contato comercial (por enquanto, e-mail; o mesmo do suporte). */
const SALES_EMAIL = CONTACT_EMAIL;
const SALES_SUBJECT = 'Quero o Acumulaê no meu estabelecimento';
const SALES_MAILTO = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(SALES_SUBJECT)}`;
const SALES_GMAIL = `https://mail.google.com/mail/?view=cm&fs=1&to=${SALES_EMAIL}&su=${encodeURIComponent(SALES_SUBJECT)}`;

/** Página inicial para quem ainda não entrou: apresenta o app ao cliente e ao estabelecimento. */
export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <Glow />
      <TopBar />
      <main>
        <Hero />
        <HowItWorks />
        <Benefits />
        <ForBusiness />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ───────────────────────── Peças ───────────────────────── */

/** Manchas de cor no fundo do topo (decorativas). */
function Glow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] overflow-hidden">
      <div className="absolute -top-40 -left-32 h-[30rem] w-[30rem] rounded-full bg-brand-200/60 blur-3xl" />
      <div className="absolute top-20 -right-40 h-[34rem] w-[34rem] rounded-full bg-secondary-300/60 blur-3xl" />
      <div className="absolute top-[26rem] left-1/3 h-72 w-72 rounded-full bg-accent-100/70 blur-3xl" />
    </div>
  );
}

function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-secondary-50/80 backdrop-blur supports-[backdrop-filter]:bg-secondary-50/60">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label="Acumulaê, página inicial">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a href="#estabelecimentos" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 md:block">
            Para estabelecimentos
          </a>
          <Link href="/entrar" className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:bg-white/70 hover:text-stone-900">
            Entrar
          </Link>
          <LinkButton href="/cadastro" className="h-9 px-3.5 text-sm">
            Criar conta
          </LinkButton>
        </nav>
      </Container>
    </header>
  );
}

function Hero() {
  return (
    <section>
      <Container className="grid items-center gap-14 pt-10 pb-20 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-16 lg:pb-28">
        <div className="landing-rise space-y-7 text-center lg:text-left">
          <h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-stone-900 sm:text-6xl">
            Seu cartão fidelidade,{' '}
            <span className="relative whitespace-nowrap text-brand-600">
              sem papel.
              <svg aria-hidden viewBox="0 0 300 18" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full text-brand-200">
                <path d="M3 13C60 4 140 2 297 9" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-lg text-stone-600 sm:text-xl lg:mx-0">
            Junte selos nos seus lugares favoritos e troque por recompensas. Todos os cartões num app só, e você nunca mais perde o
            progresso.
          </p>
          <div className="mx-auto flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
            <LinkButton href="/cadastro" className="h-13 px-6 text-lg">
              Criar minha conta grátis
              <ArrowRight className="h-5 w-5" aria-hidden />
            </LinkButton>
            <LinkButton href="/entrar" variant="secondary" className="h-13 px-6 text-lg">
              Já tenho conta
            </LinkButton>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-stone-600 lg:justify-start">
            {['Cadastro em 1 minuto', 'Sem baixar nada da loja', 'Aviso quando ganhar'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <PhoneMockup />
      </Container>
    </section>
  );
}

/* ───────────── Celular de demonstração ───────────── */

interface Demo {
  name: string;
  reward: string;
  primary: string;
  secondary: string | null;
  style: CardStyle;
  icon: string;
  filled: number;
  goal: number;
}

const DEMOS: Demo[] = [
  { name: 'Pizzaria Bella Massa', reward: '1 pizza broto grátis', primary: '#B91C1C', secondary: '#F59E0B', style: 'CLASSICO', icon: 'pizza', filled: 8, goal: 8 },
  { name: 'Café do Largo', reward: 'Um café especial', primary: '#4A2C1D', secondary: '#C08552', style: 'DEGRADE', icon: 'coffee', filled: 7, goal: 10 },
  { name: 'Burger da Vila', reward: 'Batata frita grande', primary: '#0F766E', secondary: '#FACC15', style: 'MOLDURA', icon: 'hamburger', filled: 3, goal: 6 },
];

function DemoCard({ d, className }: { d: Demo; className?: string }) {
  const th = cardTheme({ primaryColor: d.primary, secondaryColor: d.secondary, cardStyle: d.style });
  const complete = d.filled >= d.goal;
  return (
    <div
      className={cx('overflow-hidden rounded-2xl border-2 bg-white shadow-sm', complete && 'card-complete', className)}
      style={{ borderColor: th.border }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5" style={th.header}>
        <TenantAvatar name={d.name} color="rgba(255,255,255,0.22)" size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{d.name}</p>
          <p className="truncate text-[11px] opacity-85">{d.reward}</p>
        </div>
        <span className="text-lg font-extrabold tabular-nums">
          {d.filled}
          <span className="text-xs opacity-80">/{d.goal}</span>
        </span>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <ProgressBar value={d.filled} max={d.goal} color={th.accent} />
        <StampGrid filled={d.filled} goal={d.goal} color={th.accent} checkColor={th.accentFg} icon={d.icon} size="sm" complete={complete} />
        {complete && (
          <p className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold" style={{ background: `${th.accent}14`, color: th.accent }}>
            <Gift className="h-3.5 w-3.5" aria-hidden />
            Recompensa liberada! Mostre no caixa.
          </p>
        )}
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div className="landing-rise relative mx-auto w-full max-w-[22rem] [animation-delay:120ms]" aria-hidden>
      {/* Brilho atrás do aparelho */}
      <div className="absolute inset-8 -z-10 rounded-[3rem] bg-brand-600/25 blur-3xl" />

      <div className="rounded-[2.75rem] bg-stone-900 p-2.5 shadow-2xl shadow-stone-900/30 ring-1 ring-stone-700">
        <div className="relative overflow-hidden rounded-[2.2rem] bg-secondary-50">
          <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-stone-900" />
          <div className="space-y-3 px-4 pt-10 pb-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-stone-500">Olá, Ana!</p>
                <p className="text-lg font-bold text-stone-900">Seus cartões</p>
              </div>
              <span className="flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                <QrCode className="h-3.5 w-3.5" />
                Meu QR
              </span>
            </div>
            {DEMOS.map((d) => (
              <DemoCard key={d.name} d={d} />
            ))}
          </div>
        </div>
      </div>

      {/* Avisos flutuando ao redor do celular */}
      <div className="landing-float absolute z-20 top-3 -left-4 flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2.5 shadow-xl sm:-left-24">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
          <BellRing className="h-4.5 w-4.5" />
        </span>
        <div className="text-left">
          <p className="text-xs font-semibold text-stone-900">Pizza broto liberada!</p>
          <p className="text-[11px] text-stone-500">Pizzaria Bella Massa · agora</p>
        </div>
      </div>
      <div className="landing-float absolute z-20 -right-3 -bottom-5 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2 shadow-xl [animation-delay:1.4s] sm:-right-10">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <p className="text-xs font-semibold text-stone-900">+1 selo no Café do Largo</p>
      </div>
    </div>
  );
}

/* ───────────── Seções ───────────── */

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold tracking-wider text-brand-700 uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-lg text-stone-600">{text}</p>}
    </div>
  );
}

const STEPS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: Smartphone, title: 'Crie sua conta', text: 'Grátis, em menos de um minuto. Funciona direto no navegador do celular.' },
  { Icon: QrCode, title: 'Mostre o QR no caixa', text: 'Mostre seu QR ou escaneie o do atendente. Os selos entram na hora.' },
  { Icon: Gift, title: 'Ganhe a recompensa', text: 'Completou o cartão? O app avisa, e é só resgatar na próxima visita.' },
];

function HowItWorks() {
  return (
    <section className="border-y border-stone-200/70 bg-white py-20 sm:py-24">
      <Container>
        <SectionTitle eyebrow="Como funciona" title="Três passos e pronto" />
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title} className="relative rounded-3xl border border-stone-200 bg-secondary-50/60 p-6 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/5">
              <span className="absolute top-5 right-6 text-5xl font-extrabold text-stone-200/80 tabular-nums select-none">{i + 1}</span>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-600/30">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-bold text-stone-900">{title}</h3>
              <p className="mt-1.5 text-stone-600">{text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

const BENEFITS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: WalletCards, title: 'Todos os cartões num lugar', text: 'Pizzaria, café, hamburgueria: cada um com a sua cara, todos numa carteira só.' },
  { Icon: ShieldCheck, title: 'Nada se perde', text: 'Esqueceu a carteira? Trocou de celular? Seus selos ficam guardados na sua conta.' },
  { Icon: BellRing, title: 'Aviso na hora', text: 'Receba uma notificação a cada selo e quando a recompensa estiver liberada.' },
  { Icon: Gift, title: 'Sem custo para você', text: 'Para o cliente o Acumulaê é grátis, sempre. É só consumir e acumular.' },
];

function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionTitle eyebrow="Por que usar" title="Fidelidade que cabe no bolso" text="Chega de cartãozinho amassado, carimbo borrado e cartão esquecido em casa." />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ Icon, title, text }) => (
            <div key={title} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Icon className="h-5.5 w-5.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-bold text-stone-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{text}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

const BUSINESS: Array<{ Icon: LucideIcon; text: string }> = [
  { Icon: Palette, text: 'Cartão com a sua marca: logo, cores e o ícone do selo.' },
  { Icon: QrCode, text: 'Lançamento em segundos no caixa, pelo celular do atendente.' },
  { Icon: Users, text: 'Saiba quem são seus clientes e chame de volta quem sumiu.' },
  { Icon: ChartColumn, text: 'Relatórios por unidade, funcionário e aniversariantes.' },
];

function ForBusiness() {
  return (
    <section id="estabelecimentos" className="scroll-mt-20 pb-20 sm:pb-24">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-stone-900 px-6 py-12 text-white sm:px-12 sm:py-16">
          <div aria-hidden className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-brand-600/40 blur-3xl" />
          <div aria-hidden className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-accent-600/40 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand-200 ring-1 ring-white/15">
                <Store className="h-4 w-4" aria-hidden />
                Para estabelecimentos
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Faça o cliente voltar. E voltar de novo.</h2>
              <p className="mt-3 max-w-xl text-lg text-stone-300">
                Troque o cartão de papel por um programa de fidelidade digital, sem maquininha nova e sem complicação para a equipe.
              </p>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {BUSINESS.map(({ Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-200 ring-1 ring-white/15">
                      <Icon className="h-4.5 w-4.5" aria-hidden />
                    </span>
                    <span className="pt-1.5 text-sm text-stone-200">{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <SalesContact className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold whitespace-nowrap text-white shadow-sm transition duration-150 hover:bg-brand-700 hover:shadow-md hover:shadow-brand-600/30 motion-safe:active:scale-[0.98]">
                  <Mail className="h-4.5 w-4.5" aria-hidden />
                  Quero no meu estabelecimento
                </SalesContact>
                <Link
                  href="/painel/entrar"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold whitespace-nowrap text-white ring-1 ring-white/25 transition duration-150 hover:bg-white/10 motion-safe:active:scale-[0.98]"
                >
                  Já sou parceiro: acessar o painel
                  <ArrowRight className="h-4.5 w-4.5" aria-hidden />
                </Link>
              </div>
              <p className="mt-4 text-sm text-stone-400">
                Ou escreva para{' '}
                <SalesContact className="font-medium text-brand-200 underline-offset-2 hover:underline">{SALES_EMAIL}</SalesContact>
              </p>
            </div>
            <div className="relative mx-auto hidden w-full max-w-xs lg:block" aria-hidden>
              <DemoCard d={DEMOS[1]} className="relative z-10 shadow-2xl" />
              <DemoCard d={DEMOS[2]} className="absolute -top-10 left-10 w-full rotate-6 opacity-90" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="pb-20 sm:pb-24">
      <Container>
        <div className="rounded-[2rem] bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-12 text-center text-white shadow-xl shadow-brand-600/25 sm:py-16">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Seu próximo prêmio começa no próximo café.</h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-brand-50/90">Crie sua conta e comece a acumular na primeira visita.</p>
          <Link
            href="/cadastro"
            className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-white px-7 text-lg font-semibold text-brand-700 shadow-md transition duration-150 hover:bg-brand-50 motion-safe:active:scale-[0.98]"
          >
            Criar minha conta grátis
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </Container>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white/60">
      <Container className="flex flex-col items-center justify-between gap-4 py-8 text-sm text-stone-500 sm:flex-row">
        <div className="flex items-center gap-3">
          <Logo className="text-base" />
          <span>© {new Date().getFullYear()}</span>
        </div>
        <nav className="flex gap-5">
          <Link href="/termos" className="transition-colors hover:text-stone-800 hover:underline">
            Termos de Uso
          </Link>
          <Link href="/privacidade" className="transition-colors hover:text-stone-800 hover:underline">
            Privacidade
          </Link>
          <Link href="/painel/entrar" className="transition-colors hover:text-stone-800 hover:underline">
            Painel do estabelecimento
          </Link>
          <SalesContact className="transition-colors hover:text-stone-800 hover:underline">Contato comercial</SalesContact>
        </nav>
      </Container>
    </footer>
  );
}

/**
 * Contato comercial. Um link mailto: puro não faz nada quando o aparelho não tem app de e-mail
 * configurado (comum no Windows), então o botão abre opções: app de e-mail, Gmail ou copiar o endereço.
 */
function SalesContact({ className, children }: { className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SALES_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sem permissão de área de transferência: o endereço continua visível para copiar à mão */
    }
  };
  const option = 'flex h-12 w-full items-center gap-3 rounded-xl border border-stone-200 px-4 text-left font-semibold text-stone-800 transition hover:border-stone-300 hover:bg-stone-50';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {/* No body: fora do bloco escuro (que deixaria o texto branco) e acima do cabeçalho fixo. */}
      {mounted &&
        createPortal(
          <div className="text-stone-900">
            <Modal open={open} onClose={() => setOpen(false)} title="Fale com a gente">
              <p className="text-stone-600">Conte um pouco sobre o seu estabelecimento e a gente responde por e-mail.</p>
              <p className="mt-3 rounded-xl bg-secondary-50 px-4 py-3 text-center font-semibold text-stone-900 select-all">{SALES_EMAIL}</p>
              <div className="mt-4 grid gap-2">
                <a href={SALES_GMAIL} target="_blank" rel="noopener noreferrer" className={option}>
                  <ExternalLink className="h-5 w-5 text-brand-600" aria-hidden />
                  Escrever pelo Gmail
                </a>
                <a href={SALES_MAILTO} className={option}>
                  <Mail className="h-5 w-5 text-brand-600" aria-hidden />
                  Abrir meu app de e-mail
                </a>
                <button type="button" onClick={copy} className={option}>
                  {copied ? <Check className="h-5 w-5 text-emerald-600" strokeWidth={3} aria-hidden /> : <Copy className="h-5 w-5 text-brand-600" aria-hidden />}
                  {copied ? 'E-mail copiado!' : 'Copiar o e-mail'}
                </button>
              </div>
            </Modal>
          </div>,
          document.body,
        )}
    </>
  );
}
