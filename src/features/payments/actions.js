"use server";
// Retired entry points remain harmless for previously loaded clients.
export async function startPaymentAction() { return { error: "Los pagos se realizan contra entrega o presencialmente." }; }
export async function simulateTestPaymentAction() { return { error: "Los pagos en línea están deshabilitados." }; }
