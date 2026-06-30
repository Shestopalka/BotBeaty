import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Client, ClientTag } from '../../database/entities/client.entity';
import { Appointment } from '../../database/entities/appointment.entity';
import { Slot } from '../../database/entities/slot.entity';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async getByMaster(masterId: string, tag?: ClientTag): Promise<Client[]> {
    const where: any = { masterId };
    if (tag) where.tag = tag;
    return this.clientRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async updateTag(clientId: string, masterId: string, tag: ClientTag): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { id: clientId, masterId },
    });
    if (!client) throw new NotFoundException('Клієнта не знайдено');
    client.tag = tag;
    return this.clientRepo.save(client);
  }

  async updateNotes(clientId: string, masterId: string, notes: string): Promise<Client> {
    const client = await this.clientRepo.findOne({
      where: { id: clientId, masterId },
    });
    if (!client) throw new NotFoundException('Клієнта не знайдено');
    client.notes = notes;
    return this.clientRepo.save(client);
  }

  async block(clientId: string, masterId: string): Promise<Client> {
    return this.updateTag(clientId, masterId, ClientTag.BLOCKED);
  }

  /**
   * Повне видалення клієнта разом із його записами (безповоротно).
   * Звільняє слоти активних записів, чистить аудит-лог. Все в транзакції.
   */
  async delete(clientId: string, masterId: string): Promise<{ deleted: true }> {
    const client = await this.clientRepo.findOne({ where: { id: clientId, masterId } });
    if (!client) throw new NotFoundException('Клієнта не знайдено');

    await this.dataSource.transaction(async (manager) => {
      const appts = await manager.getRepository(Appointment).find({
        where: { clientId, masterId },
        withDeleted: true,
      });
      const apptIds = appts.map((a) => a.id);
      // Звільняємо слоти заброньованих записів цього клієнта.
      const slotIds = appts.filter((a) => a.slotId).map((a) => a.slotId);
      if (slotIds.length) {
        await manager.getRepository(Slot).update({ id: In(slotIds) }, { isBooked: false });
      }
      if (apptIds.length) {
        await manager.getRepository(AuditLog).delete({ recordId: In(apptIds) });
        await manager.getRepository(Appointment).delete({ id: In(apptIds) });
      }
      await manager.getRepository(AuditLog).delete({ recordId: clientId });
      await manager.getRepository(Client).delete({ id: clientId });
    });
    return { deleted: true };
  }
}
