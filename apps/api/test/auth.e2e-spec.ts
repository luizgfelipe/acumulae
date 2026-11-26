/**
 * Conta, autenticação e sessão (seções 5.1 e 5.2): cliente, funcionário e isolamento entre os dois.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CustomerAuthService } from '../src/auth/customer-auth.service';
import { SessionsService } from '../src/auth/sessions.service';
import { TokensService } from '../src/auth/tokens.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PLATFORM_KEY,
  cookieFrom,
  createApp,
  createTenant,
  customerAgent,
  lastMail,
  managerAgent,
  phone,
  resetDb,
  uniq,
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

const registerBody = (over: Record<string, unknown> = {}) => ({
  name: 'João Pereira',
  phone: phone(),
  email: `joao-${uniq()}@example.com`,
  password: 'Senha#Forte1',
  acceptTerms: true,
  ...over,
});

/** Conta criada por login social (sem telefone e sem senha), com um access token. */
async function socialCustomer(email = `social-${uniq()}@example.com`) {
  const r = await app.get(CustomerAuthService).resolveSocial({
    provider: 'GOOGLE',
    subject: `g-${uniq()}`,
    email,
    emailVerified: true,
    name: 'Bia Social',
  });
  if (r.kind !== 'ok') throw new Error('esperava conta criada');
  const s = await app.get(SessionsService).create('customer', r.customer.id, null);
  return { id: r.customer.id, email, bearer: `Bearer ${s.accessToken}` };
}

describe('Cadastro do cliente (RN-03, RN-08, RN-14)', () => {
  it('cadastra, já deixa logado e grava telefone em E.164 e o aceite dos termos', async () => {
    const agent = request.agent(app.getHttpServer());
    const body = registerBody({ phone: '(47) 98877-1122', birthDate: '1990-03-07' });
    const r = await agent.post('/api/auth/register').send(body).expect(201);
    expect(r.body.customer).toMatchObject({ phone: '+5547988771122', birthDate: '1990-03-07', profileComplete: true });
    expect(r.body.customer).not.toHaveProperty('passwordHash');
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.email).toBe(body.email);
    const row = await prisma.customer.findUniqueOrThrow({ where: { id: r.body.customer.id } });
    expect(row.termsAcceptedAt).not.toBeNull();
    expect(row.passwordHash).not.toBe(body.password);
  });

  it('a data de nascimento é opcional', async () => {
    const r = await http().post('/api/auth/register').send(registerBody()).expect(201);
    expect(r.body.customer.birthDate).toBeNull();
  });

  it('exige aceitar os termos', async () => {
    const r = await http().post('/api/auth/register').send(registerBody({ acceptTerms: false })).expect(400);
    expect(r.body.code).toBe('VALIDATION_ERROR');
  });

  it('recusa telefone inválido', async () => {
    const r = await http().post('/api/auth/register').send(registerBody({ phone: '9999-9999' })).expect(400);
    expect(r.body.code).toBe('INVALID_PHONE');
  });

  it('recusa e-mail inválido', async () => {
    await http().post('/api/auth/register').send(registerBody({ email: 'nao-e-email' })).expect(400);
  });

  it('recusa senha igual ao telefone ou à data de nascimento (RN-08)', async () => {
    const byPhone = await http()
      .post('/api/auth/register')
      .send(registerBody({ phone: '(47) 98123-4567', password: '981234567' }))
      .expect(400);
    expect(byPhone.body.code).toBe('WEAK_PASSWORD');
    const byBirth = await http()
      .post('/api/auth/register')
      .send(registerBody({ birthDate: '1990-03-07', password: '07031990' }))
      .expect(400);
    expect(byBirth.body.code).toBe('WEAK_PASSWORD');
  });

  it('telefone já cadastrado em outro formato não cria conta nova (RN-14)', async () => {
    await http().post('/api/auth/register').send(registerBody({ phone: '(47) 98765-0001' })).expect(201);
    const r = await http().post('/api/auth/register').send(registerBody({ phone: '+55 47 987650001' })).expect(409);
    expect(r.body).toMatchObject({ code: 'ACCOUNT_EXISTS', details: { field: 'phone' } });
  });

  it('e-mail já cadastrado (com maiúsculas) não cria conta nova (RN-14)', async () => {
    const c = await customerAgent(app);
    const r = await http().post('/api/auth/register').send(registerBody({ email: c.email.toUpperCase() })).expect(409);
    expect(r.body).toMatchObject({ code: 'ACCOUNT_EXISTS', details: { field: 'email' } });
    expect(await prisma.customer.count({ where: { email: c.email } })).toBe(1);
  });
});

