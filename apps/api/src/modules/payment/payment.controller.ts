import { Controller, Post, Body, Param } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':appointmentId/invoice')
  sendInvoice(@Param('appointmentId') appointmentId: string) {
    return this.paymentService.sendTelegramInvoice(appointmentId);
  }

  // Telegram надсилає цей event після успішної оплати
  @Public()
  @Post('webhook/success')
  handleSuccess(
    @Body() body: {
      appointmentId: string;
      telegramChargeId: string;
      providerChargeId: string;
    },
  ) {
    return this.paymentService.handleSuccessfulPayment(
      body.appointmentId,
      body.telegramChargeId,
      body.providerChargeId,
    );
  }
}
