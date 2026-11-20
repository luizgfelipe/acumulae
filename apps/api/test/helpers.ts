import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
type TestAgent = ReturnType<typeof request.agent>;
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { LoginRateLimiter } from '../src/auth/rate-limiter.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_PLANS, clearPlanCache } from '../src/plans/plans';

export const PLATFORM_KEY = 'test-platform-key';

export async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
  await prisma.plan.createMany({ data: DEFAULT_PLANS });
  clearPlanCache();
  app.get(LoginRateLimiter).reset();
}

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Gera um celular válido e único (DDD 47). */
export function phone() {
  const n = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  return `(47) 9${n.slice(0, 4)}-${n.slice(4)}`;
}

export async function createTenant(app: INestApplication, overrides: Record<string, unknown> = {}) {
  const slug = `t-${uniq()}`;
  const res = await request(app.getHttpServer())
    .post('/api/platform/tenants')
    .set('X-Platform-Key', PLATFORM_KEY)
    .send({
      name: `Tenant ${slug}`,
      slug,
      store: { name: 'Centro', slug: 'centro' },
      program: { unitLabel: 'rodízio', goal: 10, rewardDescription: '1 rodízio grátis' },
      manager: { name: 'Gestor', email: `gestor-${slug}@example.com` },
      // Padrão dos testes: o plano mais restrito. Sem `plan`, a API usa o PILOTO.
      plan: 'ESSENCIAL',
      ...overrides,
    })
    .expect(201);
  return { ...res.body, slug } as {
    tenantId: string;
    storeId: string;
    programId: string;
    managerInviteUrl: string;
    slug: string;
  };
}

/** Aceita o convite do gestor e devolve um agente autenticado no caixa/painel. */
export async function managerAgent(app: INestApplication, inviteUrl: string) {
  const agent = request.agent(app.getHttpServer());
  const token = inviteUrl.split('/').pop();
  await agent.post(`/api/staff/invites/${token}/accept`).send({ name: 'Gestor Teste', password: 'Gestor#2026' }).expect(200);
  const me = await agent.get('/api/staff/auth/me').expect(200);
  if (!me.body.context?.storeId) {
    const wp = me.body.workplaces[0];
    await agent.post('/api/staff/auth/context').send({ tenantId: wp.tenantId, storeId: wp.stores[0].id }).expect(200);
  }
  return agent;
}

export async function customerAgent(app: INestApplication, data: Partial<{ name: string; phone: string; email: string; password: string }> = {}) {
  const agent = request.agent(app.getHttpServer());
  const body = {
    name: data.name ?? 'Maria Silva',
    phone: data.phone ?? phone(),
    email: data.email ?? `cliente-${uniq()}@example.com`,
    password: data.password ?? 'Senha#Forte1',
    acceptTerms: true,
  };
  const res = await agent.post('/api/auth/register').send(body).expect(201);
  return { agent, id: res.body.customer.id as string, ...body };
}

export async function personalQr(agent: TestAgent) {
  const r = await agent.get('/api/me/qr').expect(200);
  return r.body.payload as string;
}

export async function resolveQr(pos: TestAgent, qr: string) {
  const r = await pos.post('/api/pos/customers/resolve-qr').send({ qr }).expect(200);
  const body = r.body as {
    customerRef: string;
    programs: Array<{ programId: string; programName: string; balance: number; rewardsAvailable: number; rewards: { id: string }[] }>;
  };
  // Atalhos para o caso comum de um programa só.
  return { ...body, card: body.programs[0], rewards: body.programs[0]?.rewards ?? [] };
}

export function credit(pos: TestAgent, customerRef: string, quantity: number, key = randomUUID()) {
  return pos.post('/api/pos/credits').set('Idempotency-Key', key).send({ customerRef, quantity });
}

export function lastMail(app: INestApplication, to: string) {
  const sent = app.get(MailService).sent.filter((m) => m.to === to);
  return sent[sent.length - 1];
}

export function redeem(pos: TestAgent, customerRef: string, extra: Record<string, unknown> = {}, key = randomUUID()) {
  return pos.post('/api/pos/redemptions').set('Idempotency-Key', key).send({ customerRef, ...extra });
}

/** Cria (ou altera) um plano de contratação. resetDb recria a grade padrão (PILOTO, ESSENCIAL, PROFISSIONAL, REDE). */
export async function ensurePlan(app: INestApplication, code: string, maxActivePrograms: number) {
  await request(app.getHttpServer())
    .put(`/api/platform/plans/${code}`)
    .set('X-Platform-Key', PLATFORM_KEY)
    .send({ name: code, maxActivePrograms })
    .expect(200);
}

/** Convida um atendente pelo painel e devolve o agente dele já logado. */
export async function attendantAgent(
  app: INestApplication,
  manager: TestAgent,
  storeIds: string[],
  email = `atendente-${uniq()}@example.com`,
) {
  const inv = await manager.post('/api/admin/staff').send({ email, name: 'Ana Atendente', role: 'ATTENDANT', storeIds }).expect(201);
  const agent = request.agent(app.getHttpServer());
  await agent.post(`/api/staff/invites/${inv.body.inviteUrl.split('/').pop()}/accept`).send({ password: 'Atende#2026' }).expect(200);
  return { agent, email, password: 'Atende#2026' };
}

/** Valor de um cookie em uma resposta (Set-Cookie). */
export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split(';')[0].slice(name.length + 1)) : undefined;
}

export const http = (app: INestApplication) => request(app.getHttpServer());
export { uniq };
