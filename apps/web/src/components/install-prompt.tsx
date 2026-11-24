'use client';

import { useEffect, useState } from 'react';
import { bannerDue, dismissBanner, takeInstallPending, useInstall } from '@/lib/install';
import { Button, Modal } from './ui';

const BENEFITS = ['Seus cartões e o QR a um toque, direto da tela inicial', 'Abre na hora, sem digitar endereço', 'Ocupa quase nada de espaço'];

/** Convite com o botão de instalar (Android) ou o passo a passo (iPhone). */
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const install = useInstall();
  const [busy, setBusy] = useState(false);

  // Fecha sozinho se o app for instalado com o convite aberto.
  useEffect(() => {
    if (open && install.installed) onClose();
  }, [open, install.installed, onClose]);

  async function installNow() {
    setBusy(true);
    try {
      if (await install.prompt()) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open && install.shouldInvite} onClose={onClose} title="Instale o Acumulaê no celular">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={64} height={64} className="h-16 w-16 rounded-2xl shadow-md" />
          <ul className="space-y-1 text-sm text-stone-700">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-brand-600">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {install.canPrompt ? (
          <Button className="h-13 w-full text-lg" onClick={installNow} loading={busy}>
            Instalar agora
          </Button>
        ) : (
          <Steps platform={install.platform} />
        )}

        <Button variant="ghost" className="w-full" onClick={onClose}>
          Agora não
        </Button>
      </div>
    </Modal>
  );
}

function Steps({ platform }: { platform: 'ios' | 'android' | 'other' }) {
  const steps =
    platform === 'ios'
      ? [
          <>
            Toque em <strong>Compartilhar</strong> <ShareIcon /> na barra do Safari.
          </>,
          <>
            Escolha <strong>Adicionar à Tela de Início</strong>.
          </>,
          <>
            Toque em <strong>Adicionar</strong>.
          </>,
        ]
      : [
          <>
            Toque no menu <strong>⋮</strong> do navegador.
          </>,
          <>
            Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
          </>,
        ];
  return (
    <ol className="space-y-3 rounded-2xl bg-stone-50 p-4 text-sm text-stone-800">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="-mt-1 inline h-4 w-4 text-sky-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="ícone de compartilhar">
      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** Abre o convite uma vez, logo depois do cadastro (marcado por `markInstallPending`). */
export function InstallAfterSignup() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (takeInstallPending()) setOpen(true);
  }, []);
  return <InstallSheet open={open} onClose={() => setOpen(false)} />;
}

/** Abre o convite assim que a tela aparece (ex.: depois de ganhar um selo). */
export function InstallNow() {
  const [open, setOpen] = useState(true);
  // Já convidou aqui: não repete o convite "pós-cadastro" na próxima tela.
  useEffect(() => {
    takeInstallPending();
  }, []);
  return <InstallSheet open={open} onClose={() => setOpen(false)} />;
}

/** Faixa na tela de cartões; fechada, volta depois de 3 dias. */
export function InstallBanner() {
  const install = useInstall();
  const [visible, setVisible] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (install.ready) setVisible(install.shouldInvite && bannerDue());
  }, [install.ready, install.shouldInvite]);

  if (!visible) return null;
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-secondary-300 bg-secondary-100 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">Instale o app</p>
          <p className="text-xs text-stone-600">Seus cartões a um toque, na tela inicial.</p>
        </div>
        <Button size="sm" onClick={() => setSheet(true)}>
          Instalar
        </Button>
        <button
          onClick={() => {
            dismissBanner();
            setVisible(false);
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg leading-none text-stone-500 transition-colors hover:bg-secondary-300/60 hover:text-stone-800"
          aria-label="Fechar"
        >
          ×
        </button>
      </div>
      <InstallSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  );
}
