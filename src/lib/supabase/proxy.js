import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "./config";

export async function updateSession(request) {
  let response = NextResponse.next({ request });
  const { url, key } = getPublicSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers || {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // Revalida el JWT y refresca cookies cuando es necesario.
  await supabase.auth.getClaims();
  if (/^\/(cuenta|admin|checkout|pedido|pago|auth|api\/payments)(\/|$)/.test(request.nextUrl.pathname) || response.cookies.getAll().length) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}
