import { existsSync } from "node:fs";

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const production = process.argv.includes("--production");
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const missing = [];

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!publicKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (production && !process.env.NEXT_PUBLIC_SITE_URL) missing.push("NEXT_PUBLIC_SITE_URL");

for (const [name, value] of [["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL], ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL]]) {
  if (!value) continue;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) missing.push(`${name} (origen HTTP/HTTPS sin ruta ni credenciales)`);
    if (production && url.protocol !== "https:") missing.push(`${name} (HTTPS en producción)`);
  } catch { missing.push(`${name} (URL válida)`); }
}

if (missing.length) {
  console.error(`Configuración ${production ? "productiva" : "local"} incompleta: ${[...new Set(missing)].join(", ")}.`);
  process.exit(1);
}

console.info(`Configuración ${production ? "productiva" : "local"} válida.`);
