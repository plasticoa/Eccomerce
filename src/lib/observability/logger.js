import "server-only";

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|service.?role|card|cvv/i;

function cleanValue(value) {
  if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/[\r\n\t]/g, " ").slice(0, 300);
  return undefined;
}

function cleanContext(context = {}) {
  return Object.fromEntries(Object.entries(context).flatMap(([key, value]) => {
    if (SENSITIVE_KEY.test(key)) return [];
    const clean = cleanValue(value);
    return clean === undefined ? [] : [[key, clean]];
  }));
}

export function logServerEvent(level, event, context = {}) {
  const record = { timestamp: new Date().toISOString(), level, event: String(event).slice(0, 120), ...cleanContext(context) };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

export function logServerError(event, error, context = {}) {
  logServerEvent("error", event, { ...context, errorCode: error?.code || error?.message || "UNKNOWN", message: error?.message || "Unexpected server error" });
}
