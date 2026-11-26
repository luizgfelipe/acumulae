import { Injectable } from '@nestjs/common';
import { Customer, IdentityProvider, Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../common/config';
import { randomToken, sha256 } from '../common/crypto';
import { badRequest, conflict, unauthorized } from '../common/errors';
import { normalizePhone } from '../common/phone';
import { hashPassword, passwordProblem, verifyPassword } from '../common/password';
import { emailSchema } from '../common/schemas';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginRateLimiter } from './rate-limiter.service';
import { SessionsService } from './sessions.service';
import { formatWait } from '../rate-limit/rate-limit.store';
import { TERMS_VERSION, acceptedCurrentTerms } from '../common/terms';

const RESET_TTL_MINUTES = 30;

export const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) && d < new Date() && d.getUTCFullYear() > 1900;
  }, 'data inválida');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'informe seu nome').max(120),
  phone: z.string().trim().min(8).max(30),
  email: emailSchema,
  password: z.string().min(1).max(128),
  birthDate: birthDateSchema.nullish(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'é preciso aceitar os termos' }) }),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(128),
});

export const forgotSchema = z.object({ identifier: z.string().trim().min(3).max(200) });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(128) });

/**
 * Chave do identificador para os limites (RN-13): o mesmo telefone escrito de jeitos diferentes
 * ("(47) 99999-1234", "+5547999991234") ou o e-mail com maiúsculas contam como um só.
 */
export function identifierKey(identifier: string): string {
  const id = identifier.trim().toLowerCase();
  return id.includes('@') ? id : (normalizePhone(id) ?? id);
}

export function toDate(birth: string | null | undefined): Date | null {
  return birth ? new Date(`${birth}T00:00:00Z`) : null;
}

