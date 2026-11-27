/**
 * Unidade de cadastro do cartão (QR do balcão de cada unidade, `?u=`) e notificações por unidade.
 */
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { PLATFORM_KEY, createApp, createTenant, credit, customerAgent, http, managerAgent, personalQr, resetDb, resolveQr } from './helpers';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

/** Estabelecimento na Rede com as unidades Centro (a do caixa) e Joinville. */
async function network() {
  const t = await createTenant(app, { plan: 'REDE' });
  const pos = await managerAgent(app, t.managerInviteUrl);
  const j = await http(app)
    .post(`/api/platform/tenants/${t.tenantId}/stores`)
    .set('X-Platform-Key', PLATFORM_KEY)
    .send({ name: 'Joinville', slug: 'joinville' })
    .expect(201);
  return { t, pos, centroId: t.storeId, joinvilleId: j.body.storeId as string };
}

const signupStores = (tenantId: string, customerId: string) =>
  prisma.membership.findMany({ where: { tenantId, customerId }, select: { signupStoreId: true } }).then((r) => r.map((m) => m.signupStoreId));

describe('unidade de cadastro', () => {
  it('entrar pelo QR de uma unidade grava a unidade no cartão', async () => {
    const { t, joinvilleId } = await network();
    const c = await customerAgent(app);
    await c.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'joinville' }).expect(201);
    expect(await signupStores(t.tenantId, c.id)).toEqual([joinvilleId]);
  });

  it('sem unidade (ou desconhecida) com várias unidades fica sem; depois, o QR de uma unidade preenche', async () => {
    const { t, joinvilleId } = await network();
    const c = await customerAgent(app);
    await c.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'nao-existe' }).expect(201);
    expect(await signupStores(t.tenantId, c.id)).toEqual([null]);
    await c.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'joinville' }).expect(201);
    expect(await signupStores(t.tenantId, c.id)).toEqual([joinvilleId]);
    // A primeira unidade vale: entrar pelo QR de outra não troca.
    await c.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'centro' }).expect(201);
    expect(await signupStores(t.tenantId, c.id)).toEqual([joinvilleId]);
  });

  it('com uma única unidade, o cartão é dela mesmo sem o ?u=', async () => {
    const t = await createTenant(app);
    const c = await customerAgent(app);
    await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
    expect(await signupStores(t.tenantId, c.id)).toEqual([t.storeId]);
  });

  it('cartão criado no caixa fica com a unidade do lançamento', async () => {
    const { t, pos, centroId } = await network();
    const c = await customerAgent(app);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await credit(pos, ref, 1).expect(201);
    expect(await signupStores(t.tenantId, c.id)).toEqual([centroId]);
  });
});

describe('notificação por unidade', () => {
  async function consent(c: Awaited<ReturnType<typeof customerAgent>>, value: boolean) {
    const cards = await c.agent.get('/api/me/memberships').expect(200);
    await c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: value }).expect(200);
  }
  const avisos = (customerId: string) => prisma.notification.count({ where: { customerId, kind: 'AVISO' } });

  it('vai só para os clientes da unidade (cadastro nela ou lançamento nela) e conta 1 no limite', async () => {
    const { t, pos, joinvilleId } = await network();
    // A: entrou pelo QR de Joinville e ainda não ganhou selo.
    const a = await customerAgent(app);
    await a.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'joinville' }).expect(201);
    await consent(a, true);
    // B: só frequenta o Centro (cartão criado no caixa do Centro).
    const b = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(b.agent))).customerRef, 1).expect(201);
    await consent(b, true);
    // C: entrou pelo QR do Centro e ganhou selo em Joinville.
    const c = await customerAgent(app);
    await c.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'centro' }).expect(201);
    await consent(c, true);
    await pos.post('/api/staff/auth/context').send({ tenantId: t.tenantId, storeId: joinvilleId }).expect(200);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 1).expect(201);
    // D: de Joinville, mas não aceitou promoções.
    const d = await customerAgent(app);
    await d.agent.post('/api/me/memberships').send({ slug: t.slug, store: 'joinville' }).expect(201);
    await consent(d, false);

    const p = await pos.get('/api/admin/announcements/preview').query({ type: 'all', storeId: joinvilleId }).expect(200);
    expect(p.body).toMatchObject({ total: 3, audience: 2 });

    const sent = await pos.post('/api/admin/announcements').send({ title: 'Joinville', body: 'Novidade na unidade', storeId: joinvilleId }).expect(201);
    expect(sent.body.recipients).toBe(2);
    expect([await avisos(a.id), await avisos(b.id), await avisos(c.id), await avisos(d.id)]).toEqual([1, 0, 1, 0]);

    const o = await pos.get('/api/admin/announcements').expect(200);
    expect(o.body.usage.used).toBe(1);
    expect(o.body.stores.map((s: { name: string }) => s.name)).toEqual(['Centro', 'Joinville']);
    expect(o.body.items[0]).toMatchObject({ segment: 'all', store: { id: joinvilleId, name: 'Joinville' } });

    // Combina com os filtros dos relatórios: aniversariantes de Joinville (ninguém informou a data).
    const r = await pos
      .post('/api/admin/announcements')
      .send({ title: 'Parabéns', body: 'Mimo do mês', segment: { type: 'birthdays', month: 1 }, storeId: joinvilleId })
      .expect(409);
    expect(r.body.code).toBe('NO_RECIPIENTS');
    expect(r.body.message).toContain('da unidade Joinville');
  });

  it('recusa unidade de outro estabelecimento', async () => {
    const { pos } = await network();
    const other = await createTenant(app);
    await pos.get('/api/admin/announcements/preview').query({ type: 'all', storeId: other.storeId }).expect(400);
    const r = await pos.post('/api/admin/announcements').send({ title: 'Olá', body: 'Teste de aviso', storeId: other.storeId }).expect(400);
    expect(r.body.code).toBe('INVALID_STORE');
  });
});
