import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Master } from './entities/master.entity';
import { Client } from './entities/client.entity';
import { Service } from './entities/service.entity';
import { Slot } from './entities/slot.entity';
import { Appointment } from './entities/appointment.entity';
import { Payment } from './entities/payment.entity';
import { AuditLog } from './entities/audit-log.entity';

dotenv.config();

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '5432'),
        username: process.env.DATABASE_USER || 'beatybot',
        password: process.env.DATABASE_PASSWORD || 'beatybot_secret',
        database: process.env.DATABASE_NAME || 'beatybot_db',
      }),
  entities: [Master, Client, Service, Slot, Appointment, Payment, AuditLog],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // Тільки через міграції!
  logging: process.env.NODE_ENV === 'development',
  ssl,
} as any);
