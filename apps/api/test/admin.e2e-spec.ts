/**
 * Painel do gestor (seção 7.3): indicadores, clientes, movimentações, funcionários, unidades e identidade visual.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PLATFORM_KEY,
  attendantAgent,
  createApp,
  createTenant,
  credit,
  customerAgent,
  managerAgent,
  personalQr,
  redeem,
  resetDb,
  resolveQr,
} from './helpers';

let app: INestApplication;
let prisma: PrismaService;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  await resetDb(app);
});

afterAll(async () => {
  await app.close();
});

async function setup() {
  const t = await createTenant(app);
  const pos = await managerAgent(app, t.managerInviteUrl);
  return { t, pos };
}

const todaySp = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

describe('Indicadores do mês', () => {
  it('conta clientes, selos, visitas e recompensas, descontando estornos', async () => {
    const { pos } = await setup();
    const a = await customerAgent(app);
    const b = await customerAgent(app);
    const refA = (await resolveQr(pos, await personalQr(a.agent))).customerRef;
    const refB = (await resolveQr(pos, await personalQr(b.agent))).customerRef;
    const crA = await credit(pos, refA, 3).expect(201);
    await credit(pos, refB, 12).expect(201);

    let d = await pos.get('/api/admin/dashboard').expect(200);
    expect(d.body).toMatchObject({
      members: 2,
      newMembersThisMonth: 2,
      stampsThisMonth: 15,
      visitsThisMonth: 2,
      rewardsUnlockedThisMonth: 1,
      rewardsRedeemedThisMonth: 0,
      rewardsAvailableNow: 1,
      unitLabelPlural: 'rodízios',
      activePrograms: 1,
    });

    await redeem(pos, (await resolveQr(pos, await personalQr(b.agent))).customerRef).expect(201);
    await pos.post(`/api/admin/ledger/${crA.body.entryId}/reverse`).send({ reason: 'Erro' }).expect(200);
    d = await pos.get('/api/admin/dashboard').expect(200);
    expect(d.body).toMatchObject({ stampsThisMonth: 12, visitsThisMonth: 1, rewardsRedeemedThisMonth: 1, rewardsAvailableNow: 0 });
  });
});

describe('Clientes (RN-80, seção 10)', () => {
  it('sem consentimento de marketing, telefone mascarado e sem e-mail/nascimento; com consentimento, completos', async () => {
    const { pos } = await setup();
    const c = await customerAgent(app, { name: 'Carla Souza', phone: '(47) 98555-1234' });
    await c.agent.patch('/api/me').send({ birthDate: '1992-08-15' }).expect(200);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 2).expect(201);

    let list = await pos.get('/api/admin/customers').expect(200);
    expect(list.body.items[0]).toMatchObject({ name: 'Carla Souza', phone: '(47) 9****-1234', marketingConsent: null, balance: 2, visits: 1 });
    const id = list.body.items[0].membershipId;
    let detail = await pos.get(`/api/admin/customers/${id}`).expect(200);
    expect(detail.body).toMatchObject({ phone: '(47) 9****-1234', email: null, birthDate: null });

    await c.agent.patch(`/api/me/memberships/${id}/consent`).send({ marketingConsent: true }).expect(200);
    list = await pos.get('/api/admin/customers').expect(200);
    expect(list.body.items[0].phone).toBe('+5547985551234');
    detail = await pos.get(`/api/admin/customers/${id}`).expect(200);
    expect(detail.body).toMatchObject({ email: c.email, birthDate: '1992-08-15', marketingConsent: true });
    expect(detail.body.ledger).toHaveLength(1);

    // Revogar o consentimento volta a esconder.
    await c.agent.patch(`/api/me/memberships/${id}/consent`).send({ marketingConsent: false }).expect(200);
    detail = await pos.get(`/api/admin/customers/${id}`).expect(200);
    expect(detail.body).toMatchObject({ phone: '(47) 9****-1234', email: null });
  });

  it('busca por nome ou por dígitos do telefone, com paginação', async () => {
    const { pos } = await setup();
    const names = ['Ana Lima', 'Bruno Souza', 'Carla Souza'];
    const phones = ['(47) 98000-1111', '(47) 98000-2222', '(47) 98000-3333'];
    for (let i = 0; i < 3; i++) {
      const c = await customerAgent(app, { name: names[i], phone: phones[i] });
      await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 1).expect(201);
    }
    const byName = await pos.get('/api/admin/customers').query({ search: 'souza' }).expect(200);
    expect(byName.body.items.map((i: { name: string }) => i.name).sort()).toEqual(['Bruno Souza', 'Carla Souza']);
    const byPhone = await pos.get('/api/admin/customers').query({ search: '0002222' }).expect(200);
    expect(byPhone.body.items.map((i: { name: string }) => i.name)).toEqual(['Bruno Souza']);
    const page = await pos.get('/api/admin/customers').query({ pageSize: 2, page: 2 }).expect(200);
    expect(page.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.body.items).toHaveLength(1);
  });

  it('cliente que excluiu a conta aparece anonimizado', async () => {
    const { pos } = await setup();
    const c = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 1).expect(201);
    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'EXCLUIR' }).expect(200);
    const list = await pos.get('/api/admin/customers').expect(200);
    expect(list.body.items[0]).toMatchObject({ name: 'Cliente excluído', phone: null, deleted: true, balance: 1 });
  });
});

describe('Movimentações (RN-73)', () => {
  it('filtra por tipo, cliente e período, com paginação', async () => {
    const { pos } = await setup();
    const a = await customerAgent(app);
    const b = await customerAgent(app);
    const refA = (await resolveQr(pos, await personalQr(a.agent))).customerRef;
    await credit(pos, refA, 2).expect(201);
    await credit(pos, refA, 8).expect(201); // libera recompensa
    await credit(pos, (await resolveQr(pos, await personalQr(b.agent))).customerRef, 1).expect(201);

    const all = await pos.get('/api/admin/ledger').expect(200);
    expect(all.body.total).toBe(4);
    const credits = await pos.get('/api/admin/ledger').query({ type: 'CREDITO' }).expect(200);
    expect(credits.body.total).toBe(3);
    const ofA = all.body.items.find((i: { type: string }) => i.type === 'RECOMPENSA_LIBERADA').membershipId;
    expect((await pos.get('/api/admin/ledger').query({ membershipId: ofA }).expect(200)).body.total).toBe(3);
    expect((await pos.get('/api/admin/ledger').query({ from: todaySp(), to: todaySp() }).expect(200)).body.total).toBe(4);
    expect((await pos.get('/api/admin/ledger').query({ to: '2020-01-01' }).expect(200)).body.total).toBe(0);
    const page = await pos.get('/api/admin/ledger').query({ pageSize: 1 }).expect(200);
    expect(page.body.items).toHaveLength(1);
    await pos.get('/api/admin/ledger').query({ type: 'NAO_EXISTE' }).expect(400);
  });
});

describe('Funcionários', () => {
  it('atendente precisa de pelo menos uma unidade, e só deste estabelecimento', async () => {
    const { pos } = await setup();
    const other = await createTenant(app);
    const none = await pos.post('/api/admin/staff').send({ email: 'x@example.com', role: 'ATTENDANT', storeIds: [] }).expect(400);
    expect(none.body.code).toBe('STORES_REQUIRED');
    const foreign = await pos.post('/api/admin/staff').send({ email: 'x@example.com', role: 'ATTENDANT', storeIds: [other.storeId] }).expect(400);
    expect(foreign.body.code).toBe('INVALID_STORE');
  });

  it('convite pendente aparece na lista até ser aceito', async () => {
    const { t, pos } = await setup();
    await pos.post('/api/admin/staff').send({ email: 'pendente@example.com', role: 'ATTENDANT', storeIds: [t.storeId] }).expect(201);
    const staff = await pos.get('/api/admin/staff').expect(200);
    expect(staff.body.pendingInvites.map((i: { email: string }) => i.email)).toEqual(['pendente@example.com']);
    expect(staff.body.members).toHaveLength(1);
  });

  it('o gestor não pode desativar nem rebaixar a si mesmo', async () => {
    const { pos } = await setup();
    const staff = await pos.get('/api/admin/staff').expect(200);
    const me = staff.body.members.find((m: { isMe: boolean }) => m.isMe);
    const r = await pos.patch(`/api/admin/staff/${me.membershipId}`).send({ role: 'ATTENDANT' }).expect(400);
    expect(r.body.code).toBe('CANNOT_DEMOTE_SELF');
    await pos.patch(`/api/admin/staff/${me.membershipId}`).send({ status: 'INACTIVE' }).expect(400);
  });

  it('desativar um atendente encerra as sessões dele no estabelecimento', async () => {
    const { t, pos } = await setup();
    const att = await attendantAgent(app, pos, [t.storeId]);
    await att.agent.get('/api/pos/recent').expect(200);
    const staff = await pos.get('/api/admin/staff').expect(200);
    const m = staff.body.members.find((x: { email: string }) => x.email === att.email);
    await pos.patch(`/api/admin/staff/${m.membershipId}`).send({ status: 'INACTIVE' }).expect(200);
    await att.agent.get('/api/pos/recent').expect(401);

    // Mesmo logando de novo, não tem mais acesso ao estabelecimento.
    const again = request.agent(app.getHttpServer());
    await again.post('/api/staff/auth/login').send({ email: att.email, password: att.password }).expect(200);
    const r = await again.get('/api/pos/recent').expect(403);
    expect(r.body.code).toBe('NO_TENANT_CONTEXT');
  });

  it('o atendente só opera nas unidades liberadas; o gestor, em todas', async () => {
    const { t, pos } = await setup();
    const extra = await http()
      .post(`/api/platform/tenants/${t.tenantId}/stores`)
      .set('X-Platform-Key', PLATFORM_KEY)
      .send({ name: 'Shopping', slug: 'shopping' })
      .expect(201);
    const att = await attendantAgent(app, pos, [t.storeId]);
    await att.agent.post('/api/staff/auth/context').send({ tenantId: t.tenantId, storeId: extra.body.storeId }).expect(403);
    const me = await att.agent.get('/api/staff/auth/me').expect(200);
    expect(me.body.workplaces[0].stores.map((s: { id: string }) => s.id)).toEqual([t.storeId]);
    await pos.post('/api/staff/auth/context').send({ tenantId: t.tenantId, storeId: extra.body.storeId }).expect(200);
  });
});

describe('Unidades', () => {
  it('não desativa a última unidade ativa nem repete identificador', async () => {
    const { t, pos } = await setup();
    const last = await pos.patch(`/api/admin/stores/${t.storeId}`).send({ status: 'INACTIVE' }).expect(400);
    expect(last.body.code).toBe('LAST_STORE');
    const dup = await pos.post('/api/admin/stores').send({ name: 'Outra', slug: 'centro' }).expect(409);
    expect(dup.body.code).toBe('STORE_SLUG_EXISTS');
  });

  it('caixa numa unidade desativada fica bloqueado (RN-21)', async () => {
    const { t, pos } = await setup();
    await pos.post('/api/admin/stores').send({ name: 'Shopping', slug: 'shopping' }).expect(201);
    await pos.patch(`/api/admin/stores/${t.storeId}`).send({ status: 'INACTIVE' }).expect(200);
    const r = await pos.get('/api/pos/recent').expect(403);
    expect(r.body.code).toBe('STORE_INACTIVE');
  });

  it('unidade de outro estabelecimento não é encontrada', async () => {
    const { pos } = await setup();
    const other = await createTenant(app);
    await pos.patch(`/api/admin/stores/${other.storeId}`).send({ name: 'Invasão' }).expect(404);
  });
});

describe('Identidade visual (RN-101, RN-108)', () => {
  it('trocar a cor sobe a versão e aparece para o cliente', async () => {
    const { t, pos } = await setup();
    const before = await pos.get('/api/admin/profile').expect(200);
    const r = await pos.put('/api/admin/branding').send({ primaryColor: '#123456' }).expect(200);
    expect(r.body.branding).toMatchObject({ primaryColor: '#123456', version: before.body.branding.version + 1 });
    const pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body.primaryColor).toBe('#123456');
    await pos.put('/api/admin/branding').send({ primaryColor: 'azul' }).expect(400);
  });
});

describe('Programas no painel (RN-23, RN-24)', () => {
  it('valida os campos do programa', async () => {
    const { pos } = await setup();
    const base = { name: 'Café', unitLabel: 'café', goal: 10, rewardDescription: 'Café grátis', maxPerEntry: 5, redeemWeekdays: [], carryOverExcess: true, active: false };
    await pos.post('/api/admin/programs').send({ ...base, goal: 1 }).expect(400);
    await pos.post('/api/admin/programs').send({ ...base, goal: 51 }).expect(400);
    await pos.post('/api/admin/programs').send({ ...base, redeemWeekdays: [8] }).expect(400);
    await pos.post('/api/admin/programs').send({ ...base, rewardDescription: '' }).expect(400);
    const ok = await pos.post('/api/admin/programs').send({ ...base, redeemWeekdays: [4, 1, 1] }).expect(201);
    const cafe = ok.body.items.find((p: { name: string }) => p.name === 'Café');
    expect(cafe).toMatchObject({ redeemWeekdays: [1, 4], redeemWeekdaysText: 'segunda, quinta', unitLabelPluralResolved: 'cafés' });
  });

  it('programa de outro estabelecimento não é visto nem alterado', async () => {
    const { pos } = await setup();
    const other = await createTenant(app);
    await pos.get(`/api/admin/programs/${other.programId}`).expect(404);
    await pos.post(`/api/admin/programs/${other.programId}/deactivate`).expect(404);
    await pos.delete(`/api/admin/programs/${other.programId}`).expect(404);
  });

  it('a lista mostra clientes e recompensas disponíveis por programa', async () => {
    const { t, pos } = await setup();
    const c = await customerAgent(app);
    await credit(pos, (await resolveQr(pos, await personalQr(c.agent))).customerRef, 10).expect(201);
    const list = await pos.get('/api/admin/programs').expect(200);
    expect(list.body.items.find((p: { id: string }) => p.id === t.programId)).toMatchObject({ members: 1, rewardsAvailable: 1 });
  });
});
