import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { Payment, PaymentStatus } from '../../database/entities/payment.entity';
import { Client, ClientTag } from '../../database/entities/client.entity';

export interface DashboardStats {
  // Поточний місяць
  revenueThisMonth: number;
  appointmentsThisMonth: number;
  newClientsThisMonth: number;
  completionRate: number; // % завершених від підтверджених

  // Порівняння з минулим місяцем
  revenueGrowth: number; // % зміна
  appointmentsGrowth: number;

  // Топ-послуги
  topServices: { name: string; count: number; revenue: number }[];

  // Дохід по днях (останні 30 днів)
  revenueByDay: { date: string; revenue: number; count: number }[];

  // Розподіл клієнтів по тегах
  clientsByTag: { tag: string; count: number }[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
  ) {}

  async getDashboard(masterId: string): Promise<DashboardStats> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Кінець місяця — рахуємо ВСІ записи місяця, включаючи майбутні
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      thisMonthStats,
      lastMonthStats,
      topServices,
      revenueByDay,
      clientsByTag,
    ] = await Promise.all([
      this.getMonthStats(masterId, thisMonthStart, thisMonthEnd),
      this.getMonthStats(masterId, lastMonthStart, lastMonthEnd),
      this.getTopServices(masterId, thisMonthStart, now),
      this.getRevenueByDay(masterId, last30days, now),
      this.getClientsByTag(masterId),
    ]);

    const revenueGrowth = lastMonthStats.revenue > 0
      ? Math.round(((thisMonthStats.revenue - lastMonthStats.revenue) / lastMonthStats.revenue) * 100)
      : 0;

    const appointmentsGrowth = lastMonthStats.total > 0
      ? Math.round(((thisMonthStats.total - lastMonthStats.total) / lastMonthStats.total) * 100)
      : 0;

    const completionRate = thisMonthStats.total > 0
      ? Math.round((thisMonthStats.completed / thisMonthStats.total) * 100)
      : 0;

    return {
      revenueThisMonth: thisMonthStats.revenue,
      appointmentsThisMonth: thisMonthStats.total,
      newClientsThisMonth: thisMonthStats.newClients,
      completionRate,
      revenueGrowth,
      appointmentsGrowth,
      topServices,
      revenueByDay,
      clientsByTag,
    };
  }

  private async getMonthStats(masterId: string, from: Date, to: Date) {
    const result = await this.appointmentRepo
      .createQueryBuilder('apt')
      .leftJoin('apt.slot', 'slot')
      .leftJoin('apt.client', 'client')
      .select([
        'COUNT(*) AS total',
        `SUM(CASE WHEN apt.status = '${AppointmentStatus.COMPLETED}' THEN 1 ELSE 0 END) AS completed`,
        `SUM(CASE WHEN apt.status = '${AppointmentStatus.COMPLETED}' THEN apt."pricePaid" ELSE 0 END) AS revenue`,
        `SUM(CASE WHEN client.tag = '${ClientTag.NEW}' THEN 1 ELSE 0 END) AS "newClients"`,
      ])
      .where('apt.masterId = :masterId', { masterId })
      .andWhere('slot.startAt BETWEEN :from AND :to', { from, to })
      .andWhere('apt.deletedAt IS NULL')
      .getRawOne();

    return {
      total: parseInt(result?.total ?? '0'),
      completed: parseInt(result?.completed ?? '0'),
      revenue: parseFloat(result?.revenue ?? '0'),
      newClients: parseInt(result?.newClients ?? '0'),
    };
  }

  private async getTopServices(masterId: string, from: Date, to: Date) {
    const results = await this.appointmentRepo
      .createQueryBuilder('apt')
      .leftJoin('apt.slot', 'slot')
      .leftJoin('apt.service', 'service')
      .select([
        'service.name AS name',
        'COUNT(*) AS count',
        'SUM(apt."pricePaid") AS revenue',
      ])
      .where('apt.masterId = :masterId', { masterId })
      .andWhere(`apt.status = '${AppointmentStatus.COMPLETED}'`)
      .andWhere('slot.startAt BETWEEN :from AND :to', { from, to })
      .andWhere('apt.deletedAt IS NULL')
      .groupBy('service.name')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();

    return results.map((r) => ({
      name: r.name,
      count: parseInt(r.count),
      revenue: parseFloat(r.revenue ?? '0'),
    }));
  }

  private async getRevenueByDay(masterId: string, from: Date, to: Date) {
    const results = await this.appointmentRepo
      .createQueryBuilder('apt')
      .leftJoin('apt.slot', 'slot')
      .select([
        `DATE(slot."startAt" AT TIME ZONE 'Europe/Kyiv') AS date`,
        'SUM(apt."pricePaid") AS revenue',
        'COUNT(*) AS count',
      ])
      .where('apt.masterId = :masterId', { masterId })
      .andWhere(`apt.status = '${AppointmentStatus.COMPLETED}'`)
      .andWhere('slot.startAt BETWEEN :from AND :to', { from, to })
      .andWhere('apt.deletedAt IS NULL')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      date: r.date,
      revenue: parseFloat(r.revenue ?? '0'),
      count: parseInt(r.count),
    }));
  }

  private async getClientsByTag(masterId: string) {
    const results = await this.clientRepo
      .createQueryBuilder('client')
      .select(['client.tag AS tag', 'COUNT(*) AS count'])
      .where('client.masterId = :masterId', { masterId })
      .andWhere('client.deletedAt IS NULL')
      .groupBy('client.tag')
      .getRawMany();

    return results.map((r) => ({
      tag: r.tag,
      count: parseInt(r.count),
    }));
  }
}
