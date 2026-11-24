/**
 * Notificações no celular (Web Push): o cliente ativa no aparelho e cada notificação do sino vai
 * também para o celular. O serviço de push do navegador é simulado (PushService.sender).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import webpush from 'web-push';
import { PushPayload, PushService, isAllowedPushEndpoint } from '../src/notifications/push.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createApp, createTenant, credit, customerAgent, managerAgent, personalQr, resetDb, resolveQr } from './helpers';

let app: INestApplication;
let prisma: PrismaService;
let push: PushService;
let sent: Array<{ endpoint: string; payload: PushPayload }>;
/** Status de erro devolvido pelo serviço de push para um endpoint. */
let failWith: Record<string, number>;

const vapid = webpush.generateVAPIDKeys();
let seq = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/teste-${Date.now()}-${seq++}`;
const subscription = (url = endpoint()) => ({ endpoint: url, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } });

beforeAll(async () => {
  app = await createApp();
  prisma = app.get(PrismaService);
  push = app.get(PushService);
  push.sender = async (target, payload) => {
    const status = failWith[target.endpoint];
    if (status) throw Object.assign(new Error('falhou'), { statusCode: status });
    sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
  };
  await resetDb(app);
});

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  sent = [];
  failWith = {};
});

afterAll(async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  await app.close();
});

async function scenario() {
  const t = await createTenant(app);
  const pos = await managerAgent(app, t.managerInviteUrl);
  const c = await customerAgent(app);
  const ref = (await resolveQr(pos, await personalQr(c.agent))).customerRef;
  return { t, pos, c, ref };
}

describe('endereço do serviço de push', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://web.push.apple.com/abc', true],
    ['https://wns2-bn3p.notify.windows.com/w/?token=abc', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://fcm.googleapis.com:8443/abc', false],
    ['https://fcm.googleapis.com.evil.com/abc', false],
    ['https://evilfcm.googleapis.com.br/abc', false],
    ['https://localhost/abc', false],
    ['https://169.254.169.254/latest', false],
    ['não é url', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedPushEndpoint(url)).toBe(ok);
  });
});

describe('ativar no aparelho', () => {
  it('devolve a chave pública só quando o push está configurado', async () => {
    const c = await customerAgent(app);
    expect((await c.agent.get('/api/me/push/config').expect(200)).body).toEqual({ publicKey: vapid.publicKey });
    delete process.env.VAPID_PUBLIC_KEY;
    expect((await c.agent.get('/api/me/push/config').expect(200)).body).toEqual({ publicKey: null });
  });

  it('exige login e recusa endereço fora dos serviços de push', async () => {
    const c = await customerAgent(app);
    await request(app.getHttpServer()).post('/api/me/push/subscriptions').send(subscription()).expect(401);
    await c.agent.post('/api/me/push/subscriptions').send(subscription('https://intranet.local/hook')).expect(400);
    await c.agent.post('/api/me/push/subscriptions').send({ endpoint: endpoint(), keys: { p256dh: 'x y', auth: 'z' } }).expect(400);
  });

  it('o aparelho passa para quem logou por último; cada um só desativa o próprio', async () => {
    const a = await customerAgent(app);
    const b = await customerAgent(app);
    const sub = subscription();
    await a.agent.post('/api/me/push/subscriptions').send(sub).expect(200);
    await a.agent.post('/api/me/push/subscriptions').send(sub).expect(200); // repetir não duplica
    await b.agent.post('/api/me/push/subscriptions').send(sub).expect(200);
    const rows = await prisma.pushSubscription.findMany({ where: { endpoint: sub.endpoint } });
    expect(rows).toHaveLength(1);
    const bId = rows[0].customerId;

    await a.agent.post('/api/me/push/unsubscribe').send({ endpoint: sub.endpoint }).expect(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint, customerId: bId } })).toBe(1);
    await b.agent.post('/api/me/push/unsubscribe').send({ endpoint: sub.endpoint }).expect(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(0);
  });
});

describe('envio', () => {
  it('cada notificação vai uma vez para os aparelhos do cliente, abrindo o cartão', async () => {
    const { t, pos, c, ref } = await scenario();
    const phone = subscription();
    const laptop = subscription();
    await c.agent.post('/api/me/push/subscriptions').send(phone).expect(200);
    await c.agent.post('/api/me/push/subscriptions').send(laptop).expect(200);

    await credit(pos, ref, 2).expect(201);
    await push.dispatch();
    expect(sent.map((s) => s.endpoint).sort()).toEqual([phone.endpoint, laptop.endpoint].sort());
    const n = (await c.agent.get('/api/me/notifications').expect(200)).body.items[0];
    expect(sent[0].payload).toEqual({
      id: n.id,
      title: `+2 rodízios no Tenant ${t.slug}`,
      body: n.body,
      url: `/cartao/${n.membershipId}`,
      icon: '/icons/icon-192.png',
    });

    sent = [];
    await push.dispatch();
    expect(sent).toEqual([]); // não envia de novo
  });

  it('quem não ativou só vê no app; quem ativa agora não recebe as antigas', async () => {
    const { pos, c, ref } = await scenario();
    await credit(pos, ref, 1).expect(201);
    await push.dispatch();
    expect(sent).toEqual([]);

    await c.agent.post('/api/me/push/subscriptions').send(subscription()).expect(200);
    await push.dispatch();
    expect(sent).toEqual([]);

    await credit(pos, ref, 1).expect(201);
    await push.dispatch();
    expect(sent).toHaveLength(1);
    expect((await c.agent.get('/api/me/notifications/unread-count')).body.unread).toBe(2);
  });

  it('sem chaves VAPID nada é enviado', async () => {
    const { pos, c, ref } = await scenario();
    await c.agent.post('/api/me/push/subscriptions').send(subscription()).expect(200);
    delete process.env.VAPID_PRIVATE_KEY;
    await credit(pos, ref, 1).expect(201);
    expect(await push.dispatch()).toBe(0);
    expect(sent).toEqual([]);
  });

  it('aparelho desativado no serviço de push (410) é removido; outros erros mantêm', async () => {
    const { pos, c, ref } = await scenario();
    const gone = subscription();
    const flaky = subscription();
    await c.agent.post('/api/me/push/subscriptions').send(gone).expect(200);
    await c.agent.post('/api/me/push/subscriptions').send(flaky).expect(200);
    failWith = { [gone.endpoint]: 410, [flaky.endpoint]: 500 };

    await credit(pos, ref, 1).expect(201);
    await push.dispatch();
    expect(await prisma.pushSubscription.count({ where: { endpoint: gone.endpoint } })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { endpoint: flaky.endpoint } })).toBe(1);
  });

  it('aviso do estabelecimento chega no celular de quem aceitou promoções', async () => {
    const { pos, c, ref } = await scenario();
    await credit(pos, ref, 1).expect(201); // cria o cartão
    const cards = await c.agent.get('/api/me/memberships').expect(200);
    await c.agent.patch(`/api/me/memberships/${cards.body[0].membershipId}/consent`).send({ marketingConsent: true }).expect(200);
    const sub = subscription();
    await c.agent.post('/api/me/push/subscriptions').send(sub).expect(200);

    await pos.post('/api/admin/announcements').send({ title: 'Rodízio em dobro', body: 'Só nesta terça!' }).expect(201);
    await push.dispatch();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ endpoint: sub.endpoint, payload: { title: 'Rodízio em dobro', body: 'Só nesta terça!' } });
  });

  it('excluir a conta remove os aparelhos', async () => {
    const c = await customerAgent(app);
    const sub = subscription();
    await c.agent.post('/api/me/push/subscriptions').send(sub).expect(200);
    await c.agent.delete('/api/me').send({ password: c.password, confirm: 'EXCLUIR' }).expect(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(0);
  });
});
