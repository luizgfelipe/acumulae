'use client';

import { createContext, useContext } from 'react';
import type { Me } from '@/lib/customer';

export interface CustomerContextValue {
  /** null só na home sem login (landing). */
  me: Me | null;
  reload: () => Promise<void>;
}

export const CustomerContext = createContext<CustomerContextValue | null>(null);

/** Cliente carregado pelo layout das telas logadas (app/(cliente)/layout.tsx). */
export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer fora do layout do cliente');
  return ctx;
}

/** Igual a useCustomer, para telas que só existem com login (o layout já garante). */
export function useLoggedCustomer() {
  const { me, reload } = useCustomer();
  if (!me) throw new Error('useLoggedCustomer sem cliente logado');
  return { me, reload };
}
