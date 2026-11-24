/**
 * Dados de demonstração para ver a home do cliente com vários cartões (só para ambiente local!).
 *
 *   cd apps/api
 *   DATABASE_URL=postgresql://acumulae:acumulae@localhost:5432/acumulae node ../../scripts/seed-demo-cartoes.cjs
 *
 * Cria (ou recria) 8 estabelecimentos "exemplo-*" (só esses slugs) e a cliente demo@acumulae.local / senha "demo4321",
 * com cartões em situações diferentes. Os lançamentos seguem as regras do ledger (crédito → recompensa liberada),
 * então a reconciliação chega nos mesmos saldos.
 */
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const apiRequire = require('node:module').createRequire(path.join(process.cwd(), 'package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const bcrypt = apiRequire('bcryptjs');

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '')) {
  console.error('Recusado: este script só roda contra um banco local (DATABASE_URL em localhost).');
  process.exit(1);
}

const prisma = new PrismaClient();
const EMAIL = 'demo@acumulae.local';
const PHONE = '+5547999990001';
const PASSWORD = 'demo4321';

const daysAgo = (d, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000);

/**
 * Cada estabelecimento: programas com `stamps` (saldo atual), `rewards` (recompensas a usar) e a última visita.
 * `status`/`programActive` simulam estabelecimento pausado e programa encerrado.
 */
const TENANTS = [
  {
    slug: 'exemplo-pizzaria-bella',
    name: 'Pizzaria Bella Napoli',
    branding: { primaryColor: '#B91C1C', secondaryColor: '#F59E0B', cardStyle: 'CLASSICO', stampIcon: 'pizza' },
    programs: [{ name: 'Pizza', unitLabel: 'pizza', unitLabelPlural: 'pizzas', goal: 8, reward: '1 pizza grande grátis', stamps: 0, rewards: 1, visit: daysAgo(1) }],
  },
  {
    slug: 'exemplo-sushi-zen',
    name: 'Sushi Zen',
    branding: { primaryColor: '#111827', secondaryColor: '#DC2626', cardStyle: 'MOLDURA', stampIcon: 'fish' },
    programs: [
      { name: 'Rodízio', unitLabel: 'rodízio', unitLabelPlural: 'rodízios', goal: 10, reward: '1 rodízio grátis', stamps: 3, rewards: 2, visit: daysAgo(3) },
      { name: 'Temaki', unitLabel: 'temaki', unitLabelPlural: 'temakis', goal: 6, reward: '1 temaki grátis', stamps: 5, rewards: 0, visit: daysAgo(3) },
    ],
  },
  {
    slug: 'exemplo-cafe-grao',
    name: 'Café Grão de Ouro',
    branding: { primaryColor: '#78350F', secondaryColor: '#D97706', cardStyle: 'DEGRADE', stampIcon: 'coffee' },
    programs: [{ name: 'Café', unitLabel: 'café', unitLabelPlural: 'cafés', goal: 10, reward: '1 café especial grátis', stamps: 9, rewards: 0, visit: daysAgo(0, 2) }],
  },
  {
    slug: 'exemplo-hamburgueria-brasa',
    name: 'Hamburgueria Brasa',
    branding: { primaryColor: '#EA580C', secondaryColor: null, cardStyle: 'CLASSICO', stampIcon: 'hamburger' },
    programs: [{ name: 'Burger', unitLabel: 'burger', unitLabelPlural: 'burgers', goal: 5, reward: '1 burger da casa grátis', stamps: 4, rewards: 0, visit: daysAgo(6) }],
  },
  {
    slug: 'exemplo-acai-praia',
    name: 'Açaí da Praia',
    branding: { primaryColor: '#6D28D9', secondaryColor: '#10B981', cardStyle: 'DEGRADE', stampIcon: 'heart' },
    programs: [{ name: 'Açaí', unitLabel: 'açaí', unitLabelPlural: 'açaís', goal: 10, reward: '1 açaí de 500 ml', stamps: 2, rewards: 0, visit: daysAgo(0, 1) }],
  },
  {
    slug: 'exemplo-padaria-trigo',
    name: 'Padaria Trigo Bom',
    branding: { primaryColor: '#CA8A04', secondaryColor: '#1E3A8A', cardStyle: 'MOLDURA', stampIcon: 'croissant' },
    programs: [{ name: 'Café da manhã', unitLabel: 'visita', unitLabelPlural: 'visitas', goal: 12, reward: '1 café da manhã completo', stamps: 6, rewards: 0, visit: daysAgo(20) }],
  },
  {
    slug: 'exemplo-sorveteria-gelato',
    name: 'Sorveteria Gelato Mio',
    status: 'SUSPENDED',
    branding: { primaryColor: '#DB2777', secondaryColor: '#38BDF8', cardStyle: 'CLASSICO', stampIcon: 'ice-cream' },
    programs: [{ name: 'Gelato', unitLabel: 'gelato', unitLabelPlural: 'gelatos', goal: 10, reward: '1 gelato duplo', stamps: 5, rewards: 0, visit: daysAgo(45) }],
  },
  {
    slug: 'exemplo-bistro-lume',
    name: 'Bistrô Lume',
    branding: { primaryColor: '#065F46', secondaryColor: '#FBBF24', cardStyle: 'CLASSICO', stampIcon: 'utensils' },
    programs: [{ name: 'Almoço', unitLabel: 'almoço', unitLabelPlural: 'almoços', goal: 10, reward: '1 sobremesa da casa', stamps: 7, rewards: 0, visit: daysAgo(30), programActive: false }],
  },
];

