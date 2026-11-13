import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Master } from '../../database/entities/master.entity';
import { Service } from '../../database/entities/service.entity';
import { MasterService } from './master.service';
import { MasterController } from './master.controller';
import { SubscriptionScheduler } from './subscription.scheduler';
import { BotModule } from '../bot/bot.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { FunnelModule } from '../funnel/funnel.module';

@Module({
  imports: [TypeOrmModule.forFeature([Master, Service]), BotModule, FeatureFlagsModule, FunnelModule],
  controllers: [MasterController],
  providers: [MasterService, SubscriptionScheduler],
  exports: [MasterService],
})
export class MasterModule {}
