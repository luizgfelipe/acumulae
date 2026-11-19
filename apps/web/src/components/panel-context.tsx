'use client';

import { createContext, useContext } from 'react';
import type { PlanInfo } from '@/lib/plan';
import type { StaffMe } from '@/lib/staff';

export const PanelContext = createContext<{
  me: StaffMe;
  /** Recarrega os dados do gestor e o plano (limites e uso). */
  reload: () => void;
  /** Plano vigente; null enquanto carrega. */
  plan: PlanInfo | null;
} | null>(null);

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel fora do painel');
  return ctx;
}
