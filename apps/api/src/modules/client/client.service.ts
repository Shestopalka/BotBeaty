import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client, ClientTag } from '../../database/entities/client.entity';

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private clientRepo: Repository<Client>,
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
}
