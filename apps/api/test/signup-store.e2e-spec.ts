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
