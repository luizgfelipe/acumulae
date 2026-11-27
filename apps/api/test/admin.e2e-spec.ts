/**
 * Painel do gestor (seção 7.3): indicadores, clientes, movimentações, funcionários, unidades e identidade visual.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CepService } from '../src/cep/cep.service';
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

/** Estabelecimento novo com o gestor logado. Padrão: plano ESSENCIAL. */
async function setup(overrides: Record<string, unknown> = {}) {
  const t = await createTenant(app, overrides);
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
    // Com duas unidades (com uma só, ela é atribuída sozinha).
    const { pos } = await twoStores();
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

  /** Estabelecimento com duas unidades (a segunda criada pela plataforma). */
  async function twoStores() {
    const s = await setup();
    const extra = await http()
      .post(`/api/platform/tenants/${s.t.tenantId}/stores`)
      .set('X-Platform-Key', PLATFORM_KEY)
      .send({ name: 'Shopping', slug: 'shopping' })
      .expect(201);
    return { ...s, shoppingId: extra.body.storeId as string };
  }
  const memberOf = async (pos: Awaited<ReturnType<typeof setup>>['pos'], email: string) =>
    (await pos.get('/api/admin/staff').expect(200)).body.members.find((x: { email: string }) => x.email === email);

  it('o gestor troca as unidades de um atendente, e o acesso muda na hora', async () => {
    const { t, pos, shoppingId } = await twoStores();
    const att = await attendantAgent(app, pos, [t.storeId]);
    const m = await memberOf(pos, att.email);

    const r = await pos.patch(`/api/admin/staff/${m.membershipId}`).send({ storeIds: [shoppingId] }).expect(200);
    const updated = r.body.members.find((x: { email: string }) => x.email === att.email);
    expect(updated.stores.map((st: { id: string }) => st.id)).toEqual([shoppingId]);

    // Perdeu o Centro: a sessão que estava lá precisa escolher a unidade de novo.
    const pos403 = await att.agent.get('/api/pos/recent').expect(403);
    expect(pos403.body.code).toBe('NO_STORE_CONTEXT');
    await att.agent.post('/api/staff/auth/context').send({ tenantId: t.tenantId, storeId: t.storeId }).expect(403);
    await att.agent.post('/api/staff/auth/context').send({ tenantId: t.tenantId, storeId: shoppingId }).expect(200);
  });

  it('atendente não fica sem unidade, nem com unidade de outro estabelecimento', async () => {
    const { t, pos } = await twoStores();
    const other = await createTenant(app);
    const att = await attendantAgent(app, pos, [t.storeId]);
    const m = await memberOf(pos, att.email);
    const none = await pos.patch(`/api/admin/staff/${m.membershipId}`).send({ storeIds: [] }).expect(400);
    expect(none.body.code).toBe('STORES_REQUIRED');
    const foreign = await pos.patch(`/api/admin/staff/${m.membershipId}`).send({ storeIds: [other.storeId] }).expect(400);
    expect(foreign.body.code).toBe('INVALID_STORE');
  });

  it('tornar um gestor atendente exige escolher as unidades (com mais de uma)', async () => {
    const { pos, shoppingId } = await twoStores();
    const email = `gestor2-${Date.now()}@example.com`;
    const inv = await pos.post('/api/admin/staff').send({ name: 'Gestor 2', email, role: 'MANAGER' }).expect(201);
    await managerAgent(app, inv.body.inviteUrl);
    const m = await memberOf(pos, email);
    const r = await pos.patch(`/api/admin/staff/${m.membershipId}`).send({ role: 'ATTENDANT' }).expect(400);
    expect(r.body.code).toBe('STORES_REQUIRED');
    const ok = await pos.patch(`/api/admin/staff/${m.membershipId}`).send({ role: 'ATTENDANT', storeIds: [shoppingId] }).expect(200);
    expect(ok.body.members.find((x: { email: string }) => x.email === email)).toMatchObject({ role: 'ATTENDANT', stores: [{ id: shoppingId, name: 'Shopping' }] });
  });

  it('com uma unidade só, o convite de atendente já sai com ela', async () => {
    const { t, pos } = await setup();
    await pos.post('/api/admin/staff').send({ email: `unica-${Date.now()}@example.com`, role: 'ATTENDANT' }).expect(201);
    const staff = await pos.get('/api/admin/staff').expect(200);
    expect(staff.body.pendingInvites[0].stores).toEqual([{ id: t.storeId, name: expect.any(String) }]);
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
    const { t, pos } = await setup({ plan: 'REDE' });
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

  it('cor secundária e modelo de cartão: sem secundária por padrão, salvar, remover e validar', async () => {
    const { t, pos } = await setup({ plan: 'PROFISSIONAL' });
    const before = await pos.get('/api/admin/profile').expect(200);
    expect(before.body.branding).toMatchObject({ secondaryColor: null, cardStyle: 'CLASSICO' });

    const r = await pos.put('/api/admin/branding').send({ secondaryColor: '#FFD166', cardStyle: 'DEGRADE' }).expect(200);
    expect(r.body.branding).toMatchObject({ secondaryColor: '#FFD166', cardStyle: 'DEGRADE', version: before.body.branding.version + 1 });
    // Só a secundária e o modelo mudaram; a principal fica como estava.
    expect(r.body.branding.primaryColor).toBe(before.body.branding.primaryColor);
    const pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body).toMatchObject({ secondaryColor: '#FFD166', cardStyle: 'DEGRADE' });

    const cleared = await pos.put('/api/admin/branding').send({ secondaryColor: null }).expect(200);
    expect(cleared.body.branding).toMatchObject({ secondaryColor: null, cardStyle: 'DEGRADE' });

    await pos.put('/api/admin/branding').send({ secondaryColor: 'amarelo' }).expect(400);
    await pos.put('/api/admin/branding').send({ cardStyle: 'NEON' }).expect(400);
    await pos.put('/api/admin/branding').send({}).expect(400);
  });
});

