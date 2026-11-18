import { Injectable } from '@nestjs/common';
import { Prisma, StaffRole } from '@prisma/client';
import { z } from 'zod';
import { BRANDING_SELECT, logoUrlOf, parseLogo } from '../common/branding';
import { config } from '../common/config';
import { conflict, notFound } from '../common/errors';
import {
  brandingFieldsSchema,
  emailSchema,
  programFieldsSchema,
  slugSchema,
} from '../common/schemas';
import { PrismaService } from '../prisma/prisma.service';
import { InvitesService } from '../staff/invites.service';

export const storeInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  address: z.string().trim().max(300).nullish(),
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  plan: z.string().trim().min(1).max(40).default('PILOTO'),
  branding: brandingFieldsSchema.optional(),
  store: storeInputSchema,
  program: programFieldsSchema,
  manager: z.object({ name: z.string().trim().min(1).max(120), email: emailSchema }),
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  plan: z.string().trim().min(1).max(40).optional(),
  branding: brandingFieldsSchema.optional(),
});

export const inviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120).nullish(),
  role: z.nativeEnum(StaffRole).default('MANAGER'),
  storeIds: z.array(z.string().uuid()).optional(),
});

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
  ) {}

  private signupUrl(slug: string) {
    return `${config.publicUrl}/e/${slug}`;
  }

  /** RN-92: tenant + primeira unidade + programa + convite do gestor, numa transação. */
  async createTenant(input: z.infer<typeof createTenantSchema>) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (existing) {
      // RN-94: idempotente pelo slug.
      throw conflict('TENANT_SLUG_EXISTS', 'Já existe um estabelecimento com este slug.', { tenantId: existing.id });
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: input.name, slug: input.slug, plan: input.plan },
        });
        const logo = input.branding?.logo ? parseLogo(input.branding.logo) : null;
        await tx.tenantBranding.create({
          data: {
            tenantId: tenant.id,
            logoData: logo?.data ?? null,
            logoMime: logo?.mime ?? null,
            ...(input.branding?.primaryColor ? { primaryColor: input.branding.primaryColor } : {}),
          },
        });
        const store = await tx.store.create({
          data: {
            tenantId: tenant.id,
            name: input.store.name,
            slug: input.store.slug,
            address: input.store.address ?? null,
          },
        });
        const p = input.program;
        const program = await tx.loyaltyProgram.create({
          data: {
            tenantId: tenant.id,
            rewardDescription: p.rewardDescription,
            unitLabel: p.unitLabel ?? 'selo',
            unitLabelPlural: p.unitLabelPlural ?? null,
            goal: p.goal ?? 10,
            maxPerEntry: p.maxPerEntry ?? 20,
            redeemWeekdays: p.redeemWeekdays ?? [],
            stampValidityDays: p.stampValidityDays ?? null,
          },
        });
        const invite = await this.invites.create(
          { tenantId: tenant.id, email: input.manager.email, name: input.manager.name, role: 'MANAGER' },
          tx,
        );
        return { tenant, store, program, invite };
      });

      await this.invites.sendEmail({
        email: input.manager.email,
        name: input.manager.name,
        tenantName: result.tenant.name,
        role: 'MANAGER',
        url: result.invite.url,
      });

      return {
        tenantId: result.tenant.id,
        storeId: result.store.id,
        programId: result.program.id,
        managerInviteUrl: result.invite.url,
        managerInviteExpiresAt: result.invite.expiresAt.toISOString(),
        storeSignupQrUrl: this.signupUrl(result.tenant.slug),
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const t = await this.prisma.tenant.findUnique({ where: { slug: input.slug } });
        throw conflict('TENANT_SLUG_EXISTS', 'Já existe um estabelecimento com este slug.', { tenantId: t?.id });
      }
      throw e;
    }
  }

  async list() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { stores: true, memberships: true } } },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      createdAt: t.createdAt,
      stores: t._count.stores,
      customers: t._count.memberships,
    }));
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branding: { select: BRANDING_SELECT },
        stores: { orderBy: { createdAt: 'asc' } },
        programs: { where: { active: true } },
        staff: { include: { staffUser: { select: { id: true, name: true, email: true } } } },
        invites: { where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { email: true, role: true, expiresAt: true } },
        _count: { select: { memberships: true } },
      },
    });
    if (!t) throw notFound('Estabelecimento não encontrado.');
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: t.plan,
      createdAt: t.createdAt,
      branding: t.branding && {
        logoUrl: logoUrlOf(t.slug, t.branding),
        primaryColor: t.branding.primaryColor,
        version: t.branding.version,
      },
      stores: t.stores.map((s) => ({ id: s.id, name: s.name, slug: s.slug, address: s.address, status: s.status })),
      program: t.programs[0] ?? null,
      staff: t.staff.map((m) => ({ ...m.staffUser, role: m.role, status: m.status })),
      pendingInvites: t.invites,
      customers: t._count.memberships,
      storeSignupQrUrl: this.signupUrl(t.slug),
    };
  }

  async update(id: string, input: z.infer<typeof updateTenantSchema>) {
    await this.ensure(id);
    await this.prisma.$transaction(async (tx) => {
      if (input.name || input.plan) {
        await tx.tenant.update({ where: { id }, data: { name: input.name, plan: input.plan } });
      }
      if (input.branding) {
        // logo: data URL = troca; null = remove; ausente = mantém.
        const b = input.branding;
        const logo = b.logo ? parseLogo(b.logo) : null;
        const logoFields =
          b.logo === undefined ? {} : { logoData: logo?.data ?? null, logoMime: logo?.mime ?? null };
        await tx.tenantBranding.upsert({
          where: { tenantId: id },
          create: { tenantId: id, primaryColor: b.primaryColor, ...logoFields },
          update: { primaryColor: b.primaryColor, ...logoFields, version: { increment: 1 } },
        });
      }
    });
    return this.get(id);
  }

  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    await this.ensure(id);
    await this.prisma.tenant.update({ where: { id }, data: { status } });
    return { id, status };
  }

  async addStore(tenantId: string, input: z.infer<typeof storeInputSchema>) {
    await this.ensure(tenantId);
    const dup = await this.prisma.store.findUnique({ where: { tenantId_slug: { tenantId, slug: input.slug } } });
    if (dup) throw conflict('STORE_SLUG_EXISTS', 'Já existe uma unidade com este slug.', { storeId: dup.id });
    const store = await this.prisma.store.create({
      data: { tenantId, name: input.name, slug: input.slug, address: input.address ?? null },
    });
    return { storeId: store.id, name: store.name, slug: store.slug };
  }

  async invite(tenantId: string, input: z.infer<typeof inviteSchema>) {
    const tenant = await this.ensure(tenantId);
    const { url, expiresAt } = await this.invites.create({
      tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
      storeIds: input.storeIds,
    });
    await this.invites.sendEmail({ email: input.email, name: input.name, tenantName: tenant.name, role: input.role, url });
    return { inviteUrl: url, expiresAt: expiresAt.toISOString() };
  }

  private async ensure(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Estabelecimento não encontrado.');
    return t;
  }
}
