import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentStaff, Staff, StoreStaff } from '../auth/staff-auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import {
  PosCtx,
  PosService,
  checkoutCreateSchema,
  creditSchema,
  idempotencyKeySchema,
  redeemSchema,
  resolveQrSchema,
} from './pos.service';

function ctxOf(s: StoreStaff): PosCtx {
  return { tenantId: s.context.tenantId, storeId: s.context.storeId, staffUserId: s.userId };
}

/** Tela de caixa (atendente e gestor). Exige estabelecimento ativo e unidade selecionada. */
@Controller('api/pos')
@Staff({ tenant: true, store: true, roles: ['ATTENDANT', 'MANAGER'] })
export class PosController {
  constructor(private readonly pos: PosService) {}

  @Post('customers/resolve-qr')
  @HttpCode(200)
  resolveQr(@CurrentStaff() s: StoreStaff, @Body(new ZodPipe(resolveQrSchema)) body: z.infer<typeof resolveQrSchema>) {
    return this.pos.resolveQr(ctxOf(s), body.qr);
  }

  @Get('customers')
  byPhone(@CurrentStaff() s: StoreStaff, @Query('phone') phone: string) {
    return this.pos.findByPhone(ctxOf(s), phone ?? '');
  }

  @Post('credits')
  credit(
    @CurrentStaff() s: StoreStaff,
    @Headers('idempotency-key') key: string,
    @Body(new ZodPipe(creditSchema)) body: z.infer<typeof creditSchema>,
  ) {
    return this.pos.credit(ctxOf(s), body, idempotencyKeySchema.parse(key));
  }

  @Post('redemptions')
  redeem(
    @CurrentStaff() s: StoreStaff,
    @Headers('idempotency-key') key: string,
    @Body(new ZodPipe(redeemSchema)) body: z.infer<typeof redeemSchema>,
  ) {
    return this.pos.redeem(ctxOf(s), body, idempotencyKeySchema.parse(key));
  }

  @Post('checkout-tokens')
  createCheckout(
    @CurrentStaff() s: StoreStaff,
    @Body(new ZodPipe(checkoutCreateSchema)) body: z.infer<typeof checkoutCreateSchema>,
  ) {
    return this.pos.createCheckout(ctxOf(s), body.quantity, body.programId);
  }

  @Get('checkout-tokens/:id')
  checkoutStatus(@CurrentStaff() s: StoreStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.pos.checkoutStatus(ctxOf(s), id);
  }

  @Delete('checkout-tokens/:id')
  cancel(@CurrentStaff() s: StoreStaff, @Param('id', ParseUUIDPipe) id: string) {
    return this.pos.cancelCheckout(ctxOf(s), id);
  }

  @Get('programs')
  programs(@CurrentStaff() s: StoreStaff) {
    return this.pos.programs(ctxOf(s));
  }

  @Get('recent')
  recent(@CurrentStaff() s: StoreStaff) {
    return this.pos.recent(ctxOf(s));
  }
}
