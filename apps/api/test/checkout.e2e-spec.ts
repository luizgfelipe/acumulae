/**
 * QR temporário (seção 5.5, fluxo 6.5): o atendente gera, o cliente escaneia.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CustomerAuthService } from '../src/auth/customer-auth.service';
import { SessionsService } from '../src/auth/sessions.service';
import { sha256 } from '../src/common/crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { PLATFORM_KEY, createApp, createTenant, customerAgent, ensurePlan, managerAgent, phone, resetDb, uniq } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  await resetDb(app);
  await ensurePlan(app, 'DUO', 2);
});

afterAll(async () => {
  await app.close();
});

async function setup(tenant: Record<string, unknown> = {}) {
  const t = await createTenant(app, tenant);
  const pos = await managerAgent(app, t.managerInviteUrl);
  const qr = async (body: Record<string, unknown> = { quantity: 2 }) => {
    const r = await pos.post('/api/pos/checkout-tokens').send(body).expect(201);
    return { id: r.body.id as string, token: (r.body.url as string).split('/').pop()!, body: r.body };
  };
  return { t, pos, qr };
}

describe('Geração (RN-40 a RN-43)', () => {
  it('gera um link /c/{token} opaco, com a quantidade, válido por 10 minutos', async () => {
    const { qr } = await setup();
    const { id, token, body } = await qr({ quantity: 3 });
    expect(body.url).toBe(`http://localhost:3000/c/${token}`);
    expect(token).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(body.quantity).toBe(3);
    const minutes = (new Date(body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9.5);
    expect(minutes).toBeLessThanOrEqual(10);

    // Só o hash fica no banco; o token não carrega dados de negócio.
    const row = await prisma.checkoutToken.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('fica vinculado ao estabelecimento, unidade e funcionário (RN-42)', async () => {
    const { t, qr } = await setup();
    const { id } = await qr();
    const row = await prisma.checkoutToken.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ tenantId: t.tenantId, storeId: t.storeId, programId: t.programId });
    expect(row.staffUserId).toBeTruthy();
  });

  it('respeita o máximo por lançamento', async () => {
    const { pos } = await setup();
    const r = await pos.post('/api/pos/checkout-tokens').send({ quantity: 21 }).expect(400);
    expect(r.body.code).toBe('QUANTITY_ABOVE_LIMIT');
    await pos.post('/api/pos/checkout-tokens').send({ quantity: 0 }).expect(400);
  });

  it('com dois programas ativos, o atendente escolhe o programa', async () => {
    const { pos, qr } = await setup({ plan: 'DUO' });
    const list = await pos
      .post('/api/admin/programs')
      .send({ name: 'Sobremesas', unitLabel: 'sobremesa', goal: 5, rewardDescription: 'Doce', maxPerEntry: 10, redeemWeekdays: [], carryOverExcess: true })
      .expect(201);
    const desserts = list.body.items.find((p: { name: string }) => p.name === 'Sobremesas');
    const missing = await pos.post('/api/pos/checkout-tokens').send({ quantity: 1 }).expect(400);
    expect(missing.body.code).toBe('PROGRAM_REQUIRED');

    const { token } = await qr({ quantity: 1, programId: desserts.id });
    const c = await customerAgent(app);
    const r = await c.agent.post(`/api/c/${token}/claim`).expect(200);
    expect(r.body.card).toMatchObject({ programId: desserts.id, balance: 1 });
  });
});

describe('Escaneamento (RN-44)', () => {
  it('a página pública mostra estabelecimento, quantidade e meta, sem exigir login', async () => {
    const { qr } = await setup({ name: 'Sushi Teste' });
    const { token } = await qr({ quantity: 2 });
    const r = await http().get(`/api/c/${token}`).expect(200);
    expect(r.body).toMatchObject({
      status: 'PENDING',
      quantity: 2,
      storeName: 'Centro',
      tenant: { name: 'Sushi Teste', active: true },
      program: { goal: 10, unitLabel: 'rodízio', unitLabelPlural: 'rodízios', rewardDescription: '1 rodízio grátis' },
    });
  });

  it('cliente novo se cadastra e recebe o crédito no mesmo fluxo', async () => {
    const { t, qr } = await setup();
    const { id, token } = await qr({ quantity: 2 });
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/register')
      .send({ name: 'Cliente Novo', phone: phone(), email: `novo-${uniq()}@example.com`, password: 'Senha#Forte1', acceptTerms: true })
      .expect(201);
    const r = await agent.post(`/api/c/${token}/claim`).expect(200);
    expect(r.body).toMatchObject({ quantity: 2, replay: false, card: { balance: 2, goal: 10 } });

    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { tenantId: t.tenantId, type: 'CREDITO' } });
    expect(entry).toMatchObject({ source: 'QR_TEMPORARIO', checkoutTokenId: id, storeId: t.storeId, quantity: 2 });
    expect(entry.staffUserId).toBeTruthy();
  });

  it('cliente com conta, mas deslogado: entra e o crédito sai ao concluir', async () => {
    const { qr } = await setup();
    const c = await customerAgent(app);
    const { token } = await qr();
    await c.agent.post('/api/auth/logout').expect(200);
    await c.agent.post(`/api/c/${token}/claim`).expect(401);
    await c.agent.post('/api/auth/login').send({ identifier: c.phone, password: c.password }).expect(200);
    const r = await c.agent.post(`/api/c/${token}/claim`).expect(200);
    expect(r.body.card.balance).toBe(2);
  });

  it('o mesmo cliente tocando de novo não credita duas vezes', async () => {
    const { t, qr } = await setup();
    const c = await customerAgent(app);
    const { token } = await qr();
    await c.agent.post(`/api/c/${token}/claim`).expect(200);
    const again = await c.agent.post(`/api/c/${token}/claim`).expect(200);
    expect(again.body).toMatchObject({ replay: true, card: { balance: 2 } });
    expect(await prisma.ledgerEntry.count({ where: { tenantId: t.tenantId, type: 'CREDITO' } })).toBe(1);
  });

  it('outro cliente não usa um QR já usado (RN-41)', async () => {
    const { qr } = await setup();
    const a = await customerAgent(app);
    const b = await customerAgent(app);
    const { token } = await qr();
    await a.agent.post(`/api/c/${token}/claim`).expect(200);
    const r = await b.agent.post(`/api/c/${token}/claim`).expect(410);
    expect(r.body.code).toBe('TOKEN_USED');
    const info = await http().get(`/api/c/${token}`).expect(200);
    expect(info.body.status).toBe('USED');
  });

  it('perfil incompleto (login social sem telefone) precisa completar antes', async () => {
    const { qr } = await setup();
    const { token } = await qr();
    const social = await app.get(CustomerAuthService).resolveSocial({
      provider: 'GOOGLE',
      subject: `g-${uniq()}`,
      email: `s-${uniq()}@example.com`,
      emailVerified: true,
      name: 'Sem Telefone',
    });
    if (social.kind !== 'ok') throw new Error('esperava conta');
    const s = await app.get(SessionsService).create('customer', social.customer.id, null);
    const r = await http().post(`/api/c/${token}/claim`).set('Authorization', `Bearer ${s.accessToken}`).expect(409);
    expect(r.body.code).toBe('PROFILE_INCOMPLETE');
    expect((await http().get(`/api/c/${token}`).expect(200)).body.status).toBe('PENDING');
  });

  it('se o programa foi desativado, o QR não credita e continua pendente', async () => {
    const { t, pos, qr } = await setup();
    const { token } = await qr();
    await pos.post(`/api/admin/programs/${t.programId}/deactivate`).expect(200);
    const c = await customerAgent(app);
    const r = await c.agent.post(`/api/c/${token}/claim`).expect(409);
    expect(r.body.code).toBe('PROGRAM_INACTIVE');
    expect((await http().get(`/api/c/${token}`).expect(200)).body.status).toBe('PENDING');
  });

  it('código inválido ou inexistente responde 404', async () => {
    const c = await customerAgent(app);
    expect((await http().get('/api/c/curto').expect(404)).body.code).toBe('TOKEN_NOT_FOUND');
    expect((await http().get('/api/c/AAAAAAAAAAAAAAAAAAAAAA').expect(404)).body.code).toBe('TOKEN_NOT_FOUND');
    await c.agent.post('/api/c/AAAAAAAAAAAAAAAAAAAAAA/claim').expect(404);
  });

  it('tenant suspenso: a página avisa e o QR não credita', async () => {
    const { t, qr } = await setup();
    const { token } = await qr();
    await http().post(`/api/platform/tenants/${t.tenantId}/suspend`).set('X-Platform-Key', PLATFORM_KEY).expect(200);
    const info = await http().get(`/api/c/${token}`).expect(200);
    expect(info.body.tenant.active).toBe(false);
    const c = await customerAgent(app);
    expect((await c.agent.post(`/api/c/${token}/claim`).expect(403)).body.code).toBe('TENANT_SUSPENDED');
    expect(await prisma.ledgerEntry.count({ where: { tenantId: t.tenantId } })).toBe(0);
  });
});

describe('Acompanhamento e cancelamento no caixa (RN-45, RN-46)', () => {
  it('o caixa acompanha PENDING → USED com o nome abreviado', async () => {
    const { pos, qr } = await setup();
    const c = await customerAgent(app, { name: 'Maria Silva Souza' });
    const { id, token } = await qr();
    expect((await pos.get(`/api/pos/checkout-tokens/${id}`).expect(200)).body).toMatchObject({ status: 'PENDING', customerName: null });
    await c.agent.post(`/api/c/${token}/claim`).expect(200);
    const st = await pos.get(`/api/pos/checkout-tokens/${id}`).expect(200);
    expect(st.body).toMatchObject({ status: 'USED', customerName: 'Maria S.' });
    expect(st.body.usedAt).toBeTruthy();
  });

  it('o caixa vê quando o QR expirou', async () => {
    const { pos, qr } = await setup();
    const { id } = await qr();
    await prisma.checkoutToken.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await pos.get(`/api/pos/checkout-tokens/${id}`).expect(200)).body.status).toBe('EXPIRED');
  });

  it('cancelar um QR já usado não desfaz o crédito', async () => {
    const { t, pos, qr } = await setup();
    const c = await customerAgent(app);
    const { id, token } = await qr();
    await c.agent.post(`/api/c/${token}/claim`).expect(200);
    const r = await pos.delete(`/api/pos/checkout-tokens/${id}`).expect(200);
    expect(r.body.status).toBe('USED');
    expect(await prisma.ledgerEntry.count({ where: { tenantId: t.tenantId, type: 'CREDITO' } })).toBe(1);
  });

  it('o QR de um estabelecimento não é visto nem cancelado por outro', async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await a.qr();
    await b.pos.get(`/api/pos/checkout-tokens/${id}`).expect(404);
    await b.pos.delete(`/api/pos/checkout-tokens/${id}`).expect(404);
    expect((await a.pos.get(`/api/pos/checkout-tokens/${id}`).expect(200)).body.status).toBe('PENDING');
  });
});