describe('Ícone e imagem do selo por plano', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const platform = () => ({
    put: (url: string) => http().put(url).set('X-Platform-Key', PLATFORM_KEY),
    patch: (url: string) => http().patch(url).set('X-Platform-Key', PLATFORM_KEY),
  });

  it('o básico libera só os 5 primeiros ícones e não aceita imagem própria', async () => {
    const { t, pos } = await setup();
    const profile = await pos.get('/api/admin/profile').expect(200);
    expect(profile.body.branding.stampIcon).toBe('check');
    expect(profile.body.stampOptions).toMatchObject({ customImage: false });
    expect(profile.body.stampOptions.icons).toHaveLength(15);
    expect(profile.body.stampOptions.allowedIcons).toEqual(['check', 'star', 'heart', 'coffee', 'utensils']);

    const r = await pos.put('/api/admin/branding').send({ stampIcon: 'star' }).expect(200);
    expect(r.body.branding.stampIcon).toBe('star');
    const pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body).toMatchObject({ stampIcon: 'star', stampImageUrl: null });

    const blocked = await pos.put('/api/admin/branding').send({ stampIcon: 'pizza' }).expect(403);
    expect(blocked.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
    await pos.put('/api/admin/branding').send({ stampIcon: 'nao-existe' }).expect(400);
    const img = await pos.put('/api/admin/branding/stamp-image').send({ image: PNG }).expect(403);
    expect(img.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
  });

  it('plano acima libera os 15 ícones e a imagem própria, servida com cache pela versão', async () => {
    const { t, pos } = await setup();
    await platform().put('/api/platform/plans/MAIS').send({ name: 'Mais', maxActivePrograms: 1, maxStampIcons: 15, customStampImage: true }).expect(200);
    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ plan: 'MAIS' }).expect(200);

    await pos.put('/api/admin/branding').send({ stampIcon: 'pizza' }).expect(200);
    const r = await pos.put('/api/admin/branding/stamp-image').send({ image: PNG }).expect(200);
    const url: string = r.body.branding.stampImageUrl;
    expect(url).toMatch(new RegExp(`^/api/public/tenants/${t.slug}/stamp\\?v=\\d+$`));
    const file = await http().get(url).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cache-control']).toContain('immutable');

    // Arquivo que não é imagem e imagem grande demais são recusados.
    await pos
      .put('/api/admin/branding/stamp-image')
      .send({ image: `data:image/png;base64,${Buffer.from('nao sou uma imagem').toString('base64')}` })
      .expect(400);
    await pos
      .put('/api/admin/branding/stamp-image')
      .send({ image: `data:image/png;base64,${Buffer.alloc(70 * 1024).toString('base64')}` })
      .expect(400);

    const removed = await pos.delete('/api/admin/branding/stamp-image').expect(200);
    expect(removed.body.branding).toMatchObject({ stampImageUrl: null, stampIcon: 'pizza' });
    await http().get(`/api/public/tenants/${t.slug}/stamp`).expect(404);
  });

  it('fora do plano vigente o visual cai no padrão, mas fica guardado e volta no upgrade', async () => {
    const { t, pos } = await setup({ plan: 'PROFISSIONAL' });
    await pos.put('/api/admin/branding').send({ stampIcon: 'fish', secondaryColor: '#FFD166', cardStyle: 'MOLDURA' }).expect(200);
    await pos.put('/api/admin/branding/stamp-image').send({ image: PNG }).expect(200);

    // Vencido: vale o Essencial.
    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ planExpiresAt: '2020-01-01' }).expect(200);
    let pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body).toMatchObject({ stampIcon: 'check', secondaryColor: null, cardStyle: 'CLASSICO', stampImageUrl: null });
    await pos.put('/api/admin/branding').send({ stampIcon: 'crown' }).expect(403);
    const blocked = await pos.put('/api/admin/branding').send({ secondaryColor: '#000000' }).expect(403);
    expect(blocked.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
    // Voltar ao padrão e mudar a cor principal continuam permitidos.
    await pos.put('/api/admin/branding').send({ primaryColor: '#123456', cardStyle: 'CLASSICO' }).expect(200);

    // Renovado: o que estava guardado volta (o modelo foi trocado para Clássico acima).
    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ planExpiresAt: null }).expect(200);
    pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body).toMatchObject({ stampIcon: 'fish', secondaryColor: '#FFD166', cardStyle: 'CLASSICO' });
    expect(pub.body.stampImageUrl).toMatch(/\/stamp\?v=\d+$/);
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