export function publicCustomer(c: Customer) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phoneE164,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    hasPassword: !!c.passwordHash,
    profileComplete: !!c.phoneE164 && !!c.termsAcceptedAt,
    /** Aceitou uma versão antiga dos Termos: o app pede o aceite da atual. */
    termsOutdated: !!c.termsAcceptedAt && !acceptedCurrentTerms(c),
  };
}

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly limiter: LoginRateLimiter,
    private readonly mail: MailService,
  ) {}

  /** RN-14: telefone/e-mail já cadastrado não cria conta nova. */
  async assertAvailable(phoneE164: string | null, email: string | null, exceptCustomerId?: string) {
    const or: Prisma.CustomerWhereInput[] = [];
    if (phoneE164) or.push({ phoneE164 });
    if (email) or.push({ email });
    if (!or.length) return;
    const existing = await this.prisma.customer.findFirst({
      where: { OR: or, ...(exceptCustomerId ? { NOT: { id: exceptCustomerId } } : {}) },
    });
    if (existing) {
      const field = phoneE164 && existing.phoneE164 === phoneE164 ? 'phone' : 'email';
      throw conflict(
        'ACCOUNT_EXISTS',
        field === 'phone'
          ? 'Já existe uma conta com este telefone. Entre ou recupere sua senha.'
          : 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.',
        { field },
      );
    }
  }

  async register(input: z.infer<typeof registerSchema>, device: string | null) {
    const phoneE164 = normalizePhone(input.phone);
    if (!phoneE164) throw badRequest('INVALID_PHONE', 'Telefone inválido. Informe DDD + número.');
    const birthDate = toDate(input.birthDate);
    const problem = passwordProblem(input.password, { birthDate, phoneE164 });
    if (problem) throw badRequest('WEAK_PASSWORD', problem);
    await this.assertAvailable(phoneE164, input.email);

    let customer: Customer;
    try {
      customer = await this.prisma.customer.create({
        data: {
          name: input.name,
          email: input.email,
          phoneE164,
          birthDate,
          passwordHash: await hashPassword(input.password),
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict('ACCOUNT_EXISTS', 'Já existe uma conta com este telefone ou e-mail.');
      }
      throw e;
    }
    const session = await this.sessions.create('customer', customer.id, device);
    return { customer, session };
  }

  private async findByIdentifier(identifier: string) {
    const id = identifier.trim();
    if (id.includes('@')) {
      return this.prisma.customer.findUnique({ where: { email: id.toLowerCase() } });
    }
    const phone = normalizePhone(id);
    return phone ? this.prisma.customer.findUnique({ where: { phoneE164: phone } }) : null;
  }

  /** RN-09: telefone ou e-mail + senha. RN-13: limite de tentativas. */
  async login(input: z.infer<typeof loginSchema>, ip: string, device: string | null) {
    const key = identifierKey(input.identifier);
    this.limiter.assertAllowed('customer', key, ip);
    const c = await this.findByIdentifier(input.identifier);
    // O bcrypt roda mesmo sem conta: o tempo de resposta não revela se ela existe.
    const ok = await verifyPassword(input.password, c?.status === 'ACTIVE' ? c.passwordHash : null);
    if (!ok || !c) {
      const { accountPausedMs } = this.limiter.fail('customer', key, ip);
      if (accountPausedMs && c?.email && c.status === 'ACTIVE') this.alertAttack(c, accountPausedMs);
      throw unauthorized('Telefone/e-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
    }
    this.limiter.succeed('customer', key, ip);
    const session = await this.sessions.create('customer', c.id, device);
    return { customer: c, session };
  }

  /** RN-13: muitas senhas erradas de vários IPs pausaram o login da conta em IPs novos. Não atrasa a resposta. */
  private alertAttack(c: Customer, pausedMs: number) {
    void this.mail.send({
      to: c.email!,
      subject: 'Tentativas de entrar na sua conta — Acumulaê',
      text:
        `Olá, ${c.name.split(' ')[0]}!\n\n` +
        `Notamos muitas tentativas de entrar na sua conta Acumulaê com a senha errada.\n` +
        `Por segurança, pausamos por ${formatWait(pausedMs)} o login em aparelhos e redes que você ainda não usou. ` +
        `Onde você já entrou, tudo continua funcionando.\n\n` +
        `Se não foi você, recomendamos trocar a senha agora (o login volta ao normal na hora):\n` +
        `${config.publicUrl}/esqueci-senha\n\n` +
        `Dica: use uma senha que você não usa em outros sites.`,
    });
  }

  /** Fluxo 6.7: não revela se a conta existe (nem pelo tempo: o e-mail sai sem atrasar a resposta). */
  async forgot(identifier: string, ip: string) {
    this.limiter.forgot('customer', identifierKey(identifier), ip);
    const c = await this.findByIdentifier(identifier);
    if (!c || c.status !== 'ACTIVE' || !c.email) return;
    const token = randomToken(32);
    await this.prisma.passwordResetToken.create({
      data: { customerId: c.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    });
    const url = `${config.publicUrl}/redefinir-senha?token=${token}`;
    void this.mail.send({
      to: c.email,
      subject: 'Redefinição de senha — Acumulaê',
      text:
        `Olá, ${c.name.split(' ')[0]}!\n\n` +
        `Recebemos um pedido para redefinir a senha da sua conta Acumulaê.\n` +
        `Use o link abaixo (válido por ${RESET_TTL_MINUTES} minutos, uso único):\n${url}\n\n` +
        `Se não foi você, ignore este e-mail. Sua senha continua a mesma.`,
    });
  }

  async reset(token: string, password: string) {
    const now = new Date();
    const rt = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { customer: true },
    });
    if (!rt || rt.usedAt || rt.expiresAt < now || rt.customer.status !== 'ACTIVE') {
      throw badRequest('INVALID_TOKEN', 'Link inválido ou expirado. Peça um novo.');
    }
    const problem = passwordProblem(password, { birthDate: rt.customer.birthDate, phoneE164: rt.customer.phoneE164 });
    if (problem) throw badRequest('WEAK_PASSWORD', problem);
    const hash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.passwordResetToken.updateMany({
        where: { id: rt.id, usedAt: null },
        data: { usedAt: now },
      });
      if (used.count === 0) throw badRequest('INVALID_TOKEN', 'Link inválido ou expirado. Peça um novo.');
      await tx.customer.update({ where: { id: rt.customerId }, data: { passwordHash: hash } });
      // Fluxo 6.7: todas as sessões antigas são encerradas.
      await tx.customerSession.updateMany({ where: { customerId: rt.customerId, revokedAt: null }, data: { revokedAt: now } });
    });
    this.limiter.clearAccount('customer', [rt.customer.email, rt.customer.phoneE164].map((i) => i && identifierKey(i)));
  }

  /**
   * Resolve o cliente de um login social (RN-07, RN-15).
   * Identifica sempre pelo `sub` do provedor, nunca pelo e-mail.
   */
  async resolveSocial(p: {
    provider: IdentityProvider;
    subject: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  }): Promise<{ kind: 'ok'; customer: Customer } | { kind: 'needs-password-link'; email: string }> {
    const identity = await this.prisma.customerIdentity.findUnique({
      where: { provider_providerSubject: { provider: p.provider, providerSubject: p.subject } },
      include: { customer: true },
    });
    if (identity && identity.customer.status === 'ACTIVE') return { kind: 'ok', customer: identity.customer };

    const email = p.email?.toLowerCase() ?? null;
    if (email) {
      const existing = await this.prisma.customer.findUnique({ where: { email } });
      if (existing && existing.status === 'ACTIVE') {
        if (!p.emailVerified) return { kind: 'needs-password-link', email };
        await this.prisma.customerIdentity.create({
          data: { customerId: existing.id, provider: p.provider, providerSubject: p.subject, emailAtProvider: email },
        });
        return { kind: 'ok', customer: existing };
      }
    }

    const customer = await this.prisma.customer.create({
      data: {
        name: p.name?.trim() || 'Cliente',
        email,
        identities: { create: { provider: p.provider, providerSubject: p.subject, emailAtProvider: email } },
      },
    });
    return { kind: 'ok', customer };
  }

  /** Vincula um login social pendente após o cliente provar a senha (RN-15). */
  async linkPendingIdentity(customer: Customer, pending: { provider: IdentityProvider; subject: string; email: string }) {
    if (customer.email !== pending.email) return;
    await this.prisma.customerIdentity
      .create({
        data: {
          customerId: customer.id,
          provider: pending.provider,
          providerSubject: pending.subject,
          emailAtProvider: pending.email,
        },
      })
      .catch(() => undefined);
  }
}
