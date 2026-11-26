import { Global, Module } from '@nestjs/common';
import { RateLimitStore } from './rate-limit.store';

@Global()
@Module({
  providers: [RateLimitStore],
  exports: [RateLimitStore],
})
export class RateLimitModule {}