describe('Login do cliente (RN-09, RN-13)', () => {
  it('telefone em qualquer formato e e-mail com maiúsculas funcionam', async () => {
    const c = await customerAgent(app, { phone: '(47) 98111-2233' });
    await http().post('/api/auth/login').send({ identifier: '47981112233', password: c.password }).expect(200);
    await http().post('/api/auth/login').send({ identifier: c.email.toUpperCase(), password: c.password }).expect(200);
  });

  it('conta inexistente e senha errada dão a mesma resposta', async () => {
    const c = await customerAgent(app);
    const a = await http().post('/api/auth/login').send({ identifier: 'ninguem@example.com', password: 'x' }).expect(401);
    const b = await http().post('/api/auth/login').send({ identifier: c.email, password: 'errada' }).expect(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('o bloqueio por tentativas é por identificador: outra conta do mesmo IP continua entrando', async () => {
    const victim = await customerAgent(app);
    const other = await customerAgent(app);
    for (let i = 0; i < 5; i++) {
      await http().post('/api/auth/login').send({ identifier: victim.email, password: 'errada' }).expect(401);
    }
    await http().post('/api/auth/login').send({ identifier: victim.email, password: victim.password }).expect(429);
    await http().post('/api/auth/login').send({ identifier: other.email, password: other.password }).expect(200);
  });

  it('o mesmo telefone escrito de jeitos diferentes conta como um identificador só', async () => {
    const c = await customerAgent(app, { phone: '(47) 98111-4455' });
    for (const identifier of ['(47) 98111-4455', '47981114455', '+5547981114455', '+55 47 98111-4455', '47 98111 4455']) {
      await http().post('/api/auth/login').send({ identifier, password: 'errada' }).expect(401);
    }
    await http().post('/api/auth/login').send({ identifier: '47981114455', password: c.password }).expect(429);
  });

  it('30 erros do mesmo IP em contas diferentes bloqueiam o IP (RN-13)', async () => {
    const c = await customerAgent(app);
    const from = (ip: string) => ({ 'X-Forwarded-For': ip });
    for (let i = 0; i < 30; i++) {
      await http()
        .post('/api/auth/login')
        .set(from('203.0.113.7'))
        .send({ identifier: `alvo${i}-${uniq()}@example.com`, password: 'Senha123' })
        .expect(401);
    }
    const r = await http().post('/api/auth/login').set(from('203.0.113.7')).send({ identifier: c.email, password: c.password }).expect(429);
    expect(r.body.details.retryAfterSeconds).toBe(3600);
    await http().post('/api/auth/login').set(from('203.0.113.8')).send({ identifier: c.email, password: c.password }).expect(200);
  });

  it('20 erros numa conta vindos de IPs diferentes pausam o login dela em IPs novos e avisam o dono (RN-13)', async () => {
    const c = await customerAgent(app);
    const login = (ip: string, password: string) =>
      http().post('/api/auth/login').set('X-Forwarded-For', ip).send({ identifier: c.email, password });
    await login('192.0.2.50', c.password).expect(200); // rede de casa
    for (let i = 0; i < 20; i++) await login(`198.51.100.${i}`, 'Errada#123').expect(401);

    const paused = await login('203.0.113.50', c.password).expect(429);
    expect(paused.body.message).toMatch(/pausado em novos aparelhos/);
    await login('192.0.2.50', c.password).expect(200);
    const alert = lastMail(app, c.email);
    expect(alert.subject).toMatch(/Tentativas de entrar/);
    expect(alert.text).toMatch(/60 minuto/);

    // Redefinir a senha prova o acesso ao e-mail e acaba com a pausa.
    await http().post('/api/auth/password/forgot').send({ identifier: c.email }).expect(200);
    const token = /token=([A-Za-z0-9]+)/.exec(lastMail(app, c.email).text)![1];
    await http().post('/api/auth/password/reset').send({ token, password: 'NovaSenha#9' }).expect(200);
    await login('203.0.113.50', 'NovaSenha#9').expect(200);
  });
});

describe('Sessão (RN-10, RN-11)', () => {
  it('logout encerra a sessão no servidor', async () => {
    const c = await customerAgent(app);
    await c.agent.post('/api/auth/logout').expect(200);
    await c.agent.get('/api/me').expect(401);
    const sessions = await prisma.customerSession.findMany({ where: { customerId: c.id } });
    expect(sessions.every((s) => s.revokedAt)).toBe(true);
  });

  it('o refresh dura 180 dias e é renovado a cada uso', async () => {
    const c = await customerAgent(app);
    const before = await prisma.customerSession.findFirstOrThrow({ where: { customerId: c.id } });
    const days = (before.expiresAt.getTime() - Date.now()) / 86400_000;
    expect(Math.round(days)).toBe(180);
    const r = await c.agent.post('/api/auth/refresh').expect(200);
    expect(cookieFrom(r, 'acu_rt')).toBeTruthy();
    const after = await prisma.customerSession.findFirstOrThrow({ where: { customerId: c.id } });
    expect(after.refreshTokenHash).not.toBe(before.refreshTokenHash);
  });

  it('o refresh anterior vale por 60 s (duas abas); depois disso, reusá-lo derruba a sessão', async () => {
    const agent = request.agent(app.getHttpServer());
    const reg = await agent.post('/api/auth/register').send(registerBody()).expect(201);
    const old = cookieFrom(reg, 'acu_rt')!;
    await agent.post('/api/auth/refresh').expect(200);

    // Outra aba ainda com o token anterior: aceita, mas não emite novo refresh.
    const tab = await http().post('/api/auth/refresh').set('Cookie', `acu_rt=${old}`).expect(200);
    expect(cookieFrom(tab, 'acu_rt')).toBeUndefined();

    // Reuso depois da janela: possível vazamento → a sessão inteira é revogada.
    await prisma.customerSession.updateMany({
      where: { customerId: reg.body.customer.id },
      data: { rotatedAt: new Date(Date.now() - 2 * 60_000) },
    });
    await http().post('/api/auth/refresh').set('Cookie', `acu_rt=${old}`).expect(401);
    await agent.post('/api/auth/refresh').expect(401);
    await agent.get('/api/me').expect(401);
  });

  it('sessão expirada não renova', async () => {
    const c = await customerAgent(app);
    await prisma.customerSession.updateMany({ where: { customerId: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await c.agent.post('/api/auth/refresh').expect(401);
    expect(r.body.code).toBe('SESSION_EXPIRED');
  });

  it('access token inválido não entra', async () => {
    await http().get('/api/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    await http().get('/api/me').expect(401);
  });
});

describe('Recuperação e troca de senha (RN-12)', () => {
  it('não revela se a conta existe', async () => {
    const before = app.get(PrismaService).passwordResetToken.count();
    const r = await http().post('/api/auth/password/forgot').send({ identifier: 'ninguem@example.com' }).expect(200);
    expect(r.body.message).toMatch(/Se houver uma conta/);
    expect(await app.get(PrismaService).passwordResetToken.count()).toBe(await before);
  });

  it('no máximo 3 pedidos por conta em 1 hora, com a mesma resposta exista a conta ou não', async () => {
    const c = await customerAgent(app);
    for (const identifier of [c.email, `ninguem-${uniq()}@example.com`]) {
      for (let i = 0; i < 3; i++) {
        await http().post('/api/auth/password/forgot').set('X-Forwarded-For', `192.0.2.${i}`).send({ identifier }).expect(200);
      }
      const r = await http().post('/api/auth/password/forgot').set('X-Forwarded-For', '192.0.2.9').send({ identifier }).expect(429);
      expect(r.body.message).toMatch(/Confira seu e-mail/);
    }
    expect(app.get(MailService).sent.filter((m) => m.to === c.email && /Redefinição/.test(m.subject))).toHaveLength(3);
  });

  it('o link vale 30 minutos', async () => {
    const c = await customerAgent(app);
    await http().post('/api/auth/password/forgot').send({ identifier: c.email }).expect(200);
    const rt = await prisma.passwordResetToken.findFirstOrThrow({ where: { customerId: c.id } });
    expect(Math.round((rt.expiresAt.getTime() - rt.createdAt.getTime()) / 60_000)).toBe(30);

    const token = /token=([A-Za-z0-9]+)/.exec(lastMail(app, c.email).text)![1];
    await prisma.passwordResetToken.update({ where: { id: rt.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await http().post('/api/auth/password/reset').send({ token, password: 'NovaSenha#9' }).expect(400);
    expect(r.body.code).toBe('INVALID_TOKEN');
  });

  it('senha nova fraca é recusada e o link continua valendo', async () => {
    const c = await customerAgent(app);
    await http().post('/api/auth/password/forgot').send({ identifier: c.email }).expect(200);
    const token = /token=([A-Za-z0-9]+)/.exec(lastMail(app, c.email).text)![1];
    const weak = await http().post('/api/auth/password/reset').send({ token, password: 'abcdef' }).expect(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
    await http().post('/api/auth/password/reset').send({ token, password: 'NovaSenha#9' }).expect(200);
  });

  it('trocar a senha exige a atual e encerra as outras sessões, mantendo a atual', async () => {
    const c = await customerAgent(app); // sessão 1 (cadastro)
    const other = request.agent(app.getHttpServer());
    await other.post('/api/auth/login').send({ identifier: c.email, password: c.password }).expect(200); // sessão 2

    const wrong = await other.post('/api/me/password').send({ currentPassword: 'errada', newPassword: 'NovaSenha#9' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    await other.post('/api/me/password').send({ currentPassword: c.password, newPassword: '111111' }).expect(400);
    await other.post('/api/me/password').send({ currentPassword: c.password, newPassword: 'NovaSenha#9' }).expect(200);

    await other.get('/api/me').expect(200);
    await c.agent.get('/api/me').expect(401);
    await http().post('/api/auth/login').send({ identifier: c.email, password: c.password }).expect(401);
    await http().post('/api/auth/login').send({ identifier: c.email, password: 'NovaSenha#9' }).expect(200);
  });
});

describe('Login social (RN-07, RN-15)', () => {
  it('na primeira vez, pede o telefone antes de liberar o QR e os créditos', async () => {
    const s = await socialCustomer();
    const me = await http().get('/api/me').set('Authorization', s.bearer).expect(200);
    expect(me.body).toMatchObject({ profileComplete: false, hasPassword: false, phone: null });

    const qr = await http().get('/api/me/qr').set('Authorization', s.bearer).expect(409);
    expect(qr.body.code).toBe('PROFILE_INCOMPLETE');

    const done = await http()
      .post('/api/me/complete-profile')
      .set('Authorization', s.bearer)
      .send({ phone: '(47) 98222-3344', birthDate: '1995-05-20', acceptTerms: true })
      .expect(200);
    expect(done.body).toMatchObject({ profileComplete: true, phone: '+5547982223344', birthDate: '1995-05-20' });
    await http().get('/api/me/qr').set('Authorization', s.bearer).expect(200);
  });

  it('completar o perfil com telefone de outra conta é recusado (RN-14)', async () => {
    const c = await customerAgent(app);
    const s = await socialCustomer();
    const r = await http()
      .post('/api/me/complete-profile')
      .set('Authorization', s.bearer)
      .send({ phone: c.phone, acceptTerms: true })
      .expect(409);
    expect(r.body.code).toBe('ACCOUNT_EXISTS');
  });

  it('quem entrou só pelo Google pode criar uma senha sem informar a atual', async () => {
    const s = await socialCustomer();
    await http().post('/api/me/password').set('Authorization', s.bearer).send({ newPassword: 'Criada#123' }).expect(200);
    const me = await http().get('/api/me').set('Authorization', s.bearer).expect(200);
    expect(me.body.hasPassword).toBe(true);
    await http().post('/api/auth/login').send({ identifier: s.email, password: 'Criada#123' }).expect(200);
  });

  it('e-mail não verificado: o vínculo só acontece depois do login com senha', async () => {
    const c = await customerAgent(app);
    const subject = `g-${uniq()}`;
    const pending = await app.get(CustomerAuthService).resolveSocial({
      provider: 'GOOGLE',
      subject,
      email: c.email,
      emailVerified: false,
      name: 'Maria',
    });
    expect(pending.kind).toBe('needs-password-link');
    expect(await prisma.customerIdentity.count({ where: { providerSubject: subject } })).toBe(0);

    const link = await app.get(TokensService).signShort('link', { provider: 'GOOGLE', subject, email: c.email }, 900);
    await http().post('/api/auth/login').set('Cookie', `acu_link=${link}`).send({ identifier: c.email, password: c.password }).expect(200);
    const identity = await prisma.customerIdentity.findFirstOrThrow({ where: { providerSubject: subject } });
    expect(identity.customerId).toBe(c.id);
  });

  it('provedor desconhecido ou desativado responde 404', async () => {
    const r = await http().get('/api/auth/oauth2/facebook').expect(404);
    expect(r.body.code).toBe('PROVIDER_DISABLED');
  });

  it('retorno do provedor sem o estado correto volta para o login com erro', async () => {
    const r = await http().get('/api/auth/oauth2/google/callback').query({ state: 'forjado', code: 'x' }).expect(302);
    expect(r.headers.location).toBe('http://localhost:3000/entrar?erro=oauth');
  });
});

describe('Funcionários (caixa e painel)', () => {
  it('login do gestor por e-mail e senha já define o estabelecimento e a unidade', async () => {
    const t = await createTenant(app);
    await managerAgent(app, t.managerInviteUrl);
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/staff/auth/login').send({ email: `gestor-${t.slug}@example.com`, password: 'Gestor#2026' }).expect(200);
    const me = await agent.get('/api/staff/auth/me').expect(200);
    expect(me.body.context).toMatchObject({ tenantId: t.tenantId, storeId: t.storeId, role: 'MANAGER' });
  });

  it('login com senha errada é recusado e bloqueia após 5 erros', async () => {
    const t = await createTenant(app);
    await managerAgent(app, t.managerInviteUrl);
    const email = `gestor-${t.slug}@example.com`;
    for (let i = 0; i < 5; i++) await http().post('/api/staff/auth/login').send({ email, password: 'errada' }).expect(401);
    await http().post('/api/staff/auth/login').send({ email, password: 'Gestor#2026' }).expect(429);
  });

  it('a recuperação de senha do funcionário encerra as sessões', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const email = `gestor-${t.slug}@example.com`;
    await http().post('/api/staff/auth/password/forgot').send({ email }).expect(200);
    const token = /token=([A-Za-z0-9]+)/.exec(lastMail(app, email).text)![1];
    await http().post('/api/staff/auth/password/reset').send({ token, password: 'Nova#Gestor1' }).expect(200);
    await pos.get('/api/staff/auth/me').expect(401);
    await http().post('/api/staff/auth/password/reset').send({ token, password: 'Outra#Gestor1' }).expect(400);
    await http().post('/api/staff/auth/login').send({ email, password: 'Nova#Gestor1' }).expect(200);
  });

  it('quem já tem conta aceita convite de outro estabelecimento confirmando a senha atual', async () => {
    const a = await createTenant(app);
    const b = await createTenant(app);
    await managerAgent(app, a.managerInviteUrl);
    const email = `gestor-${a.slug}@example.com`;
    const inv = await http()
      .post(`/api/platform/tenants/${b.tenantId}/invites`)
      .set('X-Platform-Key', PLATFORM_KEY)
      .send({ email, role: 'MANAGER' })
      .expect(201);
    const token = inv.body.inviteUrl.split('/').pop();

    const info = await http().get(`/api/staff/invites/${token}`).expect(200);
    expect(info.body).toMatchObject({ hasAccount: true, email, role: 'MANAGER' });

    const agent = request.agent(app.getHttpServer());
    const wrong = await agent.post(`/api/staff/invites/${token}/accept`).send({ password: 'Outra#Senha1' }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    const ok = await agent.post(`/api/staff/invites/${token}/accept`).send({ password: 'Gestor#2026' }).expect(200);
    expect(ok.body.workplaces.map((w: { tenantId: string }) => w.tenantId).sort()).toEqual([a.tenantId, b.tenantId].sort());
    expect(ok.body.context.tenantId).toBe(b.tenantId);

    // Troca de estabelecimento pelo contexto da sessão.
    const sw = await agent.post('/api/staff/auth/context').send({ tenantId: a.tenantId }).expect(200);
    expect(sw.body.context.tenantId).toBe(a.tenantId);
  });

  it('não troca para um estabelecimento ou unidade sem acesso', async () => {
    const a = await createTenant(app);
    const b = await createTenant(app);
    const pos = await managerAgent(app, a.managerInviteUrl);
    await pos.post('/api/staff/auth/context').send({ tenantId: b.tenantId }).expect(403);
    await pos.post('/api/staff/auth/context').send({ tenantId: a.tenantId, storeId: b.storeId }).expect(403);
  });

  it('convite para novo funcionário exige senha forte e nome', async () => {
    const t = await createTenant(app);
    const token = t.managerInviteUrl.split('/').pop();
    const weak = await http().post(`/api/staff/invites/${token}/accept`).send({ name: 'Gestor', password: '123456' }).expect(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
    // Convite continua valendo depois da recusa.
    await http().post(`/api/staff/invites/${token}/accept`).send({ name: 'Gestor', password: 'Gestor#2026' }).expect(200);
  });

  it('convite inexistente responde 404', async () => {
    await http().get('/api/staff/invites/naoexiste123456').expect(404);
  });
});

describe('Cada tipo de credencial só abre a própria área', () => {
  it('cliente não entra no caixa nem no painel; funcionário não entra na área do cliente', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    await c.agent.get('/api/pos/recent').expect(401);
    await c.agent.get('/api/admin/dashboard').expect(401);
    await pos.get('/api/me').expect(401);
  });

  it('sessões de cliente ou funcionário não servem na API da plataforma (RN-91)', async () => {
    const t = await createTenant(app);
    const pos = await managerAgent(app, t.managerInviteUrl);
    const c = await customerAgent(app);
    await pos.get('/api/platform/tenants').expect(401);
    await c.agent.get('/api/platform/tenants').expect(401);
  });
});

describe('Limites por IP nas rotas públicas', () => {
  const from = (ip: string) => ({ 'X-Forwarded-For': ip });

  it('cadastro: 50 recusas do mesmo IP em 1 hora bloqueiam o IP', async () => {
    const taken = await customerAgent(app);
    for (let i = 0; i < 50; i++) {
      await http().post('/api/auth/register').set(from('198.51.100.200')).send(registerBody({ email: taken.email })).expect(409);
    }
    const r = await http().post('/api/auth/register').set(from('198.51.100.200')).send(registerBody()).expect(429);
    expect(r.body.code).toBe('TOO_MANY_ATTEMPTS');
    await http().post('/api/auth/register').set(from('198.51.100.201')).send(registerBody()).expect(201);
  });

  it('cadastro: cadastros aceitos não contam como recusa', async () => {
    for (let i = 0; i < 51; i++) {
      await http().post('/api/auth/register').set(from('198.51.100.210')).send(registerBody()).expect(201);
    }
  });

  it('links com token: 20 recusas do mesmo IP em 15 min bloqueiam convite, redefinição e QR do caixa', async () => {
    const ip = from('198.51.100.220');
    for (let i = 0; i < 20; i++) {
      await http().get(`/api/staff/invites/inexistente${i}abcdefgh`).set(ip).expect(404);
    }
    await http().get('/api/c/inexistente0abcdefgh').set(ip).expect(429);
    await http().post('/api/auth/password/reset').set(ip).send({ token: 'qualquer-token-1', password: 'NovaSenha#9' }).expect(429);
    await http().post('/api/staff/auth/password/reset').set(ip).send({ token: 'qualquer-token-1', password: 'NovaSenha#9' }).expect(429);
    await http().get('/api/c/inexistente0abcdefgh').set(from('198.51.100.221')).expect(404);
  });
});
