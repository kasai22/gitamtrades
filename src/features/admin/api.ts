import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { authorizeAdmin } from "@/lib/auth/admin";
import type { Permission } from "@/lib/auth/permissions";
import type { Viewer } from "@/lib/auth/session";
import { AdminError, toAdminError } from "./errors";

/**
 * Route Handler wrapper for /api/admin/* (docs/ADMIN_API_CONTRACTS.md). The path prefix grants
 * nothing: every handler authorizes from the session + user_roles, mutating requests must be
 * same-origin JSON (CSRF), and bodies are validated with strict Zod schemas (no mass assignment).
 */
const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function json(data: unknown, init: { status?: number; page?: { page: number; pageSize: number; total: number } } = {}) {
  return NextResponse.json(init.page ? { data, page: init.page } : { data }, { status: init.status ?? 200, headers: NO_STORE });
}

export function errorResponse(error: AdminError | { code: string; message: string; status: number }, issues?: unknown) {
  // Public codes from docs/ADMIN_API_CONTRACTS.md; guard-rail specifics travel in `reason` for 409s.
  const PASSTHROUGH = new Set(["SESSION_EXPIRED", "UNAUTHENTICATED", "CSRF_REJECTED"]);
  const BY_STATUS: Record<number, string> = { 400: "INVALID_REQUEST", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 429: "RATE_LIMITED", 500: "INTERNAL" };
  const code = PASSTHROUGH.has(error.code) ? error.code : (BY_STATUS[error.status] ?? error.code);
  return NextResponse.json({ error: { code, message: error.message, ...(error.status === 409 ? { reason: error.code } : {}), ...(issues ? { issues } : {}) } }, { status: error.status, headers: NO_STORE });
}

export function csv(filename: string, body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}"` },
  });
}

/** Rejects cross-site and non-JSON mutations (cookie-authenticated endpoints are CSRF targets). */
function csrfOk(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  const type = request.headers.get("content-type") ?? "";
  return Boolean(origin) && origin === request.nextUrl.origin && type.toLowerCase().startsWith("application/json");
}

export async function readJson<S extends z.ZodType>(request: NextRequest, schema: S): Promise<{ data: z.infer<S> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: errorResponse(new AdminError("INVALID_REQUEST", "Send a JSON body.", 400)) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: errorResponse(
        new AdminError("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.", 400),
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      ),
    };
  }
  return { data: parsed.data };
}

type Handler<C> = (request: NextRequest, context: C, actor: Viewer) => Promise<Response>;

export function withAdmin<C>(permission: Permission | ((request: NextRequest) => Permission), action: string, handler: Handler<C>) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    if (!csrfOk(request)) return errorResponse(new AdminError("CSRF_REJECTED", "Cross-site or non-JSON request rejected.", 403));
    const required = typeof permission === "function" ? permission(request) : permission;
    const auth = await authorizeAdmin(required, `api.${action}`);
    if ("error" in auth) return errorResponse(auth.error);
    try {
      return await handler(request, context, auth.actor);
    } catch (error) {
      return errorResponse(toAdminError(error));
    }
  };
}

export const isCsv = (request: NextRequest) => request.nextUrl.searchParams.get("format") === "csv";
