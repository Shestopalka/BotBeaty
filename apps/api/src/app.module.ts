import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { Master } from './database/entities/master.entity';
import { Client } from './database/entities/client.entity';
import { Service } from './database/entities/service.entity';
import { Slot } from './database/entities/slot.entity';
import { Appointment } from './database/entities/appointment.entity';
import { Payment } from './database/entities/payment.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { BotModule } from './modules/bot/bot.module';
import { MasterModule } from './modules/master/master.module';
import { ClientModule } from './modules/client/client.module';
import { SlotModule } from './modules/slot/slot.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuthModule } from './modules/auth/auth.module';
import { ServiceModule } from './modules/service/service.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'], // шукає спочатку apps/api/.env, потім корінь
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get('app.env') === 'production';
        const url = config.get<string>('database.url');
        const ssl = config.get<boolean>('database.ssl')
          ? { rejectUnauthorized: false }
          : false;
        return {
          type: 'postgres',
          // На проді — один DATABASE_URL; локально — окремі поля.
          ...(url
            ? { url }
            : {
                host: config.get('database.host'),
                port: config.get('database.port'),
                username: config.get('database.username'),
                password: config.get('database.password'),
                database: config.get('database.name'),
              }),
          entities: [Master, Client, Service, Slot, Appointment, Payment, AuditLog],
          migrations: ['dist/database/migrations/*.js'],
          // У проді схему створюють/оновлюють міграції, а не synchronize.
          migrationsRun: isProd,
          synchronize: !isProd, // auto-create tables в dev
          ssl,
          logging: config.get('app.env') === 'development',
        } as any;
      },
    }),

    // Redis / Queue
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url');
        if (url) {
          // ВАЖЛИВО: BullMQ НЕ парсить рядок-URL (робить Object.assign і падає
          // на 127.0.0.1:6379). Тому розбираємо URL у нормальний обʼєкт.
          const u = new URL(url);
          return {
            connection: {
              host: u.hostname,
              port: Number(u.port) || 6379,
              username: u.username ? decodeURIComponent(u.username) : undefined,
              password: u.password ? decodeURIComponent(u.password) : undefined,
              ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
            },
          };
        }
        return {
          connection: {
            host: config.get('redis.host'),
            port: config.get('redis.port'),
            username: config.get<string>('redis.username'),
            password: config.get<string>('redis.password'),
            ...(config.get('redis.tls') ? { tls: {} } : {}),
          },
        };
      },
    }),

    // Cron jobs
    ScheduleModule.forRoot(),

    // Feature modules
    BotModule,
    MasterModule,
    ClientModule,
    SlotModule,
    AppointmentModule,
    PaymentModule,
    NotificationModule,
    AnalyticsModule,
    AuthModule,
    ServiceModule,
  ],
})
export class AppModule {}
