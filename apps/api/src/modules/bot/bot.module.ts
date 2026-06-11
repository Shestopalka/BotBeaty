import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Master } from '../../database/entities/master.entity';
import { Client } from '../../database/entities/client.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { Slot } from '../../database/entities/slot.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { BotRegistrationHandler } from './handlers/registration.handler';
import { BotMasterMenuHandler } from './handlers/master-menu.handler';
import { AppointmentCallbackHandler } from './handlers/appointment-callback.handler';
import { ClientBotHandler } from './handlers/client-bot.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Master, Client, Appointment, Slot, AuditLog]),
    ConfigModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [BotController],
  providers: [
    BotService,
    BotRegistrationHandler,
    BotMasterMenuHandler,
    AppointmentCallbackHandler,
    ClientBotHandler,
  ],
  exports: [BotService],
})
export class BotModule {}