async function wipe() {
  const tenants = await prisma.tenant.findMany({ where: { slug: { in: TENANTS.map((t) => t.slug) } }, select: { id: true } });
  const tenantIds = tenants.map((t) => t.id);
  const customer = await prisma.customer.findFirst({ where: { OR: [{ email: EMAIL }, { phoneE164: PHONE }] }, select: { id: true } });
  const byTenantOrCustomer = { OR: [{ tenantId: { in: tenantIds } }, ...(customer ? [{ membership: { customerId: customer.id } }] : [])] };
  await prisma.$transaction([
    prisma.reward.deleteMany({ where: byTenantOrCustomer }),
    // Estornos apontam para o lançamento original: apaga os filhos antes.
    prisma.ledgerEntry.deleteMany({ where: { ...byTenantOrCustomer, reversesEntryId: { not: null } } }),
    prisma.ledgerEntry.deleteMany({ where: byTenantOrCustomer }),
    prisma.notification.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, ...(customer ? [{ customerId: customer.id }] : [])] } }),
    prisma.membership.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, ...(customer ? [{ customerId: customer.id }] : [])] } }),
    prisma.loyaltyProgram.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.store.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.tenantBranding.deleteMany({ where: { tenantId: { in: tenantIds } } }),
    prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
    ...(customer ? [prisma.customerSession.deleteMany({ where: { customerId: customer.id } }), prisma.customer.delete({ where: { id: customer.id } })] : []),
  ]);
}

async function main() {
  await wipe();

  const customer = await prisma.customer.create({
    data: {
      name: 'Cliente Demonstração',
      email: EMAIL,
      phoneE164: PHONE,
      passwordHash: await bcrypt.hash(PASSWORD, 11),
      termsAcceptedAt: new Date(),
      termsVersion: await currentTermsVersion(),
    },
  });

  for (const t of TENANTS) {
    const tenant = await prisma.tenant.create({
      data: {
        name: t.name,
        slug: t.slug,
        status: t.status ?? 'ACTIVE',
        plan: 'PILOTO',
        branding: { create: t.branding },
        stores: { create: { name: `${t.name} - Centro`, slug: 'centro', city: 'Joinville', state: 'SC' } },
      },
      include: { stores: true },
    });
    const storeId = tenant.stores[0].id;

    for (const p of t.programs) {
      const program = await prisma.loyaltyProgram.create({
        data: {
          tenantId: tenant.id,
          name: p.name,
          unitLabel: p.unitLabel,
          unitLabelPlural: p.unitLabelPlural,
          goal: p.goal,
          rewardDescription: p.reward,
          active: p.programActive ?? true,
        },
      });
      const membership = await prisma.membership.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          programId: program.id,
          marketingConsent: true,
          marketingConsentAt: daysAgo(60),
          firstVisitAt: daysAgo(60),
          lastVisitAt: p.visit,
          cachedBalance: p.stamps,
          cachedRewardsAvailable: p.rewards,
        },
      });

      const base = { tenantId: tenant.id, storeId, membershipId: membership.id };
      let n = 0;
      const key = () => `demo:${membership.id}:${n++}`;
      // Um cartão completo por recompensa: crédito da meta inteira e a liberação logo em seguida.
      for (let r = 0; r < p.rewards; r++) {
        const at = daysAgo(50 - r * 10);
        const credit = await prisma.ledgerEntry.create({
          data: { ...base, type: 'CREDITO', quantity: p.goal, source: 'PAINEL', idempotencyKey: key(), createdAt: at },
        });
        const rewardId = randomUUID();
        const unlock = await prisma.ledgerEntry.create({
          data: {
            ...base,
            type: 'RECOMPENSA_LIBERADA',
            quantity: -p.goal,
            rewardsDelta: 1,
            source: 'SISTEMA',
            parentEntryId: credit.id,
            rewardId,
            idempotencyKey: key(),
            createdAt: at,
          },
        });
        await prisma.reward.create({
          data: {
            id: rewardId,
            tenantId: tenant.id,
            membershipId: membership.id,
            programId: program.id,
            description: p.reward,
            stampsCost: p.goal,
            unlockedEntryId: unlock.id,
            sourceEntryId: credit.id,
            createdAt: at,
          },
        });
      }
      // Saldo atual em lançamentos de 1 selo, espalhados até a última visita.
      for (let s = 0; s < p.stamps; s++) {
        const at = new Date(p.visit.getTime() - (p.stamps - 1 - s) * 3 * 86_400_000);
        await prisma.ledgerEntry.create({ data: { ...base, type: 'CREDITO', quantity: 1, source: 'QR_PESSOAL', idempotencyKey: key(), createdAt: at } });
      }
    }
  }

  console.log(`Pronto: ${TENANTS.length} estabelecimentos demo.`);
  console.log(`Entre em http://localhost:3000/entrar com ${EMAIL} (ou 47 99999-0001) e a senha ${PASSWORD}.`);
}

/** Versão atual dos Termos, para o app não pedir aceite de novo ao entrar. */
async function currentTermsVersion() {
  try {
    const fs = require('node:fs');
    const src = fs.readFileSync(path.join(process.cwd(), 'src/common/terms.ts'), 'utf8');
    return src.match(/['"](\d{4}-\d{2}-\d{2})['"]/)?.[1] ?? null;
  } catch {
    return null;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
