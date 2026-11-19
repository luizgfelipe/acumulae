import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ProgramsService } from './programs.service';
import { ReportsService } from './reports.service';

@Module({ controllers: [AdminController], providers: [AdminService, ProgramsService, ReportsService] })
export class AdminModule {}
