/**
 * API administrativa da plataforma (seção 5.10): cadastro de estabelecimentos, planos, suspensão e auditoria.
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PLATFORM_KEY, createApp, createTenant, credit, customerAgent, lastMail, managerAgent, personalQr, resetDb, resolveQr, uniq } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const platform = () => ({
  get: (url: string) => request(app.getHttpServer()).get(url).set('X-Platform-Key', PLATFORM_KEY),
  post: (url: string) => request(app.getHttpServer()).post(url).set('X-Platform-Key', PLATFORM_KEY),
  put: (url: string) => request(app.getHttpServer()).put(url).set('X-Platform-Key', PLATFORM_KEY),
  patch: (url: string) => request(app.getHttpServer()).patch(url).set('X-Platform-Key', PLATFORM_KEY),
});

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

const tenantBody = (over: Record<string, unknown> = {}) => {
  const slug = `p-${uniq()}`;
  return {
    name: 'Pizzaria Y',
    slug,
    store: { name: 'Matriz', slug: 'matriz', address: 'Rua A, 1' },
    manager: { name: 'Dona', email: `dona-${slug}@example.com` },
    ...over,
  };
};

/** A auditoria é gravada sem bloquear a resposta: espera ela aparecer. */
async function auditFor(action: string, targetId?: string, statusCode?: number) {
  for (let i = 0; i < 20; i++) {
    const row = await prisma.platformAuditLog.findFirst({ where: { action, ...(targetId ? { targetId } : {}), ...(statusCode ? { statusCode } : {}) }, orderBy: { createdAt: 'desc' } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`auditoria não encontrada: ${action}`);
}

describe('Cadastro do estabelecimento (RN-92 a RN-94)', () => {
  it('cria o estabelecimento sem programa: o gestor cria o primeiro no painel', async () => {
    const body = tenantBody();
    const r = await platform().post('/api/platform/tenants').send(body).expect(201);
    expect(r.body.storeSignupQrUrl).toBe(`http://localhost:3000/e/${body.slug}`);
    const hours = (new Date(r.body.managerInviteExpiresAt).getTime() - Date.now()) / 3600_000;
    expect(Math.round(hours)).toBe(72);

    const t = await platform().get(`/api/platform/tenants/${r.body.tenantId}`).expect(200);
    expect(t.body).toMatchObject({ status: 'ACTIVE', plan: 'PILOTO', stores: [{ name: 'Matriz', slug: 'matriz', address: 'Rua A, 1' }] });
    expect(t.body.programs).toEqual([]);
    expect(r.body.programId).toBeUndefined();
    expect(t.body.pendingInvites).toEqual([expect.objectContaining({ email: body.manager.email, role: 'MANAGER' })]);
  });

  it('o gestor recebe o convite por e-mail e não tem senha definida pelo script', async () => {
    const body = tenantBody();
    const r = await platform().post('/api/platform/tenants').send(body).expect(201);
    expect(lastMail(app, body.manager.email).text).toContain(r.body.managerInviteUrl);
    expect(await prisma.staffUser.count({ where: { email: body.manager.email } })).toBe(0);
    await managerAgent(app, r.body.managerInviteUrl);
    const user = await prisma.staffUser.findUniqueOrThrow({ where: { email: body.manager.email } });
    expect(user.passwordHash).toBeTruthy();
  });

  it('é atômico: erro em qualquer parte não deixa nada criado', async () => {
    const body = tenantBody({
      branding: { logo: `data:image/png;base64,${Buffer.from('nao e imagem').toString('base64')}` },
    });
    const r = await platform().post('/api/platform/tenants').send(body).expect(400);
    expect(r.body.code).toBe('INVALID_IMAGE');
    expect(await prisma.tenant.count({ where: { slug: body.slug } })).toBe(0);
    expect(await prisma.staffInvite.count({ where: { email: body.manager.email } })).toBe(0);
  });

  it('recusa plano inexistente e dados inválidos', async () => {
    const r = await platform().post('/api/platform/tenants').send(tenantBody({ plan: 'OURO' })).expect(400);
    expect(r.body.code).toBe('PLAN_NOT_FOUND');
    await platform().post('/api/platform/tenants').send(tenantBody({ slug: 'Com Espaço' })).expect(400);
    // O programa não vem mais pela plataforma: avisa em vez de ignorar.
    const withProgram = await platform().post('/api/platform/tenants').send(tenantBody({ program: { rewardDescription: 'x' } })).expect(400);
    expect(JSON.stringify(withProgram.body)).toContain('criado pelo gestor no painel');
    await platform().post('/api/platform/tenants').send(tenantBody({ manager: { name: 'X', email: 'invalido' } })).expect(400);
  });

  it('aceita logo e cor no cadastro', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const body = tenantBody({ branding: { logo: png, primaryColor: '#D62828' } });
    await platform().post('/api/platform/tenants').send(body).expect(201);
    const pub = await request(app.getHttpServer()).get(`/api/public/tenants/${body.slug}`).expect(200);
    expect(pub.body).toMatchObject({ primaryColor: '#D62828' });
    expect(pub.body.logoUrl).toMatch(/\/logo\?v=1$/);
  });
});

describe('Manutenção pelo admin (RN-95)', () => {
  it('adiciona unidade e não repete o slug', async () => {
    const t = await createTenant(app);
    const r = await platform().post(`/api/platform/tenants/${t.tenantId}/stores`).send({ name: 'Shopping', slug: 'shopping' }).expect(201);
    expect(r.body).toMatchObject({ name: 'Shopping', slug: 'shopping' });
    const dup = await platform().post(`/api/platform/tenants/${t.tenantId}/stores`).send({ name: 'Outro', slug: 'shopping' }).expect(409);
    expect(dup.body).toMatchObject({ code: 'STORE_SLUG_EXISTS', details: { storeId: r.body.storeId } });
    await platform().post(`/api/platform/tenants/${randomUUID()}/stores`).send({ name: 'X', slug: 'x1' }).expect(404);
  });

  it('reenvia o convite do gestor', async () => {
    const t = await createTenant(app);
    const email = `novo-gestor-${uniq()}@example.com`;
    const r = await platform().post(`/api/platform/tenants/${t.tenantId}/invites`).send({ email, name: 'Novo' }).expect(201);
    expect(lastMail(app, email).text).toContain(r.body.inviteUrl);
    const agent = await managerAgent(app, r.body.inviteUrl);
    await agent.get('/api/admin/dashboard').expect(200);
  });

  it('altera nome e plano; reduzir o limite do plano não desativa programas já ativos', async () => {
    await platform().put('/api/platform/plans/TRIO').send({ name: 'Trio', maxActivePrograms: 3 }).expect(200);
    const t = await createTenant(app, { plan: 'TRIO' });
    const pos = await managerAgent(app, t.managerInviteUrl);
    const extra = { unitLabel: 'item', goal: 5, rewardDescription: 'Brinde', maxPerEntry: 10, redeemWeekdays: [], carryOverExcess: true, active: true };
    await pos.post('/api/admin/programs').send({ ...extra, name: 'Segundo' }).expect(201);

    await platform().put('/api/platform/plans/TRIO').send({ name: 'Trio', maxActivePrograms: 1 }).expect(200);
    const list = await pos.get('/api/admin/programs').expect(200);
    expect(list.body.limit).toMatchObject({ maxActive: 1, active: 2 });
    const third = await pos.post('/api/admin/programs').send({ ...extra, name: 'Terceiro' }).expect(409);
    expect(third.body.code).toBe('PROGRAM_LIMIT_REACHED');

    const r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ name: 'Nome Novo', plan: 'PILOTO' }).expect(200);
    expect(r.body).toMatchObject({ name: 'Nome Novo', plan: 'PILOTO' });
    const plans = await platform().get('/api/platform/plans').expect(200);
    expect(plans.body.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['PILOTO', 'TRIO']));
  });

  it('código de plano inválido é recusado', async () => {
    await platform().put('/api/platform/plans/minusculo').send({ name: 'X', maxActivePrograms: 1 }).expect(400);
    await platform().put('/api/platform/plans/ZERO').send({ name: 'X', maxActivePrograms: 0 }).expect(400);
    await platform().put('/api/platform/plans/MUITOS').send({ name: 'X', maxActivePrograms: 1, maxStampIcons: 16 }).expect(400);
  });

  it('limites do selo: padrão do básico na criação e mantidos quando o plano é editado sem eles', async () => {
    const created = await platform().put('/api/platform/plans/SELO').send({ name: 'Selo', maxActivePrograms: 1 }).expect(200);
    expect(created.body).toMatchObject({ maxStampIcons: 5, customStampImage: false });
    await platform().put('/api/platform/plans/SELO').send({ name: 'Selo', maxActivePrograms: 1, maxStampIcons: 15, customStampImage: true }).expect(200);
    const edited = await platform().put('/api/platform/plans/SELO').send({ name: 'Selo 2', maxActivePrograms: 2 }).expect(200);
    expect(edited.body).toMatchObject({ name: 'Selo 2', maxStampIcons: 15, customStampImage: true });
  });

  it('estabelecimento inexistente responde 404', async () => {
    await platform().get(`/api/platform/tenants/${randomUUID()}`).expect(404);
    await platform().post(`/api/platform/tenants/${randomUUID()}/suspend`).expect(404);
    await platform().get('/api/platform/tenants/nao-uuid').expect(400);
  });
});

