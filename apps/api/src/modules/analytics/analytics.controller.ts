import { Controller, Get, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentMasterId } from '../../common/decorators/current-master.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // :masterId у шляху ігнорується — використовуємо id автентифікованого
  // майстра, щоб не можна було читати чужу аналітику.
  @Get('master/:masterId')
  getDashboard(
    @Param('masterId') _ignored: string,
    @CurrentMasterId() masterId: string,
  ) {
    return this.analyticsService.getDashboard(masterId);
  }
}
