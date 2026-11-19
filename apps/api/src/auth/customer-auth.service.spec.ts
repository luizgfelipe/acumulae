import { Customer } from '@prisma/client';
import { CustomerAuthService, birthDateSchema, publicCustomer, registerSchema } from './customer-auth.service';

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Maria Silva',
    email: 'maria@example.com',
    phoneE164: '+5547999123456',
    birthDate: null,
    passwordHash: 'hash',
    status: 'ACTIVE',
    termsAcceptedAt: new Date(),
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Customer;
}

describe('publicCustomer', () => {
  it('não expõe o hash da senha', () => {
    const p = publicCustomer(customer({ birthDate: new Date('1990-03-07T00:00:00Z') }));
    expect(p).not.toHaveProperty('passwordHash');
    expect(p).toMatchObject({ hasPassword: true, birthDate: '1990-03-07', profileComplete: true });
  });

  it('login social sem telefone tem o perfil incompleto (RN-07)', () => {
    expect(publicCustomer(customer({ phoneE164: null, passwordHash: null })).profileComplete).toBe(false);
  });
});

describe('registerSchema (RN-03)', () => {
  const ok = { name: 'Maria', phone: '(47) 99912-3456', email: 'Maria@Example.com ', password: 'x', acceptTerms: true };

  it('normaliza o e-mail e deixa o nascimento opcional', () => {
    const r = registerSchema.parse(ok);
    expect(r.email).toBe('maria@example.com');
    expect(r.birthDate).toBeUndefined();
  });

  it('exige o aceite dos termos (seção 10)', () => {
    expect(registerSchema.safeParse({ ...ok, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...ok, acceptTerms: undefined }).success).toBe(false);
  });

  it.each(['name', 'phone', 'email', 'password'])('%s é obrigatório', (field) => {
    expect(registerSchema.safeParse({ ...ok, [field]: undefined }).success).toBe(false);
  });
});

describe('birthDateSchema', () => {
  it('aceita AAAA-MM-DD no passado', () => {
    expect(birthDateSchema.safeParse('1990-03-07').success).toBe(true);
  });

  it.each(['07/03/1990', '1990-13-01', '1899-12-31', '2999-01-01', 'ontem'])('recusa "%s"', (s) => {
    expect(birthDateSchema.safeParse(s).success).toBe(false);
  });
});

/** RN-07 / RN-15: login social identifica pelo `sub` e só vincula por e-mail se o provedor garantir. */
describe('CustomerAuthService.resolveSocial (RN-15)', () => {
  function setup(opts: { identity?: unknown; byEmail?: Customer | null } = {}) {
    const prisma = {
      customerIdentity: {
        findUnique: jest.fn(async () => opts.identity ?? null),
        create: jest.fn(async () => ({})),
      },
      customer: {
        findUnique: jest.fn(async () => opts.byEmail ?? null),
        create: jest.fn(async ({ data }: any) => customer({ id: 'novo', name: data.name, email: data.email, phoneE164: null, passwordHash: null })),
      },
    };
    const svc = new CustomerAuthService(prisma as never, {} as never, {} as never, {} as never);
    return { svc, prisma };
  }
  const profile = { provider: 'GOOGLE' as const, subject: 'g-123', email: 'Maria@Example.com', emailVerified: true, name: 'Maria Silva' };

  it('identidade já vinculada entra direto', async () => {
    const c = customer();
    const { svc, prisma } = setup({ identity: { customer: c } });
    await expect(svc.resolveSocial(profile)).resolves.toEqual({ kind: 'ok', customer: c });
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('e-mail verificado de conta existente: vincula automaticamente', async () => {
    const c = customer();
    const { svc, prisma } = setup({ byEmail: c });
    await expect(svc.resolveSocial(profile)).resolves.toEqual({ kind: 'ok', customer: c });
    expect(prisma.customerIdentity.create).toHaveBeenCalledWith({
      data: { customerId: 'c1', provider: 'GOOGLE', providerSubject: 'g-123', emailAtProvider: 'maria@example.com' },
    });
  });

  it('e-mail NÃO verificado de conta existente: exige a senha antes de vincular', async () => {
    const { svc, prisma } = setup({ byEmail: customer() });
    await expect(svc.resolveSocial({ ...profile, emailVerified: false })).resolves.toEqual({
      kind: 'needs-password-link',
      email: 'maria@example.com',
    });
    expect(prisma.customerIdentity.create).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('sem conta: cria a conta sem telefone (o cliente completa depois)', async () => {
    const { svc, prisma } = setup();
    const r = await svc.resolveSocial(profile);
    expect(r.kind).toBe('ok');
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Maria Silva', email: 'maria@example.com' }),
    });
    expect(publicCustomer((r as { customer: Customer }).customer).profileComplete).toBe(false);
  });

  it('sem nome do provedor (Apple em logins seguintes): usa "Cliente"', async () => {
    const { svc, prisma } = setup();
    await svc.resolveSocial({ ...profile, provider: 'APPLE', name: null, email: null });
    expect(prisma.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Cliente', email: null }) });
  });

  it('conta excluída não é reaproveitada', async () => {
    const { svc, prisma } = setup({ identity: { customer: customer({ status: 'DELETED' }) }, byEmail: customer({ status: 'DELETED' }) });
    await svc.resolveSocial(profile);
    expect(prisma.customer.create).toHaveBeenCalled();
  });
});
