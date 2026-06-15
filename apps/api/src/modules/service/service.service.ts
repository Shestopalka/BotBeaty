import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service, PriceType } from '../../database/entities/service.entity';

export interface CreateServiceDto {
  masterId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceType?: PriceType;
  price: number;
  priceMax?: number | null;
  currency?: string;
  imageUrl?: string;
}

export interface UpdateServiceDto {
  name?: string;
  description?: string;
  durationMinutes?: number;
  priceType?: PriceType;
  price?: number;
  priceMax?: number | null;
  currency?: string;
  isActive?: boolean;
  imageUrl?: string;
}

/**
 * Нормалізує поля ціни: для діапазону вимагає priceMax > price,
 * для фіксованої — обнуляє priceMax. Кидає 400 при невалідних даних.
 */
function normalizePrice(dto: { priceType?: PriceType; price?: number; priceMax?: number | null }) {
  if (dto.priceType === PriceType.RANGE) {
    const from = Number(dto.price);
    const to = Number(dto.priceMax);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new BadRequestException('Для діапазону вкажіть ціну «від» і «до».');
    }
    if (to <= from) {
      throw new BadRequestException('Ціна «до» має бути більшою за «від».');
    }
  } else if (dto.priceType === PriceType.FIXED) {
    dto.priceMax = null;
  }
}

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private serviceRepo: Repository<Service>,
  ) {}

  async create(dto: CreateServiceDto): Promise<Service> {
    normalizePrice(dto);
    const service = this.serviceRepo.create({
      ...dto,
      priceType: dto.priceType ?? PriceType.FIXED,
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
    // Валідуємо вже за об'єднаним станом (старі значення + нові з dto).
    normalizePrice(service);
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
