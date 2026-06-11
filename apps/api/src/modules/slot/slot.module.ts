import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Slot } from '../../database/entities/slot.entity';
import { SlotService } from './slot.service';
import { SlotController } from './slot.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Slot])],
  controllers: [SlotController],
  providers: [SlotService],
  exports: [SlotService],
})
export class SlotModule {}
