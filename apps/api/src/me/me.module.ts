import { Module } from '@nestjs/common';
import { MeController, PublicController } from './me.controller';
import { MeService } from './me.service';

@Module({ controllers: [MeController, PublicController], providers: [MeService] })
export class MeModule {}
