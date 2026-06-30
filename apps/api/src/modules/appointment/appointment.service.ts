import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Appointment, AppointmentStatus } from '../../database/entities/appointment.entity';
import { Master, SubscriptionStatus } from '../../database/entities/master.entity';
import { Slot } from '../../database/entities/slot.entity';
import { Client, ClientTag } from '../../database/entities/client.entity';
import { Service } from '../../database/entities/service.entity';
import { AuditLog, AuditAction } from '../../database/entities/audit-log.entity';

export interface CreateAppointmentDto {
  masterTelegramId?: string;
  masterId: string;
  clientTelegramId: string;
  clientName: string;
  serviceId: string;
  slotId: string;
  clientNote?: string;
  clientPhone?: string;
}

export interface CreateByMasterDto {
  masterId: string;
  serviceId: string;
  slotId: string;
  clientId?: string;     // існуючий клієнт
  clientName?: string;   // або новий офлайн-клієнт
  clientPhone?: string;
}

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,

    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,

    @InjectRepository(Client)
    private clientRepo: Repository<Client>,

    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,

    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,

    @InjectRepository(Master)
    private masterRepo: Repository<Master>,

    private dataSource: DataSource,

    @InjectQueue('notifications')
    private notificationsQueue: Queue,
  ) {}

  /**
   * Створити запис клієнта.
   * Використовує транзакцію — або все записується, або нічого.
   */
  async createAppointment(dto: CreateAppointmentDto): Promise<Appointment> {
    return await this.dataSource.transaction(async (manager) => {
      // 1. Перевіряємо що слот існує і вільний (з блокуванням рядка)
      const slot = await manager
        .getRepository(Slot)
        .createQueryBuilder('slot')
        .setLock('pessimistic_write') // Row-level lock
        .where('slot.id = :id', { id: dto.slotId })
        .andWhere('slot.masterId = :masterId', { masterId: dto.masterId })
        .andWhere('slot.deletedAt IS NULL')
        .getOne();

      if (!slot) throw new NotFoundException('Слот не знайдено');
      if (slot.isBooked) throw new ConflictException('Цей час вже зайнятий');

      // 2. Перевіряємо послугу
      const service = await manager.getRepository(Service).findOne({
        where: { id: dto.serviceId, masterId: dto.masterId, isActive: true },
      });
      if (!service) throw new NotFoundException('Послугу не знайдено');

      // 3. Знаходимо або створюємо клієнта
      let client = await manager.getRepository(Client).findOne({
        where: { telegramId: dto.clientTelegramId, masterId: dto.masterId },
      });

      const phone = dto.clientPhone?.trim() || undefined;

      if (!client) {
        client = manager.getRepository(Client).create({
          telegramId: dto.clientTelegramId,
          fullName: dto.clientName,
          masterId: dto.masterId,
          phone,
          tag: ClientTag.NEW,
        });
        await manager.getRepository(Client).save(client);
      } else if (phone && client.phone !== phone) {
        // Оновлюємо номер, якщо клієнт вказав новий/інший.
        client.phone = phone;
        await manager.getRepository(Client).save(client);
      }

      // Блокований клієнт не може записатись
      if (client.tag === ClientTag.BLOCKED || client.tag === ClientTag.UNWANTED) {
        throw new BadRequestException('Запис недоступний');
      }

      // Ліміт записів на клієнта НА ДЕНЬ — налаштовується майстром.
      // Рахуємо активні (pending/confirmed) МАЙБУТНІ записи цього клієнта на той
      // самий КИЇВСЬКИЙ день, що й обраний слот. Записи, час яких уже минув, не
      // блокують новий — клієнт може записатись на пізніший час того ж дня.
      const masterLimitRow = await manager.getRepository(Master).findOne({
        where: { id: dto.masterId },
        select: ['maxBookingsPerDayPerClient', 'subscriptionStatus', 'trialEndsAt', 'currentPeriodEnd'],
      });

      // Paywall: нові записи приймаються лише поки підписка майстра діє (тріал/active).
      const accessUntil = masterLimitRow?.currentPeriodEnd ?? masterLimitRow?.trialEndsAt;
      const subLive =
        (masterLimitRow?.subscriptionStatus === SubscriptionStatus.TRIALING ||
          masterLimitRow?.subscriptionStatus === SubscriptionStatus.ACTIVE) &&
        !!accessUntil && new Date(accessUntil).getTime() >= Date.now();
      if (!subLive) {
        throw new BadRequestException('Майстер тимчасово не приймає онлайн-записи.');
      }

      const perDayLimit = masterLimitRow?.maxBookingsPerDayPerClient ?? 1;
      const sameDayCount = await manager
        .getRepository(Appointment)
        .createQueryBuilder('apt')
        .innerJoin('apt.slot', 's')
        .where('apt.clientId = :clientId', { clientId: client.id })
        .andWhere('apt.masterId = :masterId', { masterId: dto.masterId })
        .andWhere('apt.status IN (:...st)', {
          st: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        })
        .andWhere('apt.deletedAt IS NULL')
        .andWhere('s."startAt" > now()') // минулі записи дня не враховуємо
        .andWhere(
          `(s."startAt" AT TIME ZONE 'Europe/Kyiv')::date = (:slotStart::timestamptz AT TIME ZONE 'Europe/Kyiv')::date`,
          { slotStart: slot.startAt.toISOString() },
        )
        .getCount();
      if (sameDayCount >= perDayLimit) {
        throw new BadRequestException(
          perDayLimit === 1
            ? 'На цей день у вас уже є запис. Оберіть інший день.'
            : `На цей день можна мати щонайбільше ${perDayLimit} записів.`,
        );
      }

      // 4. Бронюємо слот (з оптимістичним локом)
      const slotUpdateResult = await manager
        .getRepository(Slot)
        .createQueryBuilder()
        .update()
        .set({ isBooked: true, version: () => 'version + 1' })
        .where('id = :id AND version = :version AND isBooked = false', {
          id: slot.id,
          version: slot.version,
        })
        .execute();

      if (slotUpdateResult.affected === 0) {
        throw new ConflictException('Слот щойно зайняв інший клієнт. Оберіть інший час.');
      }

      // 5. Створюємо запис
      const appointment = manager.getRepository(Appointment).create({
        masterId: dto.masterId,
        clientId: client.id,
        serviceId: service.id,
        slotId: slot.id,
        pricePaid: service.price,
        currency: service.currency || 'UAH',
        clientNote: dto.clientNote,
        status: AppointmentStatus.PENDING,
      });

      const saved = await manager.getRepository(Appointment).save(appointment);

      // Якщо майстер увімкнув autoConfirm — одразу підтверджуємо без очікування
      const masterSettings = await manager.getRepository(Master).findOne({
        where: { id: dto.masterId },
        select: ['autoConfirm'],
      });
      if (masterSettings?.autoConfirm) {
        saved.status = AppointmentStatus.CONFIRMED;
        await manager.getRepository(Appointment).update(saved.id, { status: AppointmentStatus.CONFIRMED });
      }

      // 6. Пишемо в audit log
      await manager.getRepository(AuditLog).save({
        tableName: 'appointments',
        recordId: saved.id,
        action: AuditAction.INSERT,
        newData: { ...saved },
        changedBy: client.id,
        changedByType: 'client',
      });

      // 7. Ставимо в чергу нотифікації
      await this.notificationsQueue.add('appointment_created', {
        appointmentId: saved.id,
        masterId: dto.masterId,
        clientTelegramId: dto.clientTelegramId,
      });

      return saved;
    });
  }

  /**
   * Запис, який створює САМ МАЙСТЕР (напр. клієнт зателефонував).
   * Одразу підтверджений, ігнорує ліміт записів/пейвол. Клієнт може бути
   * існуючий (clientId) або новий офлайн (clientName + clientPhone, без Telegram).
   */
  async createByMaster(dto: CreateByMasterDto): Promise<Appointment> {
    return await this.dataSource.transaction(async (manager) => {
      const slot = await manager
        .getRepository(Slot)
        .createQueryBuilder('slot')
        .setLock('pessimistic_write')
        .where('slot.id = :id', { id: dto.slotId })
        .andWhere('slot.masterId = :masterId', { masterId: dto.masterId })
        .andWhere('slot.deletedAt IS NULL')
        .getOne();
      if (!slot) throw new NotFoundException('Слот не знайдено');
      if (slot.isBooked) throw new ConflictException('Цей час вже зайнятий');

      const service = await manager.getRepository(Service).findOne({
        where: { id: dto.serviceId, masterId: dto.masterId, isActive: true },
      });
      if (!service) throw new NotFoundException('Послугу не знайдено');

      // Визначаємо клієнта: існуючий за id, або новий офлайн за іменем/телефоном.
      let client: Client | null = null;
      if (dto.clientId) {
        client = await manager.getRepository(Client).findOne({
          where: { id: dto.clientId, masterId: dto.masterId },
        });
        if (!client) throw new NotFoundException('Клієнта не знайдено');
      } else {
        const name = dto.clientName?.trim();
        if (!name) throw new BadRequestException('Вкажіть імʼя клієнта');
        const phone = dto.clientPhone?.trim() || undefined;
        // Дедуп: якщо вказано телефон — шукаємо наявну картку з цим номером.
        if (phone) {
          client = await manager.getRepository(Client).findOne({
            where: { masterId: dto.masterId, phone },
          });
        }
        if (!client) {
          client = manager.getRepository(Client).create({
            masterId: dto.masterId,
            fullName: name,
            phone,
            telegramId: null,
            tag: ClientTag.NEW,
          });
          await manager.getRepository(Client).save(client);
        }
      }

      if (client.tag === ClientTag.BLOCKED || client.tag === ClientTag.UNWANTED) {
        throw new BadRequestException('Цей клієнт заблокований');
      }

      const upd = await manager
        .getRepository(Slot)
        .createQueryBuilder()
        .update()
        .set({ isBooked: true, version: () => 'version + 1' })
        .where('id = :id AND version = :version AND isBooked = false', {
          id: slot.id,
          version: slot.version,
        })
        .execute();
      if (upd.affected === 0) {
        throw new ConflictException('Слот щойно зайняли. Оберіть інший час.');
      }

      const appointment = manager.getRepository(Appointment).create({
        masterId: dto.masterId,
        clientId: client.id,
        serviceId: service.id,
        slotId: slot.id,
        pricePaid: service.price,
        currency: service.currency || 'UAH',
        status: AppointmentStatus.CONFIRMED, // майстер створює → одразу підтверджено
      });
      const saved = await manager.getRepository(Appointment).save(appointment);

      await manager.getRepository(AuditLog).save({
        tableName: 'appointments',
        recordId: saved.id,
        action: AuditAction.INSERT,
        newData: { ...saved },
        changedBy: dto.masterId,
        changedByType: 'master',
      });

      // Сповіщаємо клієнта лише якщо в нього є Telegram.
      if (client.telegramId) {
        await this.notificationsQueue.add('appointment_status_changed', {
          appointmentId: saved.id,
          oldStatus: AppointmentStatus.PENDING,
          newStatus: AppointmentStatus.CONFIRMED,
        });
      }

      return saved;
    });
  }

  /**
   * Підтвердити / скасувати / завершити запис
   */
  async updateStatus(
    appointmentId: string,
    masterId: string,
    newStatus: AppointmentStatus,
  ): Promise<Appointment> {
    return await this.dataSource.transaction(async (manager) => {
      const appointment = await manager.getRepository(Appointment).findOne({
        where: { id: appointmentId, masterId },
        relations: ['client', 'service', 'slot'],
      });

      if (!appointment) throw new NotFoundException('Запис не знайдено');

      const oldStatus = appointment.status;
      appointment.status = newStatus;

      // Якщо скасовуємо — звільняємо слот
      if (
        newStatus === AppointmentStatus.CANCELLED_CLIENT ||
        newStatus === AppointmentStatus.CANCELLED_MASTER ||
        newStatus === AppointmentStatus.NO_SHOW
      ) {
        await manager.getRepository(Slot).update(appointment.slotId, {
          isBooked: false,
        });
      }

      const saved = await manager.getRepository(Appointment).save(appointment);

      // Audit log
      await manager.getRepository(AuditLog).save({
        tableName: 'appointments',
        recordId: saved.id,
        action: AuditAction.UPDATE,
        oldData: { status: oldStatus },
        newData: { status: newStatus },
        changedBy: masterId,
        changedByType: 'master',
      });

      // Нотифікація клієнту
      await this.notificationsQueue.add('appointment_status_changed', {
        appointmentId: saved.id,
        oldStatus,
        newStatus,
      });

      return saved;
    });
  }

  /**
   * Скасування запису самим клієнтом.
   * Перевіряє, що запис справді належить цьому клієнту (за telegramId),
   * а не довіряє masterId/clientId з фронтенду.
   */
  async cancelByClient(
    appointmentId: string,
    clientTelegramId: string,
  ): Promise<Appointment> {
    return await this.dataSource.transaction(async (manager) => {
      const appointment = await manager.getRepository(Appointment).findOne({
        where: { id: appointmentId },
        relations: ['client', 'slot'],
      });

      if (!appointment) throw new NotFoundException('Запис не знайдено');
      if (appointment.client?.telegramId !== clientTelegramId) {
        throw new BadRequestException('Запис недоступний');
      }
      if (
        appointment.status !== AppointmentStatus.PENDING &&
        appointment.status !== AppointmentStatus.CONFIRMED
      ) {
        throw new BadRequestException('Цей запис не можна скасувати');
      }

      // Ліміт скасування майстра: не пізніше ніж за cancellationHours годин до запису.
      const masterRow = await manager.getRepository(Master).findOne({
        where: { id: appointment.masterId },
        select: ['cancellationHours'],
      });
      const ch = masterRow?.cancellationHours ?? 0;
      if (ch > 0 && appointment.slot?.startAt) {
        const hoursLeft =
          (new Date(appointment.slot.startAt).getTime() - Date.now()) / 3_600_000;
        if (hoursLeft < ch) {
          const left = hoursLeft <= 0
            ? 'запис уже почався'
            : `лишилось ~${Math.round(hoursLeft)} год`;
          throw new BadRequestException(
            `Скасувати можна не пізніше ніж за ${ch} год до запису (${left}). Звʼяжіться з майстром.`,
          );
        }
      }

      const oldStatus = appointment.status;
      appointment.status = AppointmentStatus.CANCELLED_CLIENT;
      await manager.getRepository(Slot).update(appointment.slotId, { isBooked: false });
      const saved = await manager.getRepository(Appointment).save(appointment);

      await manager.getRepository(AuditLog).save({
        tableName: 'appointments',
        recordId: saved.id,
        action: AuditAction.UPDATE,
        oldData: { status: oldStatus },
        newData: { status: AppointmentStatus.CANCELLED_CLIENT },
        changedBy: appointment.clientId,
        changedByType: 'client',
      });

      await this.notificationsQueue.add('appointment_status_changed', {
        appointmentId: saved.id,
        oldStatus,
        newStatus: AppointmentStatus.CANCELLED_CLIENT,
      });

      return saved;
    });
  }

  /**
   * Повне видалення запису (безповоротно) — щоб не «мозолив очі» в розкладі.
   * Якщо слот був ще заброньований — звільняємо його. Чистимо аудит-лог.
   */
  async deleteAppointment(appointmentId: string, masterId: string): Promise<{ deleted: true }> {
    return await this.dataSource.transaction(async (manager) => {
      const apt = await manager.getRepository(Appointment).findOne({
        where: { id: appointmentId, masterId },
        withDeleted: true,
      });
      if (!apt) throw new NotFoundException('Запис не знайдено');

      // Якщо слот ще зайнятий цим записом — звільняємо.
      if (apt.slotId) {
        await manager.getRepository(Slot).update(apt.slotId, { isBooked: false });
      }
      await manager.getRepository(AuditLog).delete({ recordId: appointmentId });
      await manager.getRepository(Appointment).delete({ id: appointmentId });
      return { deleted: true };
    });
  }

  /**
   * Київські дати (YYYY-MM-DD) у діапазоні, де є хоч один активний запис —
   * для позначок-крапок у календарі майстра.
   */
  async getDaysWithAppointments(masterId: string, from: Date, to: Date): Promise<string[]> {
    const rows = await this.appointmentRepo
      .createQueryBuilder('apt')
      .innerJoin('apt.slot', 's')
      .select(`to_char((s."startAt" AT TIME ZONE 'Europe/Kyiv'), 'YYYY-MM-DD')`, 'd')
      .where('apt.masterId = :masterId', { masterId })
      .andWhere('apt.deletedAt IS NULL')
      .andWhere('s."startAt" BETWEEN :from AND :to', { from, to })
      .groupBy('d')
      .getRawMany();
    return rows.map((r) => r.d);
  }

  async getByMaster(masterId: string, date?: Date): Promise<Appointment[]> {
    const qb = this.appointmentRepo
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.client', 'client')
      .leftJoinAndSelect('apt.service', 'service')
      .leftJoinAndSelect('apt.slot', 'slot')
      .where('apt.masterId = :masterId', { masterId })
      .andWhere('apt.deletedAt IS NULL');

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('slot.startAt BETWEEN :start AND :end', { start, end });
    }

    return qb.orderBy('slot.startAt', 'ASC').getMany();
  }
}
