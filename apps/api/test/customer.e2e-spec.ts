/**
 * Área do cliente (seção 7.1): cartões, histórico, QR pessoal, consentimento (seção 10) e exclusão de conta (fluxo 6.8).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PersonalQrService } from '../src/loyalty/personal-qr.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createApp,
  createTenant,
  credit,
  customerAgent,
  ensurePlan,
  managerAgent,
  personalQr,
  resetDb,
  resolveQr,
  uniq,
} from './helpers';

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

async function store(over: Record<string, unknown> = {}) {
  const t = await createTenant(app, over);
  const pos = await managerAgent(app, t.managerInviteUrl);
  return { t, pos };
}

describe('QR pessoal (RN-50, RN-51)', () => {
  it('o app recebe um QR que identifica o cliente e vence em até 30 s', async () => {
    const c = await customerAgent(app, { name: 'Lia Santos' });
    const r = await c.agent.get('/api/me/qr').expect(200);
    expect(r.body).toMatchObject({ name: 'Lia Santos', periodSeconds: 30 });
    expect(app.get(PersonalQrService).verify(r.body.payload)).toBe(c.id);
    const ms = new Date(r.body.expiresAt).getTime() - Date.now();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it('o mesmo QR identifica o cliente em qualquer estabelecimento (RN-01)', async () => {
    const a = await store();
    const b = await store();
    const c = await customerAgent(app);
    const qr = await personalQr(c.agent);
    await credit(a.pos, (await resolveQr(a.pos, qr)).customerRef, 1).expect(201);
    await credit(b.pos, (await resolveQr(b.pos, qr)).customerRef, 2).expect(201);
    const cards = await c.agent.get('/api/me/memberships').expect(200);
    expect(cards.body.map((x: { balance: number }) => x.balance).sort()).toEqual([1, 2]);
  });
});

describe('Cartões do cliente (RN-81, RN-83)', () => {
  it('mostra só os estabelecimentos com vínculo, com saldo, meta e identidade visual', async () => {
    const { t, pos } = await store({ name: 'Sushi do Teste' });
    await store(); // outro estabelecimento sem vínculo
    const c = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 7).expect(201);
    const cards = await c.agent.get('/api/me/memberships').expect(200);
    expect(cards.body).toHaveLength(1);
    expect(cards.body[0]).toMatchObject({
      balance: 7,
      goal: 10,
      rewardsAvailable: 0,
      unitLabelPlural: 'rodízios',
      tenant: { name: 'Sushi do Teste', slug: t.slug, active: true, primaryColor: '#F26419', logoUrl: null },
    });
  });

  it('o detalhe do cartão traz regras, recompensas e histórico, sem movimentações internas', async () => {
    const { t, pos } = await store({ program: { rewardDescription: 'Brinde', goal: 5, carryOverExcess: false } });
    const c = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 7).expect(201);
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    const card = await c.agent.get(`/api/me/memberships/${m.id}`).expect(200);
    expect(card.body).toMatchObject({ balance: 0, rewardsAvailable: 1, rules: { goal: 5, rewardDescription: 'Brinde', redeemBlockedToday: null } });
    expect(card.body.rewards).toEqual([expect.objectContaining({ description: 'Brinde', status: 'DISPONIVEL' })]);
    const types = card.body.history.map((h: { type: string }) => h.type).sort();
    expect(types).toEqual(['CREDITO', 'RECOMPENSA_LIBERADA']);
    expect(card.body.history[0].storeName).toBe('Centro');
  });

  it('um cliente não abre o cartão de outro', async () => {
    const { t, pos } = await store();
    const owner = await customerAgent(app);
    const intruder = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(owner.agent))).customerRef, 1).expect(201);
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    await intruder.agent.get(`/api/me/memberships/${m.id}`).expect(404);
    await intruder.agent.patch(`/api/me/memberships/${m.id}/consent`).send({ marketingConsent: true }).expect(404);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).marketingConsent).toBeNull();
  });
});

describe('Entrada pelo QR do balcão (fluxo 6.1)', () => {
  it('a página pública mostra o programa; entrar duas vezes não duplica o cartão', async () => {
    const { t } = await store({ program: { rewardDescription: 'Sobremesa', goal: 8, redeemWeekdays: [1, 2] } });
    const pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body.programs[0]).toMatchObject({ goal: 8, rewardDescription: 'Sobremesa', redeemWeekdaysText: 'segunda, terça' });
    expect(pub.body.stores).toEqual([{ name: 'Centro', address: null, city: null, state: null }]);

    const c = await customerAgent(app);
    const first = await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
    const second = await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
    expect(second.body.membershipId).toBe(first.body.membershipId);
    expect(await prisma.membership.count({ where: { tenantId: t.tenantId } })).toBe(1);
  });

  it('com dois programas ativos, entra nos dois', async () => {
    const { t, pos } = await store({ plan: 'DUO' });
    await pos
      .post('/api/admin/programs')
      .send({ name: 'Café', unitLabel: 'café', goal: 5, rewardDescription: 'Café', maxPerEntry: 5, redeemWeekdays: [], carryOverExcess: true, active: true })
      .expect(201);
    const c = await customerAgent(app);
    const r = await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
    expect(r.body.membershipIds).toHaveLength(2);
  });

  it('estabelecimento inexistente ou sem programa ativo', async () => {
    const c = await customerAgent(app);
    await c.agent.post('/api/me/memberships').send({ slug: 'nao-existe' }).expect(404);
    await http().get('/api/public/tenants/nao-existe').expect(404);

    const { t, pos } = await store();
    await pos.post(`/api/admin/programs/${t.programId}/deactivate`).expect(200);
    const r = await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(409);
    expect(r.body.code).toBe('NO_ACTIVE_PROGRAM');
  });

  it('sem logo, o endereço do logo responde 404', async () => {
    const { t } = await store();
    await http().get(`/api/public/tenants/${t.slug}/logo`).expect(404);
  });
});

describe('Consentimento de marketing (RN-35, seção 10)', () => {
  it('é perguntado por estabelecimento: aceitar um não autoriza o outro', async () => {
    const a = await store();
    const b = await store();
    const c = await customerAgent(app);
    await c.agent.post('/api/me/memberships').send({ slug: a.t.slug }).expect(201);
    await c.agent.post('/api/me/memberships').send({ slug: b.t.slug }).expect(201);
    expect((await c.agent.get('/api/me').expect(200)).body.pendingConsents).toBe(2);

    const mA = await prisma.membership.findFirstOrThrow({ where: { tenantId: a.t.tenantId, customerId: c.id } });
    await c.agent.patch(`/api/me/memberships/${mA.id}/consent`).send({ marketingConsent: true }).expect(200);
    expect((await c.agent.get('/api/me').expect(200)).body.pendingConsents).toBe(1);
    const mB = await prisma.membership.findFirstOrThrow({ where: { tenantId: b.t.tenantId, customerId: c.id } });
    expect(mB.marketingConsent).toBeNull();
  });

  it('cartão novo no mesmo estabelecimento herda a escolha já feita', async () => {
    const { t, pos } = await store({ plan: 'DUO' });
    const c = await customerAgent(app);
    const joined = await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
    await c.agent.patch(`/api/me/memberships/${joined.body.membershipId}/consent`).send({ marketingConsent: false }).expect(200);

    const list = await pos
      .post('/api/admin/programs')
      .send({ name: 'Café', unitLabel: 'café', goal: 5, rewardDescription: 'Café', maxPerEntry: 5, redeemWeekdays: [], carryOverExcess: true, active: true })
      .expect(201);
    const cafe = list.body.items.find((p: { name: string }) => p.name === 'Café');
    const view = await resolveQr(pos, await personalQr(c.agent));
    await pos
      .post('/api/pos/credits')
      .set('Idempotency-Key', `k-${uniq()}`)
      .send({ customerRef: view.customerRef, programId: cafe.id, quantity: 1 })
      .expect(201);
    const card = await prisma.membership.findFirstOrThrow({ where: { programId: cafe.id, customerId: c.id } });
    expect(card.marketingConsent).toBe(false);
    expect((await c.agent.get('/api/me').expect(200)).body.pendingConsents).toBe(0);
  });
});

describe('Perfil', () => {
  it('o cliente altera nome e data de nascimento', async () => {
    const c = await customerAgent(app);
    const r = await c.agent.patch('/api/me').send({ name: 'Maria Nova', birthDate: '1988-12-01' }).expect(200);
    expect(r.body).toMatchObject({ name: 'Maria Nova', birthDate: '1988-12-01' });
    const cleared = await c.agent.patch('/api/me').send({ birthDate: null }).expect(200);
    expect(cleared.body.birthDate).toBeNull();
    await c.agent.patch('/api/me').send({ birthDate: '2999-01-01' }).expect(400);
  });
});

describe('Exclusão de conta (fluxo 6.8)', () => {
  it('exige a senha e a confirmação por escrito', async () => {
    const c = await customerAgent(app);
    await c.agent.delete('/api/me').send({ password: 'errada', confirm: 'EXCLUIR' }).expect(401);
    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'excluir' }).expect(400);
    await c.agent.get('/api/me').expect(200);
  });

  it('revoga consentimentos, apaga vínculos de login social e libera telefone e e-mail', async () => {
    const { pos } = await store();
    const c = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 1).expect(201);
    const m = await prisma.membership.findFirstOrThrow({ where: { customerId: c.id } });
    await c.agent.patch(`/api/me/memberships/${m.id}/consent`).send({ marketingConsent: true }).expect(200);
    await prisma.customerIdentity.create({ data: { customerId: c.id, provider: 'GOOGLE', providerSubject: `g-${uniq()}` } });

    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'EXCLUIR' }).expect(200);

    expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).marketingConsent).toBe(false);
    expect(await prisma.customerIdentity.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.customerSession.count({ where: { customerId: c.id, revokedAt: null } })).toBe(0);
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({ name: 'Cliente excluído', birthDate: null, passwordHash: null, status: 'DELETED' });

    // O mesmo telefone e e-mail podem criar uma conta nova.
    await customerAgent(app, { phone: c.phone, email: c.email });
  });
});

describe('versão dos Termos de Uso', () => {
  it('quem aceitou uma versão antiga vê o aviso e aceita a atual', async () => {
    const c = await customerAgent(app);
    expect((await c.agent.get('/api/me').expect(200)).body.termsOutdated).toBe(false);

    await app.get(PrismaService).customer.update({ where: { id: c.id }, data: { termsVersion: null } });
    expect((await c.agent.get('/api/me').expect(200)).body).toMatchObject({ termsOutdated: true, profileComplete: true });

    await c.agent.post('/api/me/terms').send({}).expect(400);
    const r = await c.agent.post('/api/me/terms').send({ acceptTerms: true }).expect(200);
    expect(r.body.termsOutdated).toBe(false);
  });
});
