import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from '../../database/entities/service.entity';

export interface CreateServiceDto {
  masterId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  currency?: string;
  imageUrl?: string;
}

export interface UpdateServiceDto {
  name?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  currency?: string;
  isActive?: boolean;
  imageUrl?: string;
}

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,
  ) {}

  async create(dto: CreateServiceDto): Promise<Service> {
    const service = this.serviceRepo.create({
      ...dto,
      currency: dto.currency ?? 'UAH',
      isActive: true,
    });
    return this.serviceRepo.save(service);
  }

  async getByMaster(masterId: string, onlyActive = false): Promise<Service[]> {
    const where: any = { masterId };
    if (onlyActive) where.isActive = true;
    return this.serviceRepo.find({
      where,
      order: { createdAt: 'ASC' },
    });
  }

  async update(id: string, masterId: string, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.serviceRepo.findOne({ where: { id, masterId } });
    if (!service) throw new NotFoundException('Послугу не знайдено');
    Object.assign(service, dto);
    return this.serviceRepo.save(service);
  }

  async delete(id: string, masterId: string): Promise<void> {
    const service = await this.serviceRepo.findOne({ where: { id, masterId } });
    if (!service) throw new NotFoundException('Послугу не знайдено');
    await this.serviceRepo.softDelete(id);
  }

  async toggleActive(id: string, masterId: string): Promise<Service> {
    const service = await this.serviceRepo.findOne({ where: { id, masterId } });
    if (!service) throw new NotFoundException('Послугу не знайдено');
    service.isActive = !service.isActive;
    return this.serviceRepo.save(service);
  }
}
