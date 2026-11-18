import { Global, Module } from '@nestjs/common';
import { CheckoutClaimService, CheckoutPublicController } from '../pos/checkout-public.controller';
import { PosController } from '../pos/pos.controller';
import { PosService } from '../pos/pos.service';
import { LoyaltyService } from './loyalty.service';
import { PersonalQrService } from './personal-qr.service';

@Global()
@Module({
  controllers: [PosController, CheckoutPublicController],
  providers: [LoyaltyService, PersonalQrService, PosService, CheckoutClaimService],
  exports: [LoyaltyService, PersonalQrService],
})
export class LoyaltyModule {}
