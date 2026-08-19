export class PaymentProvider {
  constructor({ id, label }) {
    if (!id || !label) throw new Error("INVALID_PAYMENT_PROVIDER");
    this.id = id;
    this.label = label;
  }

  async createPayment() { throw new Error("PAYMENT_PROVIDER_NOT_IMPLEMENTED"); }
  verifyWebhook() { throw new Error("PAYMENT_PROVIDER_NOT_IMPLEMENTED"); }
  parseWebhook() { throw new Error("PAYMENT_PROVIDER_NOT_IMPLEMENTED"); }
  async getPaymentStatus() { throw new Error("PAYMENT_PROVIDER_NOT_IMPLEMENTED"); }
  async refundPayment() { throw new Error("PAYMENT_REFUNDS_NOT_IMPLEMENTED"); }
}
