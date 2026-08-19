import { TestPaymentProvider } from "./providers/development-payment-provider.js";

export function configuredProviderName(environment = process.env) {
  const configured = String(environment.PAYMENT_PROVIDER || "").trim().toLowerCase();
  if (configured === "test" && environment.NODE_ENV === "production") return null;
  if (configured) return configured;
  return environment.NODE_ENV === "production" ? null : "test";
}

export function createPaymentProvider(name, { environment = process.env, now } = {}) {
  if (name === "test" && environment.NODE_ENV === "production") throw new Error("PAYMENT_TEST_PROVIDER_DISABLED");
  if (name === "test") return new TestPaymentProvider({ secret: environment.PAYMENT_TEST_WEBHOOK_SECRET, now });
  throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
}

export function createConfiguredPaymentProvider(options = {}) {
  const environment = options.environment || process.env;
  const name = configuredProviderName(environment);
  if (!name) throw new Error("PAYMENT_PROVIDER_NOT_CONFIGURED");
  return createPaymentProvider(name, { ...options, environment });
}

export function isTestSimulationEnabled(environment = process.env) {
  return environment.NODE_ENV !== "production"
    && environment.PAYMENT_TEST_MODE_ENABLED === "true"
    && String(environment.PAYMENT_PROVIDER || "test").toLowerCase() === "test"
    && String(environment.PAYMENT_TEST_WEBHOOK_SECRET || "").length >= 16;
}

export function paymentPublicConfig(environment = process.env) {
  const provider = configuredProviderName(environment);
  const testReady = provider === "test" && String(environment.PAYMENT_TEST_WEBHOOK_SECRET || "").length >= 16;
  const configured = provider === "test" && testReady;
  return {
    configured,
    provider,
    providerLabel: provider === "test"
      ? testReady ? "Proveedor de pago de prueba" : "Proveedor de prueba sin configurar"
      : provider ? "Adaptador de pago no disponible" : "Proveedor pendiente de configuración",
    testMode: provider === "test",
    simulationEnabled: isTestSimulationEnabled(environment),
  };
}