describe('Limites do plano vigente', () => {
  const platform = () => ({
    patch: (url: string) => http().patch(url).set('X-Platform-Key', PLATFORM_KEY),
  });

  it('Essencial: até 2 funcionários contando o gestor e os convites pendentes', async () => {
    const { pos } = await setup({ plan: 'ESSENCIAL' });
    const invite = (n: number) => pos.post('/api/admin/staff').send({ name: `Atendente ${n}`, email: `a${n}-${Date.now()}@example.com`, role: 'MANAGER' });
    await invite(1).expect(201);
    const r = await invite(2).expect(409);
    expect(r.body.code).toBe('STAFF_LIMIT_REACHED');

    const plan = await pos.get('/api/admin/plan').expect(200);
    expect(plan.body.limits.staff).toEqual({ used: 2, max: 2 });
  });

  it('Profissional: até 5 funcionários', async () => {
    const { pos } = await setup({ plan: 'PROFISSIONAL' });
    for (let n = 0; n < 4; n++) {
      await pos.post('/api/admin/staff').send({ name: `G${n}`, email: `g${n}-${Date.now()}@example.com`, role: 'MANAGER' }).expect(201);
    }
    const plan = await pos.get('/api/admin/plan').expect(200);
    expect(plan.body.limits.staff).toEqual({ used: 5, max: 5 });
    const r = await pos.post('/api/admin/staff').send({ name: 'G5', email: `g5-${Date.now()}@example.com`, role: 'MANAGER' }).expect(409);
    expect(r.body.code).toBe('STAFF_LIMIT_REACHED');
  });

  it('unidades: inclusas + extras; reativar também respeita o limite', async () => {
    const { t, pos } = await setup({ plan: 'PROFISSIONAL' });
    const extra = await pos.post('/api/admin/stores').send({ name: 'Shopping', slug: 'shopping' }).expect(409);
    expect(extra.body.code).toBe('STORE_LIMIT_REACHED');
    expect(extra.body.message).toContain('R$ 59,90');

    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ extraStores: 1 }).expect(200);
    await pos.post('/api/admin/stores').send({ name: 'Shopping', slug: 'shopping' }).expect(201);
    const stores = await pos.get('/api/admin/stores').expect(200);
    const shopping = stores.body.find((s: { slug: string }) => s.slug === 'shopping');
    await pos.patch(`/api/admin/stores/${shopping.id}`).send({ status: 'INACTIVE' }).expect(200);
    await pos.post('/api/admin/stores').send({ name: 'Bairro', slug: 'bairro' }).expect(201);
    await pos.patch(`/api/admin/stores/${shopping.id}`).send({ status: 'ACTIVE' }).expect(409);
  });

  it('downgrade não desativa o que já existe; só bloqueia criar além do limite', async () => {
    const { t, pos } = await setup({ plan: 'REDE' });
    await pos.post('/api/admin/stores').send({ name: 'Shopping', slug: 'shopping' }).expect(201);
    await platform().patch(`/api/platform/tenants/${t.tenantId}`).send({ plan: 'ESSENCIAL' }).expect(200);
    const plan = await pos.get('/api/admin/plan').expect(200);
    expect(plan.body.limits.stores).toMatchObject({ used: 2, max: 1 });
    await pos.post('/api/admin/stores').send({ name: 'Bairro', slug: 'bairro' }).expect(409);
  });

  it('clientes ativos acima do limite só aparecem no plano; o caixa continua lançando', async () => {
    const { pos } = await setup({ plan: 'ESSENCIAL' });
    const c = await customerAgent(app);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await credit(pos, ref, 1).expect(201);
    const plan = await pos.get('/api/admin/plan').expect(200);
    expect(plan.body).toMatchObject({
      plan: { code: 'ESSENCIAL', priceCents: 5990, supportChannel: 'EMAIL' },
      expired: false,
      limits: { activePrograms: { used: 1, max: 1 } },
      features: { reports: false, customerExport: false, networkDashboard: false, cardCustomization: false },
    });
  });

  it('plano vencido mostra o contratado e vale o Essencial', async () => {
    const { t, pos } = await setup({ plan: 'REDE', planExpiresAt: '2020-01-01' });
    const plan = await pos.get('/api/admin/plan').expect(200);
    expect(plan.body).toMatchObject({ plan: { code: 'ESSENCIAL' }, contracted: { code: 'REDE' }, expired: true });
    expect(plan.body.limits.stores).toMatchObject({ max: 1, extraPriceCents: null });
    expect(t.tenantId).toBeDefined();
  });
});

