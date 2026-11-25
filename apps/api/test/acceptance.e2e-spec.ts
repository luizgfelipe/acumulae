/**
 * Critérios de aceite do MVP (seção 14 da especificação), em testes de integração
 * contra um PostgreSQL real.
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { LoyaltyService } from '../src/loyalty/loyalty.service';
import { PersonalQrService } from '../src/loyalty/personal-qr.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PLATFORM_KEY,
  createApp,
  createTenant,
  credit,
  customerAgent,
  lastMail,
  managerAgent,
  personalQr,
  resetDb,
  resolveQr,
} from './helpers';

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

const http = () => request(app.getHttpServer());

describe('API da plataforma', () => {
  it('recusa chamadas sem X-Platform-Key válida com 401', async () => {
    await http().get('/api/platform/tenants').expect(401);
    await http().get('/api/platform/tenants').set('X-Platform-Key', 'errada').expect(401);
    await http().get('/api/platform/tenants').set('X-Platform-Key', PLATFORM_KEY).expect(200);
  });

  it('cadastra o estabelecimento completo com uma chamada e não duplica pelo slug', async () => {
    const t = await createTenant(app, { slug: 'sushi-x', name: 'Sushi X' });
    expect(t.managerInviteUrl).toContain('/painel/convite/');
    const dup = await http()
      .post('/api/platform/tenants')
      .set('X-Platform-Key', PLATFORM_KEY)
      .send({
        name: 'Sushi X',
        slug: 'sushi-x',
        store: { name: 'Centro', slug: 'centro' },
        manager: { name: 'G', email: 'g@example.com' },
      })
      .expect(409);
    expect(dup.body.details.tenantId).toBe(t.tenantId);
    expect(await prisma.tenant.count({ where: { slug: 'sushi-x' } })).toBe(1);
    expect(await prisma.platformAuditLog.count()).toBeGreaterThan(0);
  });

  it('o convite do gestor funciona uma única vez', async () => {
    const t = await createTenant(app);
    await managerAgent(app, t.managerInviteUrl);
    const token = t.managerInviteUrl.split('/').pop();
    await http().post(`/api/staff/invites/${token}/accept`).send({ password: 'Outra#2026' }).expect(410);
  });

  it('convite expirado não funciona', async () => {
    const t = await createTenant(app);
    await prisma.staffInvite.updateMany({ where: { tenantId: t.tenantId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const token = t.managerInviteUrl.split('/').pop();
    await http().post(`/api/staff/invites/${token}/accept`).send({ name: 'Xavier', password: 'Gestor#2026' }).expect(410);
  });
});

describe('Conta do cliente', () => {
  it('não cria conta com telefone ou e-mail já existentes', async () => {
    const c = await customerAgent(app);
    const r = await http()
      .post('/api/auth/register')
      .send({ name: 'Outra', phone: c.phone, email: 'nova@example.com', password: 'Senha#Forte1', acceptTerms: true })
      .expect(409);
    expect(r.body.code).toBe('ACCOUNT_EXISTS');
    expect(r.body.details.field).toBe('phone');
  });

  it('login por telefone ou e-mail e bloqueio após 5 erros', async () => {
    const c = await customerAgent(app);
    await http().post('/api/auth/login').send({ identifier: c.email, password: c.password }).expect(200);
    await http().post('/api/auth/login').send({ identifier: c.phone, password: c.password }).expect(200);
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/login').send({ identifier: c.email, password: 'errada' }).expect(401);
    }
    await http().post('/api/auth/login').send({ identifier: c.email, password: c.password }).expect(429);
  });

  it('rejeita senhas fracas', async () => {
    const r = await http()
      .post('/api/auth/register')
      .send({ name: 'Fraca', phone: '(47) 98888-1111', email: 'fraca@example.com', password: '123456', acceptTerms: true })
      .expect(400);
    expect(r.body.code).toBe('WEAK_PASSWORD');
  });

  it('recuperação de senha por e-mail encerra as sessões antigas', async () => {
    const c = await customerAgent(app);
    await c.agent.get('/api/me').expect(200);
    await http().post('/api/auth/password/forgot').send({ identifier: c.phone }).expect(200);
    const mail = lastMail(app, c.email);
    const token = /token=([A-Za-z0-9]+)/.exec(mail.text)![1];
    await http().post('/api/auth/password/reset').send({ token, password: 'NovaSenha#9' }).expect(200);
    await c.agent.get('/api/me').expect(401);
    await c.agent.post('/api/auth/refresh').expect(401);
    await http().post('/api/auth/password/reset').send({ token, password: 'Mais#Uma9' }).expect(400);
    await http().post('/api/auth/login').send({ identifier: c.email, password: 'NovaSenha#9' }).expect(200);
  });

  it('refresh rotativo mantém a sessão', async () => {
    const c = await customerAgent(app);
    await c.agent.post('/api/auth/refresh').expect(200);
    await c.agent.post('/api/auth/refresh').expect(200);
    await c.agent.get('/api/me').expect(200);
  });
});

describe('Consumo, recompensa e resgate', () => {
  it('libera a recompensa ao atingir a meta e carrega o excedente; o resgate reinicia o ciclo', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);

    let ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    let r = await credit(pos, ref, 9).expect(201);
    expect(r.body.card.balance).toBe(9);
    r = await credit(pos, ref, 3).expect(201);
    expect(r.body.rewardsUnlocked).toBe(1);
    expect(r.body.card.balance).toBe(2);
    expect(r.body.card.rewardsAvailable).toBe(1);

    // Cliente vê no app.
    const list = await c.agent.get('/api/me/memberships').expect(200);
    expect(list.body[0].balance).toBe(2);
    expect(list.body[0].rewardsAvailable).toBe(1);

    const view = await resolveQr(pos, await personalQr(c.agent));
    ref = view.customerRef;
    const red = await pos.post('/api/pos/redemptions').set('Idempotency-Key', randomUUID()).send({ customerRef: ref }).expect(201);
    expect(red.body.card.rewardsAvailable).toBe(0);
    expect(red.body.card.balance).toBe(2);
    expect(red.body.rewards[0].description).toBe('1 rodízio grátis');
  });

  it('lançamento repetido com a mesma chave de idempotência credita uma vez', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    const key = randomUUID();
    const [a, b] = await Promise.all([credit(pos, customerRef, 2, key), credit(pos, customerRef, 2, key)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(m.cachedBalance).toBe(2);
  });

  it('respeita o máximo por lançamento', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    const r = await credit(pos, customerRef, 21).expect(400);
    expect(r.body.code).toBe('QUANTITY_ABOVE_LIMIT');
  });

  it('busca por telefone permite lançar e usar recompensas (resgate manual)', async () => {
    const t = await createTenant(app, { program: { rewardDescription: 'Brinde', goal: 2 } });
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app, { name: 'Maria Souza' });
    const found = await pos.get('/api/pos/customers').query({ phone: c.phone }).expect(200);
    expect(found.body.name).toBe('Maria S****');
    expect(found.body.programs[0].redeem.allowed).toBe(true);
    await credit(pos, found.body.customerRef, 6).expect(201);

    // 3 recompensas disponíveis: usa 2 de uma vez.
    const r = await pos
      .post('/api/pos/redemptions')
      .set('Idempotency-Key', randomUUID())
      .send({ customerRef: found.body.customerRef, quantity: 2 })
      .expect(201);
    expect(r.body.redeemed).toBe(2);
    expect(r.body.card.rewardsAvailable).toBe(1);
    const resgates = await prisma.ledgerEntry.findMany({ where: { tenantId: t.tenantId, type: 'RESGATE' } });
    expect(resgates).toHaveLength(2);
    expect(resgates.every((e) => e.source === 'TELEFONE')).toBe(true);

    // Pedir mais do que há disponível é recusado.
    const tooMany = await pos
      .post('/api/pos/redemptions')
      .set('Idempotency-Key', randomUUID())
      .send({ customerRef: found.body.customerRef, quantity: 2 })
      .expect(409);
    expect(tooMany.body.code).toBe('NOT_ENOUGH_REWARDS');
  });

  it('resgate múltiplo repetido com a mesma chave não resgata de novo', async () => {
    const t = await createTenant(app, { program: { rewardDescription: 'Brinde', goal: 2 } });
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, customerRef, 6).expect(201);
    const key = randomUUID();
    const a = await pos.post('/api/pos/redemptions').set('Idempotency-Key', key).send({ customerRef, quantity: 2 }).expect(201);
    const b = await pos.post('/api/pos/redemptions').set('Idempotency-Key', key).send({ customerRef, quantity: 2 }).expect(201);
    expect(b.body.replay).toBe(true);
    expect(b.body.entryIds.sort()).toEqual(a.body.entryIds.sort());
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(m.cachedRewardsAvailable).toBe(1);
  });

  it('um print do QR pessoal não vale depois de 30 segundos', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const old = app.get(PersonalQrService).issue(c.id, Date.now() - 40_000).payload;
    const r = await pos.post('/api/pos/customers/resolve-qr').send({ qr: old }).expect(400);
    expect(r.body.code).toBe('INVALID_QR');
    const forged = (await personalQr(c.agent)).replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
    await pos.post('/api/pos/customers/resolve-qr').send({ qr: forged }).expect(400);
  });

  it('bloqueia o resgate fora dos dias permitidos', async () => {
    const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
    const iso = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(today) + 1;
    const other = (iso % 7) + 1;
    const t = await createTenant(app, { program: { rewardDescription: 'Brinde', goal: 2, redeemWeekdays: [other] } });
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, customerRef, 2).expect(201);
    const view = await resolveQr(pos, await personalQr(c.agent));
    const r = await pos.post('/api/pos/redemptions').set('Idempotency-Key', randomUUID()).send({ customerRef: view.customerRef }).expect(409);
    expect(r.body.code).toBe('REDEEM_NOT_ALLOWED_TODAY');
  });
});

describe('QR temporário', () => {
  async function setup() {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const ck = await pos.post('/api/pos/checkout-tokens').send({ quantity: 2 }).expect(201);
    const token = (ck.body.url as string).split('/').pop()!;
    return { t, pos, c, id: ck.body.id as string, token };
  }

  it('cliente logado escaneia e o caixa vê o crédito', async () => {
    const { pos, c, id, token } = await setup();
    const info = await http().get(`/api/c/${token}`).expect(200);
    expect(info.body.status).toBe('PENDING');
    const r = await c.agent.post(`/api/c/${token}/claim`).expect(200);
    expect(r.body.card.balance).toBe(2);
    const st = await pos.get(`/api/pos/checkout-tokens/${id}`).expect(200);
    expect(st.body.status).toBe('USED');
    expect(st.body.customerName).toBe('Maria S.');
  });

  it('dois escaneamentos simultâneos geram um único crédito', async () => {
    const { t, c, token } = await setup();
    const other = await customerAgent(app);
    const results = await Promise.all([
      c.agent.post(`/api/c/${token}/claim`),
      other.agent.post(`/api/c/${token}/claim`),
      c.agent.post(`/api/c/${token}/claim`),
    ]);
    const credits = await prisma.ledgerEntry.count({ where: { tenantId: t.tenantId, type: 'CREDITO' } });
    expect(credits).toBe(1);
    expect(results.filter((r) => r.status === 410).length).toBeGreaterThanOrEqual(1);
  });

  it('QR expirado ou cancelado não gera crédito', async () => {
    const a = await setup();
    await prisma.checkoutToken.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r1 = await a.c.agent.post(`/api/c/${a.token}/claim`).expect(410);
    expect(r1.body.code).toBe('TOKEN_EXPIRED');

    const b = await setup();
    await b.pos.delete(`/api/pos/checkout-tokens/${b.id}`).expect(200);
    const r2 = await b.c.agent.post(`/api/c/${b.token}/claim`).expect(410);
    expect(r2.body.code).toBe('TOKEN_CANCELLED');
    expect(await prisma.ledgerEntry.count({ where: { tenantId: { in: [a.t.tenantId, b.t.tenantId] } } })).toBe(0);
  });

  it('cliente sem login não consegue usar o QR', async () => {
    const { token } = await setup();
    await http().post(`/api/c/${token}/claim`).expect(401);
  });
});

describe('Estorno e auditoria', () => {
  it('estorno gera movimentação reversa, mantém a original e atualiza o saldo', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    const cr = await credit(pos, customerRef, 4).expect(201);
    await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Lançado errado' }).expect(200);
    const ledger = await pos.get('/api/admin/ledger').expect(200);
    const types = ledger.body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(expect.arrayContaining(['CREDITO', 'ESTORNO_CREDITO']));
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(m.cachedBalance).toBe(0);
    await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'De novo' }).expect(409);
  });

  it('estornar crédito que liberou recompensa cancela a recompensa ainda disponível', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, customerRef, 9).expect(201);
    const cr = await credit(pos, customerRef, 3).expect(201);
    const r = await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Erro' }).expect(200);
    expect(r.body.cancelledRewards).toBe(1);
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(m.cachedBalance).toBe(9);
    expect(m.cachedRewardsAvailable).toBe(0);
  });

  it('bloqueia o estorno se a recompensa já foi resgatada, até estornar o resgate', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    let ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    const cr = await credit(pos, ref, 10).expect(201);
    ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
    const red = await pos.post('/api/pos/redemptions').set('Idempotency-Key', randomUUID()).send({ customerRef: ref }).expect(201);

    const blocked = await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Erro' }).expect(409);
    expect(blocked.body.code).toBe('REWARD_ALREADY_REDEEMED');

    await pos.post(`/api/admin/ledger/${red.body.entryIds[0]}/reverse`).send({ reason: 'Resgate indevido' }).expect(200);
    await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Erro' }).expect(200);
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(m.cachedBalance).toBe(0);
    expect(m.cachedRewardsAvailable).toBe(0);
  });

  it('o saldo de todos os vínculos bate com a soma do ledger', async () => {
    const r = await app.get(LoyaltyService).reconcile();
    expect(r.checked).toBeGreaterThan(0);
    expect(r.mismatches).toEqual([]);
    const viaApi = await http().post('/api/platform/reconcile').set('X-Platform-Key', PLATFORM_KEY).expect(200);
    expect(viaApi.body.mismatches).toEqual([]);
  });
});

describe('Isolamento entre estabelecimentos', () => {
  it('um gestor do Tenant A não vê dados de vínculos do Tenant B', async () => {
    const a = await createTenant(app);
    const b = await createTenant(app);
    const posA = await managerAgent(app, a.managerInviteUrl);
    const posB = await managerAgent(app, b.managerInviteUrl);
    const c = await customerAgent(app);

    const { customerRef } = await resolveQr(posB, await personalQr(c.agent));
    const cr = await credit(posB, customerRef, 3).expect(201);
    const mB = await prisma.membership.findFirstOrThrow({ where: { tenantId: b.tenantId } });

    const list = await posA.get('/api/admin/customers').expect(200);
    expect(list.body.total).toBe(0);
    await posA.get(`/api/admin/customers/${mB.id}`).expect(404);
    const ledger = await posA.get('/api/admin/ledger').query({ membershipId: mB.id }).expect(200);
    expect(ledger.body.total).toBe(0);
    await posA.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Tentativa' }).expect(404);

    // O customerRef emitido para B não serve no caixa de A.
    await credit(posA, customerRef, 1).expect(400);

    // No caixa de A, o cliente aparece como primeira visita, sem dados de B.
    const view = await resolveQr(posA, await personalQr(c.agent));
    expect(view.card.balance).toBe(0);
  });

  it('o atendente não acessa o painel do gestor', async () => {
    const t = await createTenant(app);
    const manager = await managerAgent(app, t.managerInviteUrl);
    const inv = await manager
      .post('/api/admin/staff')
      .send({ email: 'atendente@example.com', name: 'Ana', role: 'ATTENDANT', storeIds: [t.storeId] })
      .expect(201);
    const att = request.agent(app.getHttpServer());
    await att.post(`/api/staff/invites/${inv.body.inviteUrl.split('/').pop()}/accept`).send({ password: 'Atende#2026' }).expect(200);
    await att.get('/api/pos/recent').expect(200);
    await att.get('/api/admin/dashboard').expect(403);
  });
});

describe('Tenant suspenso', () => {
  it('não lança consumo nem resgata, mas o cliente continua vendo o progresso', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, customerRef, 1).expect(201);
    const ck = await pos.post('/api/pos/checkout-tokens').send({ quantity: 1 }).expect(201);

    await http().post(`/api/platform/tenants/${t.tenantId}/suspend`).set('X-Platform-Key', PLATFORM_KEY).expect(200);

    const r = await credit(pos, customerRef, 1).expect(403);
    expect(r.body.code).toBe('TENANT_SUSPENDED');
    await pos.post('/api/pos/redemptions').set('Idempotency-Key', randomUUID()).send({ customerRef }).expect(403);
    await c.agent.post(`/api/c/${ck.body.url.split('/').pop()}/claim`).expect(403);
    const list = await c.agent.get('/api/me/memberships').expect(200);
    expect(list.body[0].balance).toBe(1);
    expect(list.body[0].tenant.active).toBe(false);

    await http().post(`/api/platform/tenants/${t.tenantId}/reactivate`).set('X-Platform-Key', PLATFORM_KEY).expect(200);
    await credit(pos, customerRef, 1).expect(201);
  });
});

describe('Entrada pelo QR do balcão e LGPD', () => {
  it('cria o vínculo com 0/meta e pede consentimento por estabelecimento', async () => {
    const t = await createTenant(app);
    const c = await customerAgent(app);
    const pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body.programs[0].goal).toBe(10);
    await c.agent.post('/api/me/memberships').send({ slug: t.slug }).expect(201);
    const me = await c.agent.get('/api/me').expect(200);
    expect(me.body.pendingConsents).toBe(1);
    const list = await c.agent.get('/api/me/memberships').expect(200);
    expect(list.body[0].balance).toBe(0);
    await c.agent.patch(`/api/me/memberships/${list.body[0].membershipId}/consent`).send({ marketingConsent: true }).expect(200);
  });

  it('exclusão de conta anonimiza o cliente e mantém o ledger', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, customerRef, 2).expect(201);
    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'EXCLUIR' }).expect(200);
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe('DELETED');
    expect(row.email).toBeNull();
    expect(row.phoneE164).toBeNull();
    expect(await prisma.ledgerEntry.count({ where: { tenantId: t.tenantId } })).toBe(1);
    await c.agent.get('/api/me').expect(401);
    await http().post('/api/auth/login').send({ identifier: c.email, password: c.password }).expect(401);
  });
});

describe('Perfil e logo do estabelecimento', () => {
  const PNG_1PX =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('o gestor envia o logo (guardado no banco) e ele é servido publicamente', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const r = await pos.put('/api/admin/branding/logo').send({ image: PNG_1PX }).expect(200);
    expect(r.body.branding.logoUrl.startsWith(`/api/public/tenants/${t.slug}/logo?v=`)).toBe(true);
    const img = await http().get(r.body.branding.logoUrl).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');

    // O logo aparece para o cliente.
    const pub = await http().get(`/api/public/tenants/${t.slug}`).expect(200);
    expect(pub.body.logoUrl).toBe(r.body.branding.logoUrl);

    await pos.delete('/api/admin/branding/logo').expect(200);
    await http().get(`/api/public/tenants/${t.slug}/logo`).expect(404);
  });

  it('recusa SVG, URL externa e arquivo que não é imagem', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    await pos.put('/api/admin/branding/logo').send({ image: 'https://exemplo.com/logo.png' }).expect(400);
    await pos.put('/api/admin/branding/logo').send({ image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }).expect(400);
    const fake = await pos
      .put('/api/admin/branding/logo')
      .send({ image: `data:image/png;base64,${Buffer.from('nao sou uma imagem').toString('base64')}` })
      .expect(400);
    expect(fake.body.code).toBe('INVALID_IMAGE');
  });

  it('o gestor edita o perfil da unidade', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const r = await pos.put('/api/admin/profile').send({ storeName: 'Sushi X - Centro', address: 'Rua Nova, 10' }).expect(200);
    expect(r.body.store).toMatchObject({ name: 'Sushi X - Centro', address: 'Rua Nova, 10' });
    const me = await pos.get('/api/staff/auth/me').expect(200);
    expect(me.body.context.storeName).toBe('Sushi X - Centro');
  });
});

describe('Programas e planos', () => {
  const baseProgram = {
    unitLabel: 'sobremesa',
    unitLabelPlural: 'sobremesas',
    goal: 5,
    rewardDescription: '1 sobremesa grátis',
    maxPerEntry: 10,
    redeemWeekdays: [],
    carryOverExcess: true,
  };

  it('o plano limita os programas ativos (ESSENCIAL = 1)', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);

    const blocked = await pos.post('/api/admin/programs').send({ ...baseProgram, name: 'Sobremesas', active: true }).expect(409);
    expect(blocked.body.code).toBe('PROGRAM_LIMIT_REACHED');

    const created = await pos.post('/api/admin/programs').send({ ...baseProgram, name: 'Sobremesas', active: false }).expect(201);
    expect(created.body.limit).toMatchObject({ plan: 'ESSENCIAL', maxActive: 1, active: 1 });
    const second = created.body.items.find((p: { name: string }) => p.name === 'Sobremesas');
    await pos.post(`/api/admin/programs/${second.id}/activate`).expect(409);

    // Troca: desativa o atual e ativa o novo.
    await pos.post(`/api/admin/programs/${t.programId}/deactivate`).expect(200);
    const after = await pos.post(`/api/admin/programs/${second.id}/activate`).expect(200);
    expect(after.body.limit.active).toBe(1);

    const c = await customerAgent(app);
    const view = await resolveQr(pos, await personalQr(c.agent));
    expect(view.programs.map((p) => p.programName)).toEqual(['Sobremesas']);
    const r = await credit(pos, view.customerRef, 2).expect(201);
    expect(r.body.card.programId).toBe(second.id);

    // Programa com clientes não pode ser excluído; sem clientes, pode.
    await pos.delete(`/api/admin/programs/${second.id}`).expect(409);
    await pos.delete(`/api/admin/programs/${t.programId}`).expect(200);
  });

  it('com um plano que permite 2, o cliente tem um cartão por programa', async () => {
    await http().put('/api/platform/plans/DUO').set('X-Platform-Key', PLATFORM_KEY).send({ name: 'Duo', maxActivePrograms: 2 }).expect(200);
    const t = await createTenant(app, { plan: 'DUO' });
    const pos = await managerAgent(app, t.managerInviteUrl);
    const list = await pos.post('/api/admin/programs').send({ ...baseProgram, name: 'Sobremesas', active: true }).expect(201);
    expect(list.body.limit).toMatchObject({ maxActive: 2, active: 2 });
    const desserts = list.body.items.find((p: { name: string }) => p.name === 'Sobremesas');

    const c = await customerAgent(app);
    const view = await resolveQr(pos, await personalQr(c.agent));
    expect(view.programs).toHaveLength(2);

    // Com dois programas ativos, o caixa precisa dizer qual.
    const missing = await credit(pos, view.customerRef, 1).expect(400);
    expect(missing.body.code).toBe('PROGRAM_REQUIRED');
    await pos.post('/api/pos/credits').set('Idempotency-Key', randomUUID()).send({ customerRef: view.customerRef, programId: t.programId, quantity: 3 }).expect(201);
    await pos.post('/api/pos/credits').set('Idempotency-Key', randomUUID()).send({ customerRef: view.customerRef, programId: desserts.id, quantity: 5 }).expect(201);

    const cards = await c.agent.get('/api/me/memberships').expect(200);
    expect(cards.body).toHaveLength(2);
    expect(cards.body.map((x: { balance: number }) => x.balance).sort()).toEqual([0, 3]);

    // Consentimento é por estabelecimento: vale para os dois cartões.
    await c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: true }).expect(200);
    const ms = await prisma.membership.findMany({ where: { tenantId: t.tenantId } });
    expect(ms.every((m) => m.marketingConsent === true)).toBe(true);

    // Plano inexistente é recusado.
    await http().patch(`/api/platform/tenants/${t.tenantId}`).set('X-Platform-Key', PLATFORM_KEY).send({ plan: 'NAO_EXISTE' }).expect(400);
  });

  it('sem "guardar excedente", o que passa da meta é descartado e volta no estorno', async () => {
    const t = await createTenant(app, { program: { rewardDescription: 'Brinde', goal: 10, carryOverExcess: false } });
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    const { customerRef } = await resolveQr(pos, await personalQr(c.agent));
    await credit(pos, customerRef, 9).expect(201);
    const cr = await credit(pos, customerRef, 3).expect(201);
    expect(cr.body.rewardsUnlocked).toBe(1);
    expect(cr.body.discarded).toBe(2);
    expect(cr.body.card.balance).toBe(0);

    await pos.post(`/api/admin/ledger/${cr.body.entryId}/reverse`).send({ reason: 'Erro' }).expect(200);
    const m = await prisma.membership.findFirstOrThrow({ where: { tenantId: t.tenantId } });
    expect(m.cachedBalance).toBe(9);
    expect(m.cachedRewardsAvailable).toBe(0);
    const rec = await app.get(LoyaltyService).reconcile({ tenantId: t.tenantId });
    expect(rec.mismatches).toEqual([]);
  });
});