describe('Suspensão (RN-95)', () => {
  it('bloqueia caixa, painel e novas entradas; o cliente continua vendo o cartão', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 3).expect(201);
    const newcomer = await customerAgent(app);

    await platform().post(`/api/platform/tenants/${t.tenantId}/suspend`).expect(200);

    expect((await pos.get('/api/admin/dashboard').expect(403)).body.code).toBe('TENANT_SUSPENDED');
    expect((await pos.get('/api/pos/recent').expect(403)).body.code).toBe('TENANT_SUSPENDED');
    await pos.post('/api/pos/checkout-tokens').send({ quantity: 1 }).expect(403);
    const me = await pos.get('/api/staff/auth/me').expect(200);
    expect(me.body.context.tenantStatus).toBe('SUSPENDED');

    expect((await newcomer.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(403)).body.code).toBe('TENANT_SUSPENDED');
    const pub = await request(app.getHttpServer()).get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body.active).toBe(false);
    const cards = await c.agent.get('/api/me/memberships').expect(200);
    expect(cards.body[0]).toMatchObject({ balance: 3, tenant: { active: false } });

    const list = await platform().get('/api/platform/tenants').expect(200);
    expect(list.body.find((x: { id: string }) => x.id === t.tenantId)).toMatchObject({ status: 'SUSPENDED', customers: 1 });

    await platform().post(`/api/platform/tenants/${t.tenantId}/reactivate`).expect(200);
    await pos.get('/api/admin/dashboard').expect(200);
    await newcomer.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
  });
});

