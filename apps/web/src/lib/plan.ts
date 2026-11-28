import { LOCALE } from '@/lib/region';

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
  limits: {
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
  /** Plano de rede recomendado a partir de 3 unidades sem o painel da rede (ex.: Profissional); null = sem recomendação. */
  recommendation: NetworkRecommendation | null;
}

export interface NetworkRecommendation {
  code: string;
  name: string;
  priceCents: number;
  includedStores: number;
  extraStorePriceCents: number | null;
}

/** Texto da recomendação do plano de rede. */
export function recommendationText(r: NetworkRecommendation) {
  const extra = r.extraStorePriceCents !== null ? ` Unidade adicional: ${brl(r.extraStorePriceCents)} por mês.` : '';
  return `A partir de ${r.includedStores} unidades, recomendamos o plano ${r.name}: ${r.includedStores} unidades inclusas por ${brl(r.priceCents)} por mês, com o painel consolidado da rede.${extra}`;
}

export const SUPPORT_LABELS: Record<PlanInfo['plan']['supportChannel'], string> = {
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  WHATSAPP_PRIORITARIO: 'WhatsApp prioritário',
};

export const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

export const isFull = (u: Usage) => u.max !== null && u.used >= u.max;

/** Dias até o fim da validade (negativo = vencido); null = sem validade. */
export function daysLeft(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
}

/** Aviso do topo do painel: validade do plano. */
export function planNotice(p: PlanInfo): { kind: 'warning' | 'error'; text: string } | null {
  const date = p.expiresAt ? new Date(p.expiresAt).toLocaleDateString(LOCALE) : '';
  if (p.expired) {
    return { kind: 'error', text: `Seu plano ${p.contracted.name} venceu em ${date}. Até ser renovado, valem os recursos do plano Essencial.` };
  }
  const left = daysLeft(p.expiresAt);
  if (left !== null && left <= 7) {
    return { kind: 'warning', text: `Seu plano ${p.contracted.name} vence em ${date}. Fale com o suporte do Acumulaê para renovar.` };
  }
  return null;
}

/** Resposta de GET /api/admin/plans (comparação em Meu plano). Limites `null` = ilimitado. */
export interface ComparePlan {
  code: string;
  name: string;
  priceCents: number;
  supportChannel: PlanInfo['plan']['supportChannel'];
  limits: {
    activePrograms: number | null;
    includedStores: number;
    extraStorePriceCents: number | null;
    staff: number | null;
    announcementsPerMonth: number | null;
  };
  features: {
    maxStampIcons: number;
    cardCustomization: boolean;
    customStampImage: boolean;
    reports: boolean;
    customerExport: boolean;
    networkDashboard: boolean;
  };
}

export interface ComparePlans {
  /** Código do plano contratado. */
  current: string;
  items: ComparePlan[];
}
