import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Payment, PaymentStatus, PaymentMethod } from '../../database/entities/payment.entity';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { AuditLog, AuditAction } from '../../database/entities/audit-log.entity';
import { BotService } from '../bot/bot.service';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,

    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,

    private dataSource: DataSource,
    private configService: ConfigService,
    private botService: BotService,
  ) {}

  /**
   * Надіслати інвойс через Telegram Payments
   */
  async sendTelegramInvoice(appointmentId: string): Promise<void> {
    const apt = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['client', 'service', 'master', 'slot'],
    });
    if (!apt) throw new NotFoundException('Запис не знайдено');

    const slotTime = apt.slot.startAt.toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    const masterBots = (this.botService as any).masterBots as Map<string, any>;
    const bot = masterBots.get(apt.masterId);
    if (!bot) throw new BadRequestException('Бот майстра не активний');

    const providerToken = this.configService.get<string>('telegram.paymentProviderToken');

    await bot.telegram.sendInvoice(
      apt.client.telegramId,
      apt.service.name,                              // title
      `Запис до майстра ${apt.master.fullName}\n📅 ${slotTime}`, // description
      appointmentId,                                 // payload (наш ID)
      providerToken,                                 // payment provider
      'UAH',                                         // currency
      [{ label: apt.service.name, amount: Math.round(Number(apt.pricePaid) * 100) }], // prices (в копійках)
    );

    // Зберігаємо pending payment
    await this.paymentRepo.save({
      appointmentId,
      amount: apt.pricePaid,
      currency: 'UAH',
      status: PaymentStatus.PENDING,
      method: PaymentMethod.TELEGRAM,
    });
  }

  /**
   * Обробити успішний платіж від Telegram (pre_checkout_query + successful_payment)
   */
  async handleSuccessfulPayment(
    appointmentId: string,
    telegramChargeId: string,
    providerChargeId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const payment = await manager.getRepository(Payment).findOne({
        where: { appointmentId },
      });
      if (!payment) throw new NotFoundException('Платіж не знайдено');

      payment.status = PaymentStatus.PAID;
      payment.telegramChargeId = telegramChargeId;
      payment.providerPaymentId = providerChargeId;
      payment.paidAt = new Date();

      await manager.getRepository(Payment).save(payment);

      // Підтверджуємо запис
      await manager.getRepository(Appointment).update(appointmentId, {
        status: AppointmentStatus.CONFIRMED,
      });

      // Audit log
      await manager.getRepository(AuditLog).save({
        tableName: 'payments',
        recordId: payment.id,
        action: AuditAction.UPDATE,
        oldData: { status: PaymentStatus.PENDING },
        newData: { status: PaymentStatus.PAID, telegramChargeId },
        changedByType: 'system',
      });
    });
  }

  async getByAppointment(appointmentId: string): Promise<Payment> {
    return this.paymentRepo.findOne({ where: { appointmentId } });
  }
}
