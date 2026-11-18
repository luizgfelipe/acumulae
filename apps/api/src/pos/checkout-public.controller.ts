import { Controller, Get, HttpCode, Injectable, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentCustomer, CustomerAuthGuard, CustomerPrincipal } from '../auth/customer-auth.guard';
import { BRANDING_SELECT, logoUrlOf } from '../common/branding';
import { sha256 } from '../common/crypto';
import { AppError, forbidden, gone, notFound } from '../common/errors';
import { LoyaltyService, pluralize } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CheckoutClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  private async find(token: string) {
    if (!/^[0-9A-Za-z]{10,64}$/.test(token)) throw notFound('Código inválido.', 'TOKEN_NOT_FOUND');
    const t = await this.prisma.checkoutToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { tenant: { include: { branding: { select: BRANDING_SELECT } } }, store: true, program: true },
    });
    if (!t) throw notFound('Código inválido.', 'TOKEN_NOT_FOUND');
    return t;
  }

  /** Informações públicas do QR temporário (estabelecimento, quantidade, validade). */
  async info(token: string) {
    const t = await this.find(token);
    const program = t.program;
    const status = t.usedAt ? 'USED' : t.cancelledAt ? 'CANCELLED' : t.expiresAt < new Date() ? 'EXPIRED' : 'PENDING';
    return {
      status,
      quantity: t.quantity,
      expiresAt: t.expiresAt,
      tenant: {
        name: t.tenant.name,
        slug: t.tenant.slug,
        logoUrl: logoUrlOf(t.tenant.slug, t.tenant.branding),
        primaryColor: t.tenant.branding?.primaryColor ?? null,
        active: t.tenant.status === 'ACTIVE',
      },
      storeName: t.store.name,
      program: program && {
        unitLabel: program.unitLabel,
        unitLabelPlural: pluralize(program.unitLabel, program.unitLabelPlural),
        goal: program.goal,
        name: program.name,
        rewardDescription: program.rewardDescription,
      },
    };
  }

  /** RN-44: cliente logado usa o QR → crédito imediato. Uso atômico (seção 8.4). */
  async claim(token: string, customer: CustomerPrincipal) {
    if (!customer.phoneE164) throw new AppError(409, 'PROFILE_INCOMPLETE', 'Complete seu cadastro para continuar.');
    const t = await this.find(token);
    if (t.tenant.status !== 'ACTIVE') {
      throw forbidden('Este estabelecimento está temporariamente sem acúmulo de pontos.', 'TENANT_SUSPENDED');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const used = await tx.checkoutToken.updateMany({
        where: { id: t.id, usedAt: null, cancelledAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date(), usedByCustomerId: customer.id },
      });
      if (!used.count) {
        const cur = await tx.checkoutToken.findUniqueOrThrow({ where: { id: t.id } });
        if (cur.usedAt && cur.usedByCustomerId === customer.id) {
          // Mesmo cliente tocando de novo: devolve o resultado já registrado (idempotente).
          return this.loyalty.creditInTx(tx, this.creditInput(t, customer.id));
        }
        if (cur.usedAt) throw gone('TOKEN_USED', 'Este código já foi usado. Peça um novo ao atendente.');
        if (cur.cancelledAt) throw gone('TOKEN_CANCELLED', 'Este código foi cancelado. Peça um novo ao atendente.');
        throw gone('TOKEN_EXPIRED', 'Este código expirou. Peça um novo ao atendente.');
      }
      return this.loyalty.creditInTx(tx, this.creditInput(t, customer.id));
    });

    return {
      tenantName: t.tenant.name,
      quantity: t.quantity,
      rewardsUnlocked: result.rewardsUnlocked,
      replay: result.replay,
      card: result.card,
    };
  }

  private creditInput(
    t: { id: string; tenantId: string; storeId: string; programId: string; staffUserId: string; quantity: number },
    customerId: string,
  ) {
    return {
      tenantId: t.tenantId,
      storeId: t.storeId,
      customerId,
      programId: t.programId,
      quantity: t.quantity,
      source: 'QR_TEMPORARIO' as const,
      staffUserId: t.staffUserId,
      checkoutTokenId: t.id,
      idempotencyKey: `checkout:${t.id}`,
    };
  }
}

@Controller('api/c')
export class CheckoutPublicController {
  constructor(private readonly svc: CheckoutClaimService) {}

  @Get(':token')
  info(@Param('token') token: string) {
    return this.svc.info(token);
  }

  @Post(':token/claim')
  @HttpCode(200)
  @UseGuards(CustomerAuthGuard)
  claim(@Param('token') token: string, @CurrentCustomer() customer: CustomerPrincipal) {
    return this.svc.claim(token, customer);
  }
}