describe('Segurança e auditoria (RN-91, RN-96)', () => {
  it('registra cada chamada com ação, alvo, status e IP, sem guardar segredos', async () => {
    const t = await createTenant(app);
    await platform().post(`/api/platform/tenants/${t.tenantId}/stores`).send({ name: 'Praia', slug: 'praia' }).expect(201);
    const row = await auditFor('POST /api/platform/tenants/:id/stores', t.tenantId);
    expect(row).toMatchObject({ targetType: 'tenant', statusCode: 201, payloadSummary: { name: 'Praia', slug: 'praia' } });
    expect(row.sourceIp).toBeTruthy();

    // Chamadas que falham também são registradas.
    await platform().post(`/api/platform/tenants/${t.tenantId}/stores`).send({ name: 'Praia', slug: 'praia' }).expect(409);
    await auditFor('POST /api/platform/tenants/:id/stores', t.tenantId, 409);

    // Campos sensíveis são ocultados.
    await platform().put('/api/platform/plans/AUDIT').send({ name: 'Audit', maxActivePrograms: 1, apiKey: 'segredo' }).expect(200);
    const plan = await auditFor('PUT /api/platform/plans/:code');
    expect(JSON.stringify(plan.payloadSummary)).not.toContain('segredo');
  });

  it('tentativas sem chave válida também ficam no log', async () => {
    await request(app.getHttpServer()).get('/api/platform/plans').set('X-Platform-Key', 'errada').expect(401);
    const row = await auditFor('GET /api/platform/plans [recusado]');
    expect(row.statusCode).toBe(401);
  });

  it('a lista de IPs permitidos é aplicada quando configurada', async () => {
    const previous = process.env.PLATFORM_ALLOWED_IPS;
    try {
      process.env.PLATFORM_ALLOWED_IPS = '10.9.9.9';
      const r = await platform().get('/api/platform/plans').expect(403);
      expect(r.body.code).toBe('IP_NOT_ALLOWED');
      process.env.PLATFORM_ALLOWED_IPS = '127.0.0.1,::1';
      await platform().get('/api/platform/plans').expect(200);
    } finally {
      process.env.PLATFORM_ALLOWED_IPS = previous ?? '';
    }
  });
});

