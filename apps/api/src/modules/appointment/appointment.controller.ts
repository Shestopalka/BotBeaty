import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AppointmentService, CreateAppointmentDto, CreateByMasterDto } from './appointment.service';
import { AppointmentStatus } from '../../database/entities/appointment.entity';
import {
  CurrentMasterId,
  OptionalMasterId,
} from '../../common/decorators/current-master.decorator';
import { TgUser } from '../../common/decorators/tg-user.decorator';
import { TelegramUser } from '../auth/telegram-auth.service';

// Статуси, які може виставляти лише майстер.
const MASTER_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CANCELLED_MASTER,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
]);

@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  // Створення запису клієнтом: clientTelegramId беремо з автентифікованого
  // користувача, а не з тіла — щоб не можна було записатись від чужого імені.
  @Post()
  create(
    @Body() dto: CreateAppointmentDto,
    @TgUser() user: TelegramUser,
  ) {
    return this.appointmentService.createAppointment({
      ...dto,
      clientTelegramId: String(user.id),
      clientName: dto.clientName || `${user.first_name} ${user.last_name ?? ''}`.trim(),
    });
  }

  // Майстер записує клієнта сам (телефонний/офлайн запис). masterId — з автентифікації.
  @Post('by-master')
  createByMaster(
    @Body() dto: CreateByMasterDto,
    @CurrentMasterId() masterId: string,
  ) {
    return this.appointmentService.createByMaster({ ...dto, masterId });
  }

  @Get('master/:masterId')
  getByMaster(
    @CurrentMasterId() masterId: string,
    @Query('date') date?: string,
  ) {
    return this.appointmentService.getByMaster(
      masterId,
      date ? new Date(date) : undefined,
    );
  }

  // Один ендпоінт обслуговує і майстра, і клієнта — розгалужуємо за статусом
  // і перевіряємо відповідні права для кожного шляху.
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: AppointmentStatus },
    @TgUser() user: TelegramUser,
    @OptionalMasterId() masterId: string | undefined,
  ) {
    if (body.status === AppointmentStatus.CANCELLED_CLIENT) {
      // Клієнт скасовує власний запис — перевірка власності всередині сервісу.
      return this.appointmentService.cancelByClient(id, String(user.id));
    }

    if (!MASTER_STATUSES.has(body.status)) {
      throw new BadRequestException('Недопустимий статус');
    }

    // Дії майстра — masterId беремо з автентифікації (request.masterId),
    // ніколи з тіла запиту.
    if (!masterId) {
      throw new ForbiddenException('Доступ лише для зареєстрованих майстрів');
    }
    return this.appointmentService.updateStatus(id, masterId, body.status);
  }

  // Майстер повністю видаляє запис (щоб не лишався в розкладі). masterId — з авт.
  @Delete(':id')
  delete(@Param('id') id: string, @CurrentMasterId() masterId: string) {
    return this.appointmentService.deleteAppointment(id, masterId);
  }
}