describe('Relatórios e exportação (Profissional)', () => {
  /** Cliente com cartão no estabelecimento (1 selo pelo QR) e, opcionalmente, aniversário e consentimento. */
  async function member(pos: Awaited<ReturnType<typeof setup>>['pos'], opts: { birthDate?: string; consent?: boolean; name?: string } = {}) {
    const c = await customerAgent(app, { name: opts.name });
    if (opts.birthDate) await c.agent.patch('/api/me').send({ birthDate: opts.birthDate }).expect(200);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await credit(pos, ref, 1).expect(201);
    if (opts.consent !== undefined) {
      const cards = await c.agent.get('/api/me/memberships').expect(200);
      await c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: opts.consent }).expect(200);
    }
    return c;
  }

  it('Essencial não tem relatórios nem exportação', async () => {
    const { pos } = await setup({ plan: 'ESSENCIAL' });
    for (const url of ['/api/admin/reports/birthdays', '/api/admin/reports/inactive?days=30', '/api/admin/reports/staff', '/api/admin/customers/export.csv']) {
      const r = await pos.get(url).expect(403);
      expect(r.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
    }
  });

  it('aniversariantes do mês, um por cliente, com telefone só para quem aceitou promoções', async () => {
    const { pos } = await setup({ plan: 'PROFISSIONAL' });
    await member(pos, { name: 'Ana Março', birthDate: '1990-03-20', consent: true });
    await member(pos, { name: 'Bia Março', birthDate: '1985-03-05', consent: false });
    await member(pos, { name: 'Caio Abril', birthDate: '1990-04-01' });
    const r = await pos.get('/api/admin/reports/birthdays?month=3').expect(200);
    expect(r.body.month).toBe(3);
    expect(r.body.items.map((i: { name: string; day: number }) => [i.name, i.day])).toEqual([
      ['Bia Março', 5],
      ['Ana Março', 20],
    ]);
    expect(r.body.items[1].phone).toMatch(/^\+55/);
    expect(r.body.items[0].phone).toContain('*');
    await pos.get('/api/admin/reports/birthdays?month=13').expect(400);
  });

  it('aniversariantes paginados no servidor, por dia e nome', async () => {
    const { pos } = await setup({ plan: 'PROFISSIONAL' });
    for (const [name, day] of [['Duda', 9], ['Edu', 2], ['Fê', 9], ['Gil', 30], ['Hugo', 15]] as const) {
      await member(pos, { name, birthDate: `1990-07-${String(day).padStart(2, '0')}` });
    }
    const p1 = await pos.get('/api/admin/reports/birthdays?month=7&pageSize=2').expect(200);
    expect(p1.body).toMatchObject({ month: 7, total: 5, page: 1, pageSize: 2 });
    expect(p1.body.items.map((i: { name: string }) => i.name)).toEqual(['Edu', 'Duda']);
    const p3 = await pos.get('/api/admin/reports/birthdays?month=7&pageSize=2&page=3').expect(200);
    expect(p3.body.items.map((i: { name: string }) => i.name)).toEqual(['Gil']);
  });

  it('inativos: só cartões sem visita há mais de N dias', async () => {
    const { t, pos } = await setup({ plan: 'PROFISSIONAL' });
    const old = await member(pos, { name: 'Sumida' });
    await member(pos, { name: 'Recente' });
    await prisma.membership.updateMany({ where: { tenantId: t.tenantId, customerId: old.id }, data: { lastVisitAt: new Date(Date.now() - 45 * 86_400_000) } });

    const d30 = await pos.get('/api/admin/reports/inactive?days=30').expect(200);
    expect(d30.body.items.map((i: { name: string }) => i.name)).toEqual(['Sumida']);
    const d60 = await pos.get('/api/admin/reports/inactive?days=60').expect(200);
    expect(d60.body.total).toBe(0);
    await pos.get('/api/admin/reports/inactive?days=45').expect(400);
  });

  it('por funcionário: lançamentos, uso do telefone e créditos estornados', async () => {
    const { pos } = await setup({ plan: 'PROFISSIONAL' });
    const c = await customerAgent(app);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await credit(pos, ref, 2).expect(201);
    const byPhone = await pos.get('/api/pos/customers').query({ phone: c.phone }).expect(200);
    const second = await credit(pos, byPhone.body.customerRef, 1).expect(201);
    await pos.post(`/api/admin/ledger/${second.body.entryId}/reverse`).send({ reason: 'lançado errado' }).expect(200);

    const r = await pos.get('/api/admin/reports/staff').expect(200);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ name: 'Gestor Teste', credits: 2, stamps: 3, phoneCredits: 1, phoneShare: 0.5, reversedCredits: 1 });
  });

  it('CSV com todos que aceitaram os termos atuais (com a coluna de promoções), BOM e células protegidas contra fórmulas', async () => {
    const { pos } = await setup({ plan: 'PROFISSIONAL' });
    await member(pos, { name: '=HIPERLINK("x")', consent: true });
    await member(pos, { name: 'Sem Consentimento', consent: false });
    const old = await member(pos, { name: 'Termos Antigos' });
    await prisma.customer.update({ where: { id: old.id }, data: { termsVersion: null } });
    const r = await pos.get('/api/admin/customers/export.csv').buffer(true).parse((res, cb) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (data += c));
      res.on('end', () => cb(null, data));
    }).expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="clientes-.+\.csv"/);
    const body = r.body as string;
    expect(body.startsWith('﻿Nome;Telefone')).toBe(true);
    expect(body).toContain(`"'=HIPERLINK(""x"")"`);
    const lines = body.split('\r\n');
    expect(lines[0]).toContain(';Aceita promoções;');
    expect(lines.find((l) => l.includes('HIPERLINK'))).toContain(';Sim;');
    expect(lines.find((l) => l.includes('Sem Consentimento'))).toContain(';Não;');
    expect(body).not.toContain('Termos Antigos');
  });
});

