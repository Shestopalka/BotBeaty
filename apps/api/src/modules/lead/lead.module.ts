import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../../database/entities/lead.entity';
import { LeadController } from './lead.controller';
import { LeadService } from './lead.service';
import { LeadMailer } from './lead-mailer';

@Module({
  imports: [TypeOrmModule.forFeature([Lead])],
  controllers: [LeadController],
  providers: [LeadService, LeadMailer],
})
export class LeadModule {}
