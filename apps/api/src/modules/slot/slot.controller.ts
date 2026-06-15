import { Controller, Post, Get, Delete, Body, Param, Query } from '@nestjs/common';
import { SlotService, CreateSlotsDto } from './slot.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentMasterId } from '../../common/decorators/current-master.decorator';

@Controller('slots')
export class SlotController {
  constructor(private readonly slotService: SlotService) {}

  // masterId з тіла ігнорується — слоти створюються лише для себе.
  @Post('bulk')
  createBulk(
    @Body() dto: CreateSlotsDto,
    @CurrentMasterId() masterId: string,
  ) {
    return this.slotService.createBulk({ ...dto, masterId });
  }

  // Публічний: найближчий вільний слот майстра (для вітального екрана).
  @Public()
  @Get('available/:masterId/next')
  getNextAvailable(@Param('masterId') masterId: string) {
    return this.slotService.getNextAvailable(masterId);
  }

  // Публічний: клієнт переглядає ВІЛЬНІ слоти конкретного майстра за його id.
  @Public()
  @Get('available/:masterId')
  getAvailable(
    @Param('masterId') masterId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.slotService.getAvailable(
      masterId,
      new Date(from),
      new Date(to),
    );
  }

  // Для майстра: УСІ його слоти (вільні + заброньовані). masterId — з автентифікації.
  @Get('master/:masterId')
  getForMaster(
    @CurrentMasterId() masterId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.slotService.getForMaster(masterId, new Date(from), new Date(to));
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentMasterId() masterId: string) {
    return this.slotService.deleteSlot(id, masterId);
  }
}
