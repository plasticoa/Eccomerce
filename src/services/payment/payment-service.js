export class PaymentService {
  constructor({ providerResolver, paymentRepository, orderService }) {
    if (!providerResolver || !paymentRepository || !orderService) throw new Error("PAYMENT_SERVICE_DEPENDENCIES_REQUIRED");
    this.providerResolver = providerResolver;
    this.paymentRepository = paymentRepository;
    this.orderService = orderService;
  }

  async startPayment({ orderNumber, idempotencyKey }) {
    const provider = this.providerResolver();
    const attempt = await this.paymentRepository.createPaymentAttempt({
      orderNumber,
      provider: provider.id,
      idempotencyKey,
    });

    if (attempt.providerReference && ["processing", "approved"].includes(attempt.status)) {
      return { ...attempt, providerLabel: provider.label, testMode: provider.id === "test" };
    }

    const providerPayment = await provider.createPayment({
      paymentId: attempt.paymentId,
      orderNumber: attempt.orderNumber,
      amount: attempt.amount,
      currency: attempt.currency,
      idempotencyKey,
    });
    const attached = await this.paymentRepository.setPaymentProviderReference({
      paymentId: attempt.paymentId,
      providerReference: providerPayment.providerReference,
      providerStatus: providerPayment.providerStatus,
    });
    return {
      ...attempt,
      ...attached,
      providerLabel: provider.label,
      testMode: providerPayment.testMode === true,
      status: providerPayment.status,
      redirectUrl: providerPayment.redirectUrl || null,
    };
  }

  async handleWebhook(providerName, { rawBody, headers }) {
    const provider = this.providerResolver(providerName);
    if (!provider.verifyWebhook({ rawBody, headers })) {
      const error = new Error("INVALID_WEBHOOK_SIGNATURE");
      error.status = 401;
      throw error;
    }
    const event = provider.parseWebhook(rawBody);
    return this.orderService.processPaymentEvent(event);
  }
}
