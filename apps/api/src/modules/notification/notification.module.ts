import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Appointment } from '../../database/entities/appointment.entity';
import { Master } from '../../database/entities/master.entity';
import { NotificationProcessor } from './notification.processor';
import { ReminderScheduler } from './reminder.scheduler';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Master]),
    BullModule.registerQueue({ name: 'notifications' }),
    BotModule,
  ],
  providers: [NotificationProcessor, ReminderScheduler],
})
export class NotificationModule {}
