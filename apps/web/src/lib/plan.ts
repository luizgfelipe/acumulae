/** Resposta de GET /api/admin/plan. Limites `max: null` = ilimitado. */
export interface Usage {
  used: number;
  max: number | null;
}

export interface PlanInfo {
  /** Plano que vale agora (o contratado, ou o Essencial depois da validade). */
  plan: { code: string; name: string; priceCents: number; supportChannel: 'EMAIL' | 'WHATSAPP' | 'WHATSAPP_PRIORITARIO' };
  contracted: { code: string; name: string };
  expiresAt: string | null;
  expired: boolean;
  activeCustomerDays: number;
  limits: {
    activeCustomers: Usage;
    activePrograms: Usage;
    stores: Usage & { included: number; extraPriceCents: number | null };
    staff: Usage;
    announcementsPerMonth: Usage;
  };
  features: {
    cardCustomization: boolean;
    maxStampIcons: number;
    customStampImage: boolean;
    reports: boolean;
    customerExport: boolean;
    networkDashboard: boolean;
  };
}

export const SUPPORT_LABELS: Record<PlanInfo['plan']['supportChannel'], string> = {
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  WHATSAPP_PRIORITARIO: 'WhatsApp prioritário',
};

export const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

/** A partir de quanto do limite de clientes ativos o painel avisa. */
export const CUSTOMER_WARNING_RATIO = 0.9;

export const isFull = (u: Usage) => u.max !== null && u.used >= u.max;

/** Dias até o fim da validade (negativo = vencido); null = sem validade. */
export function daysLeft(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
}

/** Aviso do topo do painel: validade e clientes ativos. */
export function planNotice(p: PlanInfo): { kind: 'warning' | 'error'; text: string } | null {
  const date = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString('pt-BR') : '';
  if (p.expired) {
    return { kind: 'error', text: `Seu plano ${p.contracted.name} venceu em ${date}. Até ser renovado, valem os recursos do plano Essencial.` };
  }
  const left = daysLeft(p.expiresAt);
  if (left !== null && left <= 7) {
    return { kind: 'warning', text: `Seu plano ${p.contracted.name} vence em ${date}. Fale com o suporte do Acumulaê para renovar.` };
  }
  const c = p.limits.activeCustomers;
  if (c.max !== null && c.used >= c.max * CUSTOMER_WARNING_RATIO) {
    return {
      kind: 'warning',
      text:
        c.used >= c.max
          ? `Você tem ${c.used} clientes ativos e seu plano inclui ${c.max}. O caixa continua funcionando normalmente; considere mudar de plano.`
          : `Você tem ${c.used} de ${c.max} clientes ativos do seu plano. Considere mudar de plano antes de chegar ao limite.`,
    };
  }
  return null;
}
