import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

const PROTECTED_PREFIXES = [
  "/marketplace",
  "/search",
  "/categories",
  "/listings",
  "/sell",
  "/account",
  "/messages",
  "/admin",
  "/appeals",
  "/community",
];

export function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

export function isProtectedPath(pathname: string) {
  if (isAdminLoginPath(pathname)) return false;
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Where a signed-out visitor is sent: the console has its own sign-in page. */
export function loginPathFor(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") ? "/admin/login" : "/login";
}

/**
 * Refreshes the Supabase session cookie on every request and performs an *optimistic* redirect to
 * /login for signed-out visitors on protected routes. Real authorization happens in pages, server
 * actions and RLS; never rely on this alone.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const env = publicEnv();
  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Validates the JWT and refreshes it when needed. Keep this immediately after client creation.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  if (!signedIn && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = loginPathFor(pathname);
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}
