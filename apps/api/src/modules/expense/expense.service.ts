import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Expense } from '../../database/entities/expense.entity';

export interface CreateExpenseDto {
  amount: number | string;
  description?: string;
  spentAt?: string;
}

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
  ) {}

  private parseAmount(raw: number | string | undefined): number {
    const n = typeof raw === 'string' ? parseFloat(raw.replace(',', '.')) : raw;
    if (n == null || !Number.isFinite(n)) throw new BadRequestException('Некоректна сума');
    if (n <= 0) throw new BadRequestException('Сума має бути більшою за 0');
    if (n > 100_000_000) throw new BadRequestException('Занадто велика сума');
    // Округлюємо до копійок.
    return Math.round(n * 100) / 100;
  }

  private parseDate(raw: string | undefined): Date {
    if (!raw) return new Date();
    const d = new Date(raw);
    if (isNaN(d.getTime())) throw new BadRequestException('Некоректна дата');
    return d;
  }

  async create(masterId: string, dto: CreateExpenseDto): Promise<Expense> {
    const amount = this.parseAmount(dto.amount);
    const description = (dto.description ?? '').trim() || null;
    if (description && description.length > 200) {
      throw new BadRequestException('Занадто довгий опис');
    }
    const spentAt = this.parseDate(dto.spentAt);
    const expense = this.expenseRepo.create({ masterId, amount, description, spentAt });
    return this.expenseRepo.save(expense);
  }

  /** Витрати майстра за період [from, to]. */
  async listByPeriod(masterId: string, from: Date, to: Date): Promise<Expense[]> {
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Некоректний період');
    }
    return this.expenseRepo.find({
      where: { masterId, spentAt: Between(from, to) },
      order: { spentAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async update(
    id: string,
    masterId: string,
    dto: Partial<CreateExpenseDto>,
  ): Promise<Expense> {
    const expense = await this.expenseRepo.findOne({ where: { id, masterId } });
    if (!expense) throw new NotFoundException('Витрату не знайдено');

    if (dto.amount !== undefined) expense.amount = this.parseAmount(dto.amount);
    if (dto.description !== undefined) {
      const d = (dto.description ?? '').trim();
      if (d.length > 200) throw new BadRequestException('Занадто довгий опис');
      expense.description = d || null;
    }
    if (dto.spentAt !== undefined) expense.spentAt = this.parseDate(dto.spentAt);

    return this.expenseRepo.save(expense);
  }

  async remove(id: string, masterId: string): Promise<{ deleted: true }> {
    const expense = await this.expenseRepo.findOne({ where: { id, masterId } });
    if (!expense) throw new NotFoundException('Витрату не знайдено');
    await this.expenseRepo.softDelete({ id, masterId });
    return { deleted: true };
  }
}
