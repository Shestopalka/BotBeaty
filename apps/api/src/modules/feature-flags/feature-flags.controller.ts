import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Керування feature flags. Усі ендпойнти захищені адмін-секретом
 * (той самий x-admin-secret, що й активація підписки/видалення акаунта).
 * Поки немає повноцінної адмінки — засновник керує вручну (curl / Postman).
 */
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly service: FeatureFlagsService) {}

  private assertAdmin(secret: string) {
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      throw new UnauthorizedException('Невалідний адмін-секрет');
    }
  }

  // Перелік усіх фіч + їхній глобальний стан.
  @Public()
  @Get()
  list(@Headers('x-admin-secret') secret: string) {
    this.assertAdmin(secret);
    return this.service.listAll();
  }

  // Глобально увімкнути/вимкнути фічу: { "enabled": true }
  @Public()
  @Post(':key')
  setGlobal(
    @Param('key') key: string,
    @Headers('x-admin-secret') secret: string,
    @Body() body: { enabled?: boolean },
  ) {
    this.assertAdmin(secret);
    return this.service.setGlobal(key, body?.enabled === true);
  }

  // Персональний override для майстра (бета-тест): { "enabled": true }
  @Public()
  @Post('master/:masterId/:key')
  setMasterOverride(
    @Param('masterId') masterId: string,
    @Param('key') key: string,
    @Headers('x-admin-secret') secret: string,
    @Body() body: { enabled?: boolean },
  ) {
    this.assertAdmin(secret);
    return this.service.setMasterOverride(masterId, key, body?.enabled === true);
  }
}