describe('Planos: grade, validade e unidades extras', () => {
  it('a grade padrão vem semeada com preços, limites e recursos', async () => {
    const r = await platform().get('/api/platform/plans').expect(200);
    const byCode = Object.fromEntries(r.body.map((p: { code: string }) => [p.code, p]));
    expect(byCode.ESSENCIAL).toMatchObject({ priceCents: 5990, maxActivePrograms: 1, maxStaff: 2, reports: false });
    expect(byCode.PROFISSIONAL).toMatchObject({ priceCents: 7990, maxStaff: 5, extraStorePriceCents: 3990, reports: true });
    expect(byCode.REDE).toMatchObject({ maxActivePrograms: null, includedStores: 3, networkDashboard: true });
    // O PILOTO libera o mesmo que o Profissional, com valor personalizado (sem preço de tabela).
    const { code: _p, name: _pn, priceCents, supportChannel: _ps, listed, tenants: _pt, _count: _pk, ...pilot } = byCode.PILOTO;
    const { code: _c, name: _n, priceCents: _pc, supportChannel: _s, listed: _l, tenants: _t, _count: _k, ...pro } = byCode.PROFISSIONAL;
    expect(priceCents).toBe(0);
    expect(listed).toBe(false); // só quem está no Piloto o vê em Meu plano
    expect(pilot).toEqual(pro);
  });

  it('plano criado só com o nome herda o Essencial; null deixa o limite ilimitado', async () => {
    const created = await platform().put('/api/platform/plans/NOVO').send({ name: 'Novo' }).expect(200);
    expect(created.body).toMatchObject({ maxStaff: 2, maxActivePrograms: 1, priceCents: 5990 });
    const edited = await platform().put('/api/platform/plans/NOVO').send({ name: 'Novo', maxStaff: null }).expect(200);
    expect(edited.body).toMatchObject({ maxStaff: null });
  });

  it('depois da validade vale o Essencial; sem validade volta ao contratado', async () => {
    const t = await createTenant(app, { plan: 'PROFISSIONAL', planExpiresAt: '2099-12-31' });
    let r = await platform().get(`/api/platform/tenants/${t.tenantId}`).expect(200);
    expect(r.body).toMatchObject({ plan: 'PROFISSIONAL', effectivePlan: 'PROFISSIONAL', planExpired: false });
    expect(new Date(r.body.planExpiresAt).toISOString()).toBe('2100-01-01T02:59:59.999Z');

    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ planExpiresAt: '2020-01-01T00:00:00Z' }).expect(200);
    expect(r.body).toMatchObject({ plan: 'PROFISSIONAL', effectivePlan: 'ESSENCIAL', planExpired: true });

    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ planExpiresAt: null }).expect(200);
    expect(r.body).toMatchObject({ effectivePlan: 'PROFISSIONAL', planExpired: false, planExpiresAt: null });

    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ planExpiresAt: 'amanhã' }).expect(400);
  });

  it('o PILOTO vale por 1 mês quando a validade não é informada', async () => {
    const months = (iso: string) => {
      const d = new Date(iso);
      const now = new Date();
      return (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + d.getUTCMonth() - now.getUTCMonth();
    };
    const t = await createTenant(app, { plan: 'PILOTO' });
    let r = await platform().get(`/api/platform/tenants/${t.tenantId}`).expect(200);
    expect(r.body).toMatchObject({ plan: 'PILOTO', effectivePlan: 'PILOTO', planExpired: false });
    expect(months(r.body.planExpiresAt)).toBeGreaterThanOrEqual(1);
    expect(months(r.body.planExpiresAt)).toBeLessThanOrEqual(2); // no fim do mês, o fim do dia em Brasília já é o dia seguinte em UTC
    expect(new Date(r.body.planExpiresAt).toISOString()).toMatch(/T02:59:59.999Z$/);

    // Saindo do PILOTO sem informar validade, o plano novo fica sem validade.
    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ plan: 'PROFISSIONAL' }).expect(200);
    expect(r.body).toMatchObject({ plan: 'PROFISSIONAL', planExpiresAt: null });

    // Voltando ao PILOTO, ganha de novo 1 mês; validade informada vale sobre o padrão.
    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ plan: 'PILOTO' }).expect(200);
    expect(r.body.planExpiresAt).not.toBeNull();
    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ plan: 'ESSENCIAL', planExpiresAt: '2099-12-31' }).expect(200);
    expect(new Date(r.body.planExpiresAt).toISOString()).toBe('2100-01-01T02:59:59.999Z');

    const open = await createTenant(app, { plan: 'PILOTO', planExpiresAt: null });
    r = await platform().get(`/api/platform/tenants/${open.tenantId}`).expect(200);
    expect(r.body.planExpiresAt).toBeNull();
  });

  it('unidades extras somam às inclusas, mas não valem com o plano vencido', async () => {
    const t = await createTenant(app, { plan: 'REDE' });
    let r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ extraStores: 2 }).expect(200);
    expect(r.body).toMatchObject({ extraStores: 2, maxStores: 5 });
    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ planExpiresAt: '2020-01-01' }).expect(200);
    expect(r.body).toMatchObject({ effectivePlan: 'ESSENCIAL', maxStores: 1 });
  });
});

describe('Segmento e endereço estruturado', () => {
  it('cria com segmento e endereço pelo CEP; o PATCH troca o segmento', async () => {
    const t = await createTenant(app, {
      segment: 'PIZZARIA',
      store: { name: 'Centro', slug: 'centro', address: { cep: '01001-000', street: 'Praça da Sé', number: '1', city: 'São Paulo', state: 'SP' } },
    });
    let r = await platform().get(`/api/platform/tenants/${t.tenantId}`).expect(200);
    expect(r.body).toMatchObject({ segment: 'PIZZARIA', showInDirectory: true });
    expect(r.body.stores[0]).toMatchObject({ address: 'Praça da Sé, 1 - São Paulo/SP', addressFields: { cep: '01001000', state: 'SP' } });

    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ segment: 'CAFETERIA' }).expect(200);
    expect(r.body.segment).toBe('CAFETERIA');
    r = await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ showInDirectory: false }).expect(200);
    expect(r.body).toMatchObject({ showInDirectory: false, segment: 'CAFETERIA' });
    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ segment: 'XYZ' }).expect(400);
  });
});
