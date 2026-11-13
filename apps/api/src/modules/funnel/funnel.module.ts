import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelEvent } from '../../database/entities/funnel-event.entity';
import { FunnelService } from './funnel.service';
import { FunnelController } from './funnel.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FunnelEvent])],
  controllers: [FunnelController],
  providers: [FunnelService],
  exports: [FunnelService],
})
export class FunnelModule {}
