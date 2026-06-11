import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':appointmentId/invoice')
  sendInvoice(@Param('appointmentId') appointmentId: string) {
    return this.paymentService.sendTelegramInvoice(appointmentId);
  }

  // Telegram надсилає цей event після успішної оплати.
  // ЗАХИСТ: раніше ендпоінт був повністю відкритий — будь-хто міг позначити
  // запис оплаченим. Тепер вимагаємо спільний секрет PAYMENT_WEBHOOK_SECRET.
  @Public()
  @Post('webhook/success')
  handleSuccess(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: {
      appointmentId: string;
      telegramChargeId: string;
      providerChargeId: string;
    },
  ) {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Невалідний секрет webhook');
    }
    return this.paymentService.handleSuccessfulPayment(
      body.appointmentId,
      body.telegramChargeId,
      body.providerChargeId,
    );
  }
}