describe('Painel consolidado da rede (plano Rede)', () => {
  it('Profissional não tem o painel da rede', async () => {
    const { pos } = await setup({ plan: 'PROFISSIONAL' });
    const r = await pos.get('/api/admin/network').expect(403);
    expect(r.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
  });

  it('compara as unidades no mês e conta cada cliente uma vez no total', async () => {
    const { t, pos } = await setup({ plan: 'REDE' });
    await pos.post('/api/admin/stores').send({ name: 'Shopping', slug: 'shopping' }).expect(201);
    const c = await customerAgent(app);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await credit(pos, ref, 2).expect(201);

    // Mesmo cliente compra também na outra unidade.
    const stores = await pos.get('/api/admin/stores').expect(200);
    const shopping = stores.body.find((s: { slug: string }) => s.slug === 'shopping');
    await pos.post('/api/staff/auth/context').send({ tenantId: t.tenantId, storeId: shopping.id }).expect(200);
    const ref2 = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await credit(pos, ref2, 3).expect(201);

    const r = await pos.get('/api/admin/network').expect(200);
    const byName = Object.fromEntries(r.body.items.map((i: { name: string }) => [i.name, i]));
    expect(byName.Centro).toMatchObject({ stamps: 2, visits: 1, newCustomers: 1, activeCustomers: 1 });
    expect(byName.Shopping).toMatchObject({ stamps: 3, visits: 1, newCustomers: 0, activeCustomers: 1 });
    expect(r.body.totals).toMatchObject({ stamps: 5, visits: 2, newCustomers: 1, activeCustomers: 1 });
  });
});

describe('Endereço pelo CEP e segmento', () => {
  const found = { cep: '89201000', street: 'Rua do Príncipe', district: 'Centro', city: 'Joinville', state: 'SC' as const };
  let cep: CepService;
  let calls: string[];

  beforeEach(() => {
    cep = app.get(CepService);
    cep.clearCache();
    calls = [];
  });
  afterAll(() => {
    cep.providers = original;
  });
  let original: CepService['providers'];
  beforeAll(() => {
    original = app.get(CepService).providers;
  });

  const provider = (name: string, fn: (c: string) => Promise<typeof found | null>) => ({
    name,
    lookup: (c: string) => {
      calls.push(name);
      return fn(c);
    },
  });

  it('busca o endereço, usa o reserva quando o principal cai e guarda em cache', async () => {
    const { pos } = await setup();
    cep.providers = [provider('a', () => Promise.reject(new Error('fora do ar'))), provider('b', async () => found)];

    const r = await pos.get('/api/admin/cep/89201-000').expect(200);
    expect(r.body).toEqual(found);
    await pos.get('/api/admin/cep/89201000').expect(200);
    expect(calls).toEqual(['a', 'b']);
  });

  it('CEP inexistente, inválido e serviços fora do ar', async () => {
    const { pos } = await setup();
    cep.providers = [provider('a', async () => null), provider('b', async () => null)];
    expect((await pos.get('/api/admin/cep/00000000').expect(404)).body.code).toBe('CEP_NOT_FOUND');
    expect((await pos.get('/api/admin/cep/123').expect(400)).body.code).toBe('CEP_INVALID');

    cep.providers = [provider('a', () => Promise.reject(new Error('x')))];
    expect((await pos.get('/api/admin/cep/01001000').expect(503)).body.code).toBe('CEP_UNAVAILABLE');
  });

  it('só o gestor consulta o CEP', async () => {
    await http().get('/api/admin/cep/89201000').expect(401);
  });

  it('o perfil grava o endereço estruturado e o segmento', async () => {
    const { pos } = await setup();
    let r = await pos.get('/api/admin/profile').expect(200);
    expect(r.body.tenant).toMatchObject({ segment: null, showInDirectory: true });
    expect(r.body.segments.map((s: { code: string }) => s.code)).toContain('RESTAURANTE');

    r = await pos
      .put('/api/admin/profile')
      .send({ address: { ...found, cep: '89201-000', number: '330', complement: null }, segment: 'JAPONESA' })
      .expect(200);
    expect(r.body.tenant.segment).toBe('JAPONESA');
    expect(r.body.store).toMatchObject({
      address: 'Rua do Príncipe, 330 - Centro, Joinville/SC',
      addressFields: { cep: '89201000', number: '330', city: 'Joinville', state: 'SC' },
    });

    // Só o segmento: o endereço continua.
    r = await pos.put('/api/admin/profile').send({ segment: null }).expect(200);
    expect(r.body.tenant.segment).toBeNull();
    expect(r.body.store.addressFields.city).toBe('Joinville');

    r = await pos.put('/api/admin/profile').send({ showInDirectory: false }).expect(200);
    expect(r.body.tenant).toMatchObject({ showInDirectory: false, segment: null });

    await pos.put('/api/admin/profile').send({ segment: 'INEXISTENTE' }).expect(400);
    await pos.put('/api/admin/profile').send({ address: { ...found, state: 'XX' } }).expect(400);
  });

  it('a unidade nova guarda cidade e UF', async () => {
    const { pos } = await setup({ plan: 'REDE' });
    const r = await pos
      .post('/api/admin/stores')
      .send({ name: 'Shopping', slug: 'shopping', address: { ...found, number: null } })
      .expect(201);
    const s = r.body.find((x: { slug: string }) => x.slug === 'shopping');
    expect(s).toMatchObject({ address: 'Rua do Príncipe, S/N - Centro, Joinville/SC', addressFields: { city: 'Joinville', state: 'SC' } });
    const row = await prisma.store.findFirstOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ city: 'Joinville', state: 'SC', cep: '89201000' });
  });
});

