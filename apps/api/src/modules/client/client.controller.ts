import { Controller, Get, Patch, Post, Body, Param, Query } from '@nestjs/common';
import { ClientService } from './client.service';
import { ClientTag } from '../../database/entities/client.entity';
import { CurrentMasterId } from '../../common/decorators/current-master.decorator';

// masterId завжди береться з автентифікованого майстра (@CurrentMasterId),
// а не з URL/тіла — це гарантує, що майстер бачить і змінює лише СВОЇХ клієнтів.
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get('master/:masterId')
  getByMaster(
    @CurrentMasterId() masterId: string,
    @Query('tag') tag?: ClientTag,
  ) {
    return this.clientService.getByMaster(masterId, tag);
  }

  @Patch(':id/tag')
  updateTag(
    @Param('id') id: string,
    @CurrentMasterId() masterId: string,
    @Body() body: { tag: ClientTag },
  ) {
    return this.clientService.updateTag(id, masterId, body.tag);
  }

  @Patch(':id/notes')
  updateNotes(
    @Param('id') id: string,
    @CurrentMasterId() masterId: string,
    @Body() body: { notes: string },
  ) {
    return this.clientService.updateNotes(id, masterId, body.notes);
  }

  @Post(':id/block')
  block(@Param('id') id: string, @CurrentMasterId() masterId: string) {
    return this.clientService.block(id, masterId);
  }
}
