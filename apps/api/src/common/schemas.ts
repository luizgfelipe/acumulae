import { z } from 'zod';
import { logoDataUrlSchema } from './branding';

export const slugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use apenas letras minúsculas, números e hífens');

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor no formato #RRGGBB');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('e-mail inválido')
  .max(200);

export const weekdaysSchema = z.array(z.number().int().min(1).max(7)).max(7);

export const programFieldsSchema = z.object({
  unitLabel: z.string().trim().min(1).max(30).optional(),
  unitLabelPlural: z.string().trim().min(1).max(30).nullish(),
  goal: z.number().int().min(2).max(50).optional(),
  rewardDescription: z.string().trim().min(1).max(120),
  maxPerEntry: z.number().int().min(1).max(100).optional(),
  redeemWeekdays: weekdaysSchema.optional(),
  stampValidityDays: z.number().int().min(1).max(3650).nullish(),
});

export const brandingFieldsSchema = z.object({
  /** Logo como data URL (PNG/JPG/WebP, até 200 KB). Não aceitamos URL externa. */
  logo: logoDataUrlSchema.nullish(),
  primaryColor: hexColorSchema.optional(),
});

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
