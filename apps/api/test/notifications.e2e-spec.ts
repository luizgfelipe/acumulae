/**
 * Notificações no app do cliente (sino) e avisos do estabelecimento para quem aceitou promoções.
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createTenant, credit, customerAgent, managerAgent, personalQr, redeem, resetDb, resolveQr } from './helpers';

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

async function store(over: Record<string, unknown> = {}) {
  const t = await createTenant(app, over);
  const pos = await managerAgent(app, t.managerInviteUrl);
  return { t, pos };
}

/** Cliente com cartão no estabelecimento (1 lançamento pelo QR). */
async function member(pos: Awaited<ReturnType<typeof store>>['pos'], quantity = 1) {
  const c = await customerAgent(app);
  const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
  const cr = await credit(pos, ref, quantity).expect(201);
  return { c, ref, entryId: cr.body.entryId as string };
}

describe('notificações automáticas', () => {
  it('lançamento, recompensa, resgate e estorno viram notificações, da mais nova para a mais antiga', async () => {
    const { t, pos } = await store();
    const { c, ref, entryId } = await member(pos, 3);

    let r = await c.agent.get('/api/me/notifications').expect(200);
    expect(r.body.unread).toBe(1);
    expect(r.body.items[0]).toMatchObject({
      kind: 'CREDITO',
      title: `+3 rodízios no Tenant ${t.slug}`,
      read: false,
      tenant: { name: `Tenant ${t.slug}`, slug: t.slug },
    });
    expect(r.body.items[0].membershipId).toBeTruthy();

    await credit(pos, ref, 7).expect(201); // completa o cartão
    const rd = await redeem(pos, ref).expect(201);
    // Desfaz o resgate e depois o primeiro consumo (que cancela a recompensa devolvida).
    await pos.post(`/api/admin/ledger/${rd.body.entryIds[0]}/reverse`).send({ reason: 'Resgate por engano' }).expect(200);
    await pos.post(`/api/admin/ledger/${entryId}/reverse`).send({ reason: 'Lançado errado' }).expect(200);

    r = await c.agent.get('/api/me/notifications').expect(200);
    expect(r.body.items.map((n: { kind: string }) => n.kind)).toEqual(['ESTORNO', 'ESTORNO', 'RESGATE', 'RECOMPENSA_LIBERADA', 'CREDITO']);
    expect(r.body.items[0].body).toBe('O estabelecimento estornou 3 rodízios. 1 recompensa foi cancelada. Seu cartão está com 7 de 10.');
    expect(r.body.items[1]).toMatchObject({ title: `Resgate desfeito no Tenant ${t.slug}`, body: 'A recompensa "1 rodízio grátis" voltou para o seu cartão.' });
    expect(r.body.unread).toBe(5);
  });

  it('replay do mesmo lançamento (idempotência) não duplica a notificação', async () => {
    const { pos } = await store();
    const c = await customerAgent(app);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    const key = randomUUID();
    await credit(pos, ref, 1, key).expect(201);
    await credit(pos, ref, 1, key);
    const r = await c.agent.get('/api/me/notifications/unread-count').expect(200);
    expect(r.body).toEqual({ unread: 1 });
  });

  it('marca uma ou todas como lidas; ninguém lê ou marca as de outro cliente', async () => {
    const { pos } = await store();
    const { c, ref } = await member(pos);
    await credit(pos, ref, 1).expect(201);
    const intruder = await customerAgent(app);

    const list = await c.agent.get('/api/me/notifications').expect(200);
    const [first] = list.body.items;
    expect((await intruder.agent.get('/api/me/notifications').expect(200)).body.items).toEqual([]);
    await intruder.agent.post(`/api/me/notifications/${first.id}/read`).expect(200);
    expect((await c.agent.get('/api/me/notifications/unread-count')).body.unread).toBe(2);

    expect((await c.agent.post(`/api/me/notifications/${first.id}/read`).expect(200)).body).toEqual({ unread: 1 });
    expect((await c.agent.post('/api/me/notifications/read-all').expect(200)).body).toEqual({ unread: 0 });
    const after = await c.agent.get('/api/me/notifications').expect(200);
    expect(after.body.items.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  it('pagina com cursor', async () => {
    const { pos } = await store();
    const { c, ref } = await member(pos);
    for (let i = 0; i < 4; i++) await credit(pos, ref, 1).expect(201);
    const p1 = await c.agent.get('/api/me/notifications?limit=3').expect(200);
    expect(p1.body.items).toHaveLength(3);
    expect(p1.body.nextCursor).toBe(p1.body.items[2].id);
    const p2 = await c.agent.get(`/api/me/notifications?limit=3&cursor=${p1.body.nextCursor}`).expect(200);
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
    const ids = [...p1.body.items, ...p2.body.items].map((n: { id: string }) => n.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('exige login', async () => {
    await request(app.getHttpServer()).get('/api/me/notifications').expect(401);
  });

  it('excluir a conta apaga as notificações', async () => {
    const { pos } = await store();
    const { c } = await member(pos);
    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'EXCLUIR' }).expect(200);
    expect(await prisma.notification.count({ where: { customerId: c.id } })).toBe(0);
  });
});

describe('avisos do estabelecimento', () => {
  async function consenting(pos: Awaited<ReturnType<typeof store>>['pos'], consent: boolean | null) {
    const m = await member(pos);
    const cards = await m.c.agent.get('/api/me/memberships').expect(200);
    if (consent !== null) {
      await m.c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: consent }).expect(200);
    }
    await m.c.agent.post('/api/me/notifications/read-all').expect(200);
    return m.c;
  }

  it('só quem aceitou promoções recebe; o painel mostra o público e o histórico', async () => {
    const { pos } = await store();
    const yes = await consenting(pos, true);
    const no = await consenting(pos, false);
    const unasked = await consenting(pos, null);

    let o = await pos.get('/api/admin/announcements').expect(200);
    expect(o.body).toMatchObject({ audience: 1, usage: { used: 0, max: 1 }, items: [] });

    const sent = await pos.post('/api/admin/announcements').send({ title: 'Rodízio em dobro', body: 'Só nesta terça!' }).expect(201);
    expect(sent.body.recipients).toBe(1);

    const got = await yes.agent.get('/api/me/notifications').expect(200);
    expect(got.body.unread).toBe(1);
    expect(got.body.items[0]).toMatchObject({ kind: 'AVISO', title: 'Rodízio em dobro', body: 'Só nesta terça!', read: false });
    expect(got.body.items[0].membershipId).toBeTruthy();
    for (const c of [no, unasked]) expect((await c.agent.get('/api/me/notifications/unread-count')).body.unread).toBe(0);

    o = await pos.get('/api/admin/announcements').expect(200);
    expect(o.body.usage.used).toBe(1);
    expect(o.body.items[0]).toMatchObject({ title: 'Rodízio em dobro', recipients: 1, sentBy: 'Gestor Teste' });
    expect((await pos.get('/api/admin/plan').expect(200)).body.limits.announcementsPerMonth).toEqual({ used: 1, max: 1 });
  });

  it('cliente com 2 cartões no mesmo estabelecimento recebe uma vez só', async () => {
    const { t, pos } = await store({ plan: 'PROFISSIONAL' });
    const created = await pos
      .post('/api/admin/programs')
      .send({ name: 'Sobremesas', unitLabel: 'sobremesa', goal: 5, rewardDescription: '1 sobremesa', maxPerEntry: 10, redeemWeekdays: [], carryOverExcess: true, active: true })
      .expect(201);
    const p2 = { body: created.body.items.find((p: { name: string }) => p.name === 'Sobremesas') as { id: string } };
    const c = await customerAgent(app);
    const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    await pos.post('/api/pos/credits').set('Idempotency-Key', `a-${t.slug}`).send({ customerRef: ref, quantity: 1, programId: t.programId }).expect(201);
    await pos.post('/api/pos/credits').set('Idempotency-Key', `b-${t.slug}`).send({ customerRef: ref, quantity: 1, programId: p2.body.id }).expect(201);
    const cards = await c.agent.get('/api/me/memberships').expect(200);
    await c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: true }).expect(200);

    const sent = await pos.post('/api/admin/announcements').send({ title: 'Novidade', body: 'Cardápio novo' }).expect(201);
    expect(sent.body.recipients).toBe(1);
  });

  it('sem ninguém para receber, não envia nem gasta o limite', async () => {
    const { pos } = await store();
    await consenting(pos, false);
    const r = await pos.post('/api/admin/announcements').send({ title: 'Olá', body: 'Teste de aviso' }).expect(409);
    expect(r.body.code).toBe('NO_RECIPIENTS');
    expect((await pos.get('/api/admin/announcements').expect(200)).body.usage.used).toBe(0);
  });

  it('respeita o limite do plano no mês', async () => {
    const { pos } = await store(); // Essencial: 1 por mês
    await consenting(pos, true);
    await pos.post('/api/admin/announcements').send({ title: 'Aviso', body: 'Texto do aviso' }).expect(201);
    const r = await pos.post('/api/admin/announcements').send({ title: 'Mais um', body: 'Texto do aviso' }).expect(409);
    expect(r.body.code).toBe('ANNOUNCEMENT_LIMIT_REACHED');
  });

  it('valida título e texto', async () => {
    const { pos } = await store();
    await pos.post('/api/admin/announcements').send({ title: 'a', body: 'Texto do aviso' }).expect(400);
    await pos.post('/api/admin/announcements').send({ title: 'Título', body: 'x'.repeat(501) }).expect(400);
  });

  it('só o gestor envia avisos', async () => {
    await request(app.getHttpServer()).post('/api/admin/announcements').send({ title: 'Olá', body: 'Teste' }).expect(401);
  });
});

