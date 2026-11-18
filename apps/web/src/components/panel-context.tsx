'use client';

import { createContext, useContext } from 'react';
import type { StaffMe } from '@/lib/staff';

export const PanelContext = createContext<{ me: StaffMe; reload: () => void } | null>(null);

export function usePanel() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanel fora do painel');
  return ctx;
}
