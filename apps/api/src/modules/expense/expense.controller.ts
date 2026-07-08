import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, BadRequestException,
} from '@nestjs/common';
import { ExpenseService, CreateExpenseDto } from './expense.service';
import { CurrentMasterId } from '../../common/decorators/current-master.decorator';

// masterId завжди з автентифікованого майстра — витрати ізольовані по майстрах.
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  create(@CurrentMasterId() masterId: string, @Body() body: CreateExpenseDto) {
    return this.expenseService.create(masterId, body);
  }

  @Get()
  list(
    @CurrentMasterId() masterId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!from || !to) throw new BadRequestException('Вкажіть період (from, to)');
    return this.expenseService.listByPeriod(masterId, new Date(from), new Date(to));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentMasterId() masterId: string,
    @Body() body: Partial<CreateExpenseDto>,
  ) {
    return this.expenseService.update(id, masterId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentMasterId() masterId: string) {
    return this.expenseService.remove(id, masterId);
  }
}
