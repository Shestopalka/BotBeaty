import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Appointment } from '../../database/entities/appointment.entity';
import { Slot } from '../../database/entities/slot.entity';
import { Client } from '../../database/entities/client.entity';
import { Service } from '../../database/entities/service.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { Master } from '../../database/entities/master.entity';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Slot, Client, Service, AuditLog, Master]),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
