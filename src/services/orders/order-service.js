export class OrderService {
  constructor({ paymentRepository, inventoryService }) {
    if (!paymentRepository?.processPaymentEvent || !inventoryService?.commitSale) throw new Error("ORDER_SERVICE_DEPENDENCIES_REQUIRED");
    this.paymentRepository = paymentRepository;
    this.inventoryService = inventoryService;
  }

  async confirmPayment(event) {
    if (event.status !== "approved") throw new Error("PAYMENT_NOT_APPROVED");
    return this.inventoryService.commitSale(event);
  }

  async processPaymentEvent(event) {
    if (!event?.eventId || !event?.reference) throw new Error("INVALID_PAYMENT_EVENT");
    if (event.status === "approved") return this.confirmPayment(event);
    return this.paymentRepository.processPaymentEvent(event);
  }
}
