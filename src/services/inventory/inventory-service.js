export class InventoryService {
  constructor({ paymentRepository }) {
    if (!paymentRepository?.processPaymentEvent) throw new Error("INVENTORY_REPOSITORY_REQUIRED");
    this.paymentRepository = paymentRepository;
  }

  validateStock(items) {
    if (!Array.isArray(items) || !items.length) return { valid: false, error: "EMPTY_ORDER" };
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) return { valid: false, error: "INVALID_QUANTITY" };
      if (!Number.isInteger(item.stock) || item.stock < item.quantity) return { valid: false, error: "INSUFFICIENT_STOCK" };
    }
    return { valid: true };
  }

  async commitSale(event) {
    return this.paymentRepository.processPaymentEvent(event);
  }

  async restoreStock() {
    throw new Error("STOCK_RESTORATION_RESERVED_FOR_FUTURE_FLOW");
  }
}
