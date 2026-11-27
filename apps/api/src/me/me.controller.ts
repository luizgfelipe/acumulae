import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { z } from 'zod';
import { clearAuthCookies } from '../auth/cookies';
import { CurrentCustomer, CustomerAuthGuard, CustomerPrincipal } from '../auth/customer-auth.guard';
import { ZodPipe } from '../common/zod.pipe';
import {
  MeService,
  changePasswordSchema,
  acceptTermsSchema,
  completeProfileSchema,
  consentSchema,
  deleteMeSchema,
  joinSchema,
  updateMeSchema,
} from './me.service';

/** Área do cliente (PWA). */
@Controller('api/me')
@UseGuards(CustomerAuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentCustomer() c: CustomerPrincipal) {
    return this.me.me(c.id);
  }

  @Patch()
  update(@CurrentCustomer() c: CustomerPrincipal, @Body(new ZodPipe(updateMeSchema)) body: z.infer<typeof updateMeSchema>) {
    return this.me.update(c, body);
  }

  /** RN-07: telefone (obrigatório) e nascimento (opcional) após o login social. */
  @Post('complete-profile')
  @HttpCode(200)
  complete(
    @CurrentCustomer() c: CustomerPrincipal,
    @Body(new ZodPipe(completeProfileSchema)) body: z.infer<typeof completeProfileSchema>,
  ) {
    return this.me.completeProfile(c, body);
  }

  /** Aceite da versão atual dos Termos (quem aceitou uma versão antiga). */
  @Post('terms')
  @HttpCode(200)
  acceptTerms(@CurrentCustomer() c: CustomerPrincipal, @Body(new ZodPipe(acceptTermsSchema)) _body: z.infer<typeof acceptTermsSchema>) {
    return this.me.acceptTerms(c);
  }

  @Post('password')
  @HttpCode(200)
  password(
    @CurrentCustomer() c: CustomerPrincipal,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ) {
    return this.me.changePassword(c, body);
  }

  @Get('qr')
  qr(@CurrentCustomer() c: CustomerPrincipal) {
    return this.me.qrPayload(c);
  }

  @Get('memberships')
  memberships(@CurrentCustomer() c: CustomerPrincipal) {
    return this.me.memberships(c);
  }

  @Post('memberships')
  join(@CurrentCustomer() c: CustomerPrincipal, @Body(new ZodPipe(joinSchema)) body: z.infer<typeof joinSchema>) {
    return this.me.join(c, body.slug, body.store);
  }

  @Get('memberships/:id')
  membership(@CurrentCustomer() c: CustomerPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.me.membershipDetail(c, id);
  }

  /** Liga ou desliga as promoções de todos os estabelecimentos atuais de uma vez. */
  @Patch('consent')
  consentAll(@CurrentCustomer() c: CustomerPrincipal, @Body(new ZodPipe(consentSchema)) body: z.infer<typeof consentSchema>) {
    return this.me.setConsentAll(c, body.marketingConsent);
  }

  @Patch('memberships/:id/consent')
  consent(
    @CurrentCustomer() c: CustomerPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(consentSchema)) body: z.infer<typeof consentSchema>,
  ) {
    return this.me.setConsent(c, id, body.marketingConsent);
  }

  @Delete()
  async remove(
    @CurrentCustomer() c: CustomerPrincipal,
    @Body(new ZodPipe(deleteMeSchema)) body: z.infer<typeof deleteMeSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.me.deleteAccount(c, body);
    clearAuthCookies(res, 'customer');
    return r;
  }
}

@Controller('api/public')
export class PublicController {
  constructor(private readonly me: MeService) {}

  @Get('tenants/:slug')
  tenant(@Param('slug') slug: string) {
    return this.me.publicTenant(slug);
  }

  @Get('tenants/:slug/logo')
  async logo(@Param('slug') slug: string, @Query('v') v: string | undefined, @Res() res: Response) {
    sendImage(res, await this.me.logo(slug), v);
  }

  @Get('tenants/:slug/stamp')
  async stamp(@Param('slug') slug: string, @Query('v') v: string | undefined, @Res() res: Response) {
    sendImage(res, await this.me.stampImage(slug), v);
  }
}

/** Imagem guardada no banco (logo, selo), servida com cabeçalhos que impedem execução de conteúdo. */
function sendImage(res: Response, { data, mime }: { data: Buffer; mime: string }, v: string | undefined) {
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  // Com ?v= (versão do branding) a URL muda a cada troca de imagem: cache longo é seguro.
  res.setHeader('Cache-Control', v ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
  res.send(data);
}