describe('Comparar planos (Meu plano)', () => {
  // Outros testes criam planos próprios; aqui interessa a grade padrão.
  const GRID = ['PILOTO', 'ESSENCIAL', 'PROFISSIONAL', 'REDE'];
  const codes = (items: Array<{ code: string }>) => items.map((p) => p.code).filter((c) => GRID.includes(c));
  it('lista os planos do mais barato ao mais caro, sem o Piloto para quem não está nele', async () => {
    const { pos } = await setup({ plan: 'ESSENCIAL' });
    const r = await pos.get('/api/admin/plans').expect(200);
    expect(r.body.current).toBe('ESSENCIAL');
    expect(codes(r.body.items)).toEqual(['ESSENCIAL', 'PROFISSIONAL', 'REDE']);
    expect(r.body.items.find((p: { code: string }) => p.code === 'REDE')).toMatchObject({
      name: 'Rede',
      priceCents: 19990,
      limits: { includedStores: 3, announcementsPerMonth: 30 },
      features: { networkDashboard: true, reports: true },
    });
  });

  it('quem está no Piloto vê o próprio plano na comparação', async () => {
    const { pos } = await setup({ plan: 'PILOTO' });
    const r = await pos.get('/api/admin/plans').expect(200);
    expect(r.body.current).toBe('PILOTO');
    expect(codes(r.body.items)).toEqual(['PILOTO', 'ESSENCIAL', 'PROFISSIONAL', 'REDE']);
  });

  it('a plataforma esconde um plano da comparação', async () => {
    await request(app.getHttpServer())
      .put('/api/platform/plans/REDE')
      .set('X-Platform-Key', 'test-platform-key')
      .send({ name: 'Rede', listed: false })
      .expect(200);
    const { pos } = await setup({ plan: 'ESSENCIAL' });
    const r = await pos.get('/api/admin/plans').expect(200);
    expect(codes(r.body.items)).toEqual(['ESSENCIAL', 'PROFISSIONAL']);
    await request(app.getHttpServer()).put('/api/platform/plans/REDE').set('X-Platform-Key', 'test-platform-key').send({ name: 'Rede', listed: true }).expect(200);
  });
});
