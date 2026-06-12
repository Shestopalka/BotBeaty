import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Master } from '../../database/entities/master.entity';
import { Service } from '../../database/entities/service.entity';
import { MasterService } from './master.service';
import { MasterController } from './master.controller';
import { SubscriptionScheduler } from './subscription.scheduler';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [TypeOrmModule.forFeature([Master, Service]), BotModule],
  controllers: [MasterController],
  providers: [MasterService, SubscriptionScheduler],
  exports: [MasterService],
})
export class MasterModule {}
