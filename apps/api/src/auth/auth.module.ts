import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CustomerAuthGuard } from './customer-auth.guard';
import { CustomerAuthService } from './customer-auth.service';
import { OAuthService } from './oauth.service';
import { LoginRateLimiter } from './rate-limiter.service';
import { SessionsService } from './sessions.service';
import { StaffAuthController } from './staff-auth.controller';
import { StaffGuard } from './staff-auth.guard';
import { StaffAuthService } from './staff-auth.service';
import { TokensService } from './tokens.service';

@Global()
@Module({
  controllers: [AuthController, StaffAuthController],
  providers: [
    TokensService,
    SessionsService,
    LoginRateLimiter,
    CustomerAuthService,
    OAuthService,
    StaffAuthService,
    CustomerAuthGuard,
    StaffGuard,
  ],
  exports: [TokensService, SessionsService, CustomerAuthService, CustomerAuthGuard, StaffGuard, LoginRateLimiter],
})
export class AuthModule {}
