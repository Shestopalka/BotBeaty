import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramAuthService } from './telegram-auth.service';
import { Master } from '../../database/entities/master.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Master])],
  providers: [TelegramAuthGuard, TelegramAuthService],
  exports: [TelegramAuthGuard, TelegramAuthService],
})
export class AuthModule {}
