import { Controller, Post, Get, Patch, Body, Param, Headers, UnauthorizedException, Res, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { MasterService, RegisterMasterDto } from './master.service';
import { TgUser } from '../../common/decorators/tg-user.decorator';
import { TelegramUser } from '../auth/telegram-auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentMasterId } from '../../common/decorators/current-master.decorator';

@Controller('masters')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  // telegramId беремо з автентифікованого користувача, а не з тіла —
  // інакше можна було б зареєструвати майстра від чужого Telegram ID.
  @Post('register')
  register(@Body() dto: RegisterMasterDto, @TgUser() user: TelegramUser) {
    return this.masterService.register({ ...dto, telegramId: String(user.id) });
  }

  // Повертає профіль поточного авторизованого майстра за telegramId
  @Get('me')
  findMe(@TgUser() user: TelegramUser) {
    return this.masterService.findByTelegramId(String(user.id));
  }

  // Публічний профіль для сторінки бронювання — без чутливих полів (botToken тощо).
  @Public()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.masterService.findPublicById(id);
  }

  // Публічний проксі аватара з Telegram. Токен бота лишається на сервері —
  // клієнт отримує лише байти зображення. 404, якщо фото немає/приховане.
  @Public()
  @Get(':id/avatar')
  async avatar(@Param('id') id: string, @Res() res: Response) {
    const photo = await this.masterService.getTelegramAvatar(id);
    if (!photo) throw new NotFoundException('Аватар недоступний');
    res.setHeader('Content-Type', photo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(photo.buffer);
  }

  // :id ігнорується — майстер може редагувати лише власний профіль,
  // і лише дозволений набір полів (не botToken/status/telegramId).
  @Patch(':id')
  update(@CurrentMasterId() masterId: string, @Body() body: any) {
    return this.masterService.updateOwnProfile(masterId, body);
  }

  // Ручна активація/продовження підписки. Захищено адмін-секретом
  // (поки немає вебхука платіжки — засновник активує після підтвердження оплати).
  @Public()
  @Post(':id/subscription/activate')
  activateSubscription(
    @Param('id') id: string,
    @Headers('x-admin-secret') secret: string,
    @Body() body: { months?: number; plan?: string },
  ) {
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      throw new UnauthorizedException('Невалідний адмін-секрет');
    }
    return this.masterService.activateSubscription(id, { months: body?.months, plan: body?.plan });
  }

  // ПОВНЕ безповоротне видалення майстра і всіх його даних. Захищено адмін-секретом.
  @Public()
  @Post(':id/delete-account')
  deleteAccount(
    @Param('id') id: string,
    @Headers('x-admin-secret') secret: string,
  ) {
    if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
      throw new UnauthorizedException('Невалідний адмін-секрет');
    }
    return this.masterService.deleteMaster(id);
  }
}
