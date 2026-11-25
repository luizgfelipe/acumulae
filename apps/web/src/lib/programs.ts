import type { ProgramFields } from '@/components/program-form';

export interface ProgramItem extends ProgramFields {
  id: string;
  active: boolean;
  unitLabelPluralResolved: string;
  redeemWeekdaysText: string | null;
  createdAt: string;
  members: number;
  rewardsAvailable: number;
  /** Com clientes: tipo e valor do selo travados. */
  valueLocked: boolean;
}

export interface ProgramsList {
  limit: { plan: string; planName: string; /** null = ilimitado */ maxActive: number | null; active: number };
  items: ProgramItem[];
}
