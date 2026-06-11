import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ServiceService, CreateServiceDto, UpdateServiceDto } from './service.service';
import { CurrentMasterId } from '../../common/decorators/current-master.decorator';

// Усі операції з послугами прив'язані до автентифікованого майстра.
@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Post()
  create(@Body() dto: CreateServiceDto, @CurrentMasterId() masterId: string) {
    return this.serviceService.create({ ...dto, masterId });
  }

  @Get('master/:masterId')
  getByMaster(
    @CurrentMasterId() masterId: string,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.serviceService.getByMaster(masterId, onlyActive === 'true');
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentMasterId() masterId: string,
    @Body() body: UpdateServiceDto,
  ) {
    return this.serviceService.update(id, masterId, body);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @CurrentMasterId() masterId: string) {
    return this.serviceService.toggleActive(id, masterId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentMasterId() masterId: string) {
    return this.serviceService.delete(id, masterId);
  }
}
