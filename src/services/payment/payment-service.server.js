import "server-only";
import { PaymentService } from "./payment-service";
import { createConfiguredPaymentProvider, createPaymentProvider } from "./payment-config";
import { paymentRepository } from "@/repositories/payments";
import { InventoryService } from "@/services/inventory/inventory-service";
import { OrderService } from "@/services/orders/order-service";

export function createPaymentService() {
  const inventoryService = new InventoryService({ paymentRepository });
  const orderService = new OrderService({ paymentRepository, inventoryService });
  return new PaymentService({
    providerResolver: (name) => name ? createPaymentProvider(name) : createConfiguredPaymentProvider(),
    paymentRepository,
    orderService,
  });
}
