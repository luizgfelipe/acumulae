import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BRANDING_SELECT, logoUrlOf } from '../common/branding';
import { config } from '../common/config';
import { randomToken, sha256 } from '../common/crypto';
import { badRequest, forbidden, gone, notFound, unauthorized } from '../common/errors';
import { hashPassword, passwordProblem, verifyPassword } from '../common/password';
import { emailSchema } from '../common/schemas';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginRateLimiter } from './rate-limiter.service';
import { SessionsService } from './sessions.service';

export const staffLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const staffContextSchema = z.object({ tenantId: z.string().uuid(), storeId: z.string().uuid().nullish() });
export const staffForgotSchema = z.object({ email: emailSchema });
export const staffResetSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(128) });
export const acceptInviteSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(1).max(128),
});

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly limiter: LoginRateLimiter,
    private readonly mail: MailService,
  ) {}

  /** Estabelecimentos e unidades a que o funcionário tem acesso. */
  async workplaces(staffUserId: string) {
    const ms = await this.prisma.staffMembership.findMany({
      where: { staffUserId, status: 'ACTIVE' },
      include: {
        tenant: { include: { stores: { where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }, branding: { select: BRANDING_SELECT } } },
        storeAccess: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return ms.map((m) => {
      const allowed = m.storeAccess.map((a) => a.storeId);
      const stores = m.role === 'MANAGER' ? m.tenant.stores : m.tenant.stores.filter((s) => allowed.includes(s.id));
      return {
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
        tenantStatus: m.tenant.status,
        logoUrl: logoUrlOf(m.tenant.slug, m.tenant.branding),
        primaryColor: m.tenant.branding?.primaryColor ?? null,
        role: m.role,
        stores: stores.map((s) => ({ id: s.id, name: s.name })),
      };
    });
  }

  /** Se houver só uma opção possível, já define o contexto. */
  private async autoContext(staffUserId: string) {
    const wp = await this.workplaces(staffUserId);
    if (wp.length !== 1) return {};
    const w = wp[0];
    return { tenantId: w.tenantId, storeId: w.stores.length === 1 ? w.stores[0].id : null };
  }

  async login(input: z.infer<typeof staffLoginSchema>, ip: string, device: string | null) {
    this.limiter.assertAllowed('staff', input.email, ip);
    const u = await this.prisma.staffUser.findUnique({ where: { email: input.email } });
    // O bcrypt roda mesmo sem conta: o tempo de resposta não revela se ela existe.
    const ok = await verifyPassword(input.password, u?.status === 'ACTIVE' ? u.passwordHash : null);
    if (!ok || !u) {
      this.limiter.fail('staff', input.email, ip);
      throw unauthorized('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
    }
    this.limiter.succeed('staff', input.email, ip);
    const session = await this.sessions.create('staff', u.id, device, await this.autoContext(u.id));
    return { user: u, session };
  }

  async setContext(staffUserId: string, sessionId: string, tenantId: string, storeId: string | null | undefined) {
    const wp = (await this.workplaces(staffUserId)).find((w) => w.tenantId === tenantId);
    if (!wp) throw forbidden('Você não tem acesso a este estabelecimento.');
    let chosenStore: string | null = storeId ?? null;
    if (chosenStore && !wp.stores.some((s) => s.id === chosenStore)) throw forbidden('Você não tem acesso a esta unidade.');
    if (!chosenStore && wp.stores.length === 1) chosenStore = wp.stores[0].id;
    await this.prisma.staffSession.update({ where: { id: sessionId }, data: { tenantId, storeId: chosenStore } });
  }

  async me(staffUserId: string, sessionId: string) {
    const [u, s, workplaces] = await Promise.all([
      this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffUserId } }),
      this.prisma.staffSession.findUniqueOrThrow({ where: { id: sessionId } }),
      this.workplaces(staffUserId),
    ]);
    const current = workplaces.find((w) => w.tenantId === s.tenantId) ?? null;
    const store = current?.stores.find((st) => st.id === s.storeId) ?? null;
    return {
      user: { id: u.id, name: u.name, email: u.email },
      workplaces,
      context: current
        ? {
            tenantId: current.tenantId,
            tenantName: current.tenantName,
            tenantStatus: current.tenantStatus,
            role: current.role,
            logoUrl: current.logoUrl,
            primaryColor: current.primaryColor,
            storeId: store?.id ?? null,
            storeName: store?.name ?? null,
          }
        : null,
    };
  }

  async forgot(email: string) {
    const u = await this.prisma.staffUser.findUnique({ where: { email } });
    if (!u || u.status !== 'ACTIVE' || !u.passwordHash) return;
    const token = randomToken(32);
    await this.prisma.staffPasswordResetToken.create({
      data: { staffUserId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    await this.mail.send({
      to: u.email,
      subject: 'Redefinição de senha do painel — Acumulaê',
      text:
        `Olá, ${u.name.split(' ')[0]}!\n\nPara redefinir sua senha do painel/caixa, use o link abaixo ` +
        `(válido por 30 minutos, uso único):\n${config.publicUrl}/painel/redefinir-senha?token=${token}\n\n` +
        `Se não foi você, ignore este e-mail.`,
    });
  }

  async reset(token: string, password: string) {
    const now = new Date();
    const rt = await this.prisma.staffPasswordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!rt || rt.usedAt || rt.expiresAt < now) throw badRequest('INVALID_TOKEN', 'Link inválido ou expirado.');
    const problem = passwordProblem(password);
    if (problem) throw badRequest('WEAK_PASSWORD', problem);
    const hash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.staffPasswordResetToken.updateMany({ where: { id: rt.id, usedAt: null }, data: { usedAt: now } });
      if (!used.count) throw badRequest('INVALID_TOKEN', 'Link inválido ou expirado.');
      await tx.staffUser.update({ where: { id: rt.staffUserId }, data: { passwordHash: hash } });
      await tx.staffSession.updateMany({ where: { staffUserId: rt.staffUserId, revokedAt: null }, data: { revokedAt: now } });
    });
  }

  // ───────────── Convites (RN-93) ─────────────

  private async findInvite(token: string) {
    const inv = await this.prisma.staffInvite.findUnique({
      where: { tokenHash: sha256(token) },
      include: { tenant: true },
    });
    if (!inv) throw notFound('Convite não encontrado.', 'INVITE_NOT_FOUND');
    if (inv.usedAt) throw gone('INVITE_USED', 'Este convite já foi usado. Entre com seu e-mail e senha.');
    if (inv.expiresAt < new Date()) throw gone('INVITE_EXPIRED', 'Este convite expirou. Peça um novo.');
    return inv;
  }

  async inviteInfo(token: string) {
    const inv = await this.findInvite(token);
    const existing = await this.prisma.staffUser.findUnique({ where: { email: inv.email } });
    return {
      tenantName: inv.tenant.name,
      email: inv.email,
      name: existing?.name ?? inv.name,
      role: inv.role,
      hasAccount: !!existing?.passwordHash,
      expiresAt: inv.expiresAt,
    };
  }

  async acceptInvite(token: string, input: z.infer<typeof acceptInviteSchema>, device: string | null) {
    const inv = await this.findInvite(token);
    const existing = await this.prisma.staffUser.findUnique({ where: { email: inv.email } });

    if (existing?.passwordHash) {
      // Já tem conta (ex.: funcionário de outro estabelecimento): confirma a senha atual.
      if (!(await verifyPassword(input.password, existing.passwordHash))) {
        throw unauthorized('Senha incorreta. Use a senha que você já tem no Acumulaê.', 'INVALID_CREDENTIALS');
      }
    } else {
      const problem = passwordProblem(input.password);
      if (problem) throw badRequest('WEAK_PASSWORD', problem);
    }
    const name = input.name ?? existing?.name ?? inv.name;
    if (!name) throw badRequest('NAME_REQUIRED', 'Informe seu nome.');
    const newHash = existing?.passwordHash ? null : await hashPassword(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const used = await tx.staffInvite.updateMany({
        where: { id: inv.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!used.count) throw gone('INVITE_USED', 'Este convite já foi usado.');

      const u = existing
        ? await tx.staffUser.update({
            where: { id: existing.id },
            data: { name, status: 'ACTIVE', ...(newHash ? { passwordHash: newHash } : {}) },
          })
        : await tx.staffUser.create({ data: { name, email: inv.email, passwordHash: newHash } });

      const membership = await tx.staffMembership.upsert({
        where: { staffUserId_tenantId: { staffUserId: u.id, tenantId: inv.tenantId } },
        create: { staffUserId: u.id, tenantId: inv.tenantId, role: inv.role },
        update: { role: inv.role, status: 'ACTIVE' },
      });
      if (inv.storeIds.length) {
        const valid = await tx.store.findMany({ where: { id: { in: inv.storeIds }, tenantId: inv.tenantId }, select: { id: true } });
        await tx.staffStoreAccess.deleteMany({ where: { staffMembershipId: membership.id } });
        await tx.staffStoreAccess.createMany({
          data: valid.map((s) => ({ staffMembershipId: membership.id, storeId: s.id })),
        });
      }
      return u;
    });

    const wp = (await this.workplaces(user.id)).find((w) => w.tenantId === inv.tenantId);
    const storeId = wp?.stores.length === 1 ? wp.stores[0].id : null;
    const session = await this.sessions.create('staff', user.id, device, { tenantId: inv.tenantId, storeId });
    return { user, session, role: inv.role };
  }
}