describe('notificações pelos filtros dos relatórios', () => {
  async function client(pos: Awaited<ReturnType<typeof store>>['pos'], opts: { consent: boolean; birthDate?: string; daysAgo?: number }) {
    const m = await member(pos);
    if (opts.birthDate) await m.c.agent.patch('/api/me').send({ birthDate: opts.birthDate }).expect(200);
    const cards = await m.c.agent.get('/api/me/memberships').expect(200);
    await m.c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: opts.consent }).expect(200);
    if (opts.daysAgo) {
      await prisma.membership.update({ where: { id: cards.body[0].membershipId }, data: { lastVisitAt: new Date(Date.now() - opts.daysAgo * 86_400_000) } });
    }
    await m.c.agent.post('/api/me/notifications/read-all').expect(200);
    return m.c;
  }
  const unread = async (c: Awaited<ReturnType<typeof client>>) => (await c.agent.get('/api/me/notifications/unread-count')).body.unread;

  it('inativos há 30 dias: prévia e envio só para quem está no filtro e aceitou promoções', async () => {
    const { pos } = await store({ plan: 'PROFISSIONAL' });
    const goneYes = await client(pos, { consent: true, daysAgo: 40 });
    const goneNo = await client(pos, { consent: false, daysAgo: 40 });
    const recent = await client(pos, { consent: true });

    const p = await pos.get('/api/admin/announcements/preview').query({ type: 'inactive', days: 30 }).expect(200);
    expect(p.body).toEqual({ total: 2, audience: 1, usage: { used: 0, max: 8 } });

    const sent = await pos
      .post('/api/admin/announcements')
      .send({ title: 'Saudade de você', body: 'Volte esta semana e ganhe um selo extra.', segment: { type: 'inactive', days: 30 } })
      .expect(201);
    expect(sent.body.recipients).toBe(1);
    expect(await unread(goneYes)).toBe(1);
    expect(await unread(goneNo)).toBe(0);
    expect(await unread(recent)).toBe(0);

    const o = await pos.get('/api/admin/announcements').expect(200);
    expect(o.body.items[0]).toMatchObject({ segment: 'inactive:30', recipients: 1 });
    expect(o.body.usage.used).toBe(1); // conta no limite do plano
  });

  it('aniversariantes do mês', async () => {
    const { pos } = await store({ plan: 'PROFISSIONAL' });
    const may = await client(pos, { consent: true, birthDate: '1990-05-12' });
    const june = await client(pos, { consent: true, birthDate: '1990-06-01' });
    await pos
      .post('/api/admin/announcements')
      .send({ title: 'Feliz aniversário', body: 'Um rodízio por nossa conta.', segment: { type: 'birthdays', month: 5 } })
      .expect(201);
    expect(await unread(may)).toBe(1);
    expect(await unread(june)).toBe(0);
  });

  it('filtro sem ninguém que aceitou não gasta o limite; plano sem relatórios não usa filtros', async () => {
    const { pos } = await store({ plan: 'PROFISSIONAL' });
    await client(pos, { consent: false, daysAgo: 100 });
    const r = await pos.post('/api/admin/announcements').send({ title: 'Olá', body: 'Volte!', segment: { type: 'inactive', days: 90 } }).expect(409);
    expect(r.body.code).toBe('NO_RECIPIENTS');
    expect((await pos.get('/api/admin/announcements').expect(200)).body.usage.used).toBe(0);
    await pos.post('/api/admin/announcements').send({ title: 'Olá', body: 'Volte!', segment: { type: 'inactive', days: 45 } }).expect(400);

    const basic = await store({ plan: 'ESSENCIAL' });
    await basic.pos.get('/api/admin/announcements/preview').query({ type: 'inactive', days: 30 }).expect(403);
    const f = await basic.pos.post('/api/admin/announcements').send({ title: 'Olá', body: 'Volte!', segment: { type: 'birthdays', month: 1 } }).expect(403);
    expect(f.body.code).toBe('PLAN_FEATURE_UNAVAILABLE');
  });

  it('envio pelo filtro alcança quem está em outras páginas do relatório', async () => {
    const { pos } = await store({ plan: 'PROFISSIONAL' });
    const all = [];
    for (let i = 0; i < 3; i++) all.push(await client(pos, { consent: true, daysAgo: 40 }));
    const page1 = await pos.get('/api/admin/reports/inactive?days=30&pageSize=1').expect(200);
    expect(page1.body).toMatchObject({ total: 3, pageSize: 1 });
    expect(page1.body.items).toHaveLength(1);

    const sent = await pos
      .post('/api/admin/announcements')
      .send({ title: 'Saudade', body: 'Volte!', segment: { type: 'inactive', days: 30 } })
      .expect(201);
    expect(sent.body.recipients).toBe(3);
    for (const c of all) expect(await unread(c)).toBe(1);
  });

  it('histórico de enviadas paginado no servidor', async () => {
    const { pos } = await store({ plan: 'REDE' });
    await client(pos, { consent: true });
    for (const title of ['Primeira', 'Segunda', 'Terceira']) {
      await pos.post('/api/admin/announcements').send({ title, body: 'Novidade' }).expect(201);
    }
    const p1 = await pos.get('/api/admin/announcements?pageSize=2').expect(200);
    expect(p1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(p1.body.items.map((a: { title: string }) => a.title)).toEqual(['Terceira', 'Segunda']);
    const p2 = await pos.get('/api/admin/announcements?pageSize=2&page=2').expect(200);
    expect(p2.body.items.map((a: { title: string }) => a.title)).toEqual(['Primeira']);
  });
});
