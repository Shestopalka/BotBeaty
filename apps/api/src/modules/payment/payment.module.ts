import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../../database/entities/payment.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Appointment, AuditLog]), BotModule],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
