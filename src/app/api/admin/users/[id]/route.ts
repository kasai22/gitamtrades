import { z } from "zod";
import { errorResponse, json, readJson, withAdmin } from "@/features/admin/api";
import { adminError } from "@/features/admin/errors";
import { UUID } from "@/features/admin/lib/list-params";
import { getUserDetail, liftInput, liftRestriction, restrictInput, restrictUser } from "@/features/admin/services/users";

type Ctx = RouteContext<"/api/admin/users/[id]">;

/** GET /api/admin/users/[id] — profile, restrictions, listings, reports and moderation history (no email). */
export const GET = withAdmin<Ctx>("users.view", "users.detail", async (_request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const detail = await getUserDetail(actor, id);
  return detail ? json(detail) : errorResponse(adminError("NOT_FOUND"));
});

const body = z.discriminatedUnion("action", [
  restrictInput.omit({ userId: true }).extend({ action: z.literal("restrict") }).strict(),
  liftInput.extend({ action: z.literal("lift") }).strict(),
]);

/** POST /api/admin/users/[id] — `{ action: "restrict", kind, reason, durationDays, reportId? }` or `{ action: "lift", restrictionId, reason }`. */
export const POST = withAdmin<Ctx>("users.restrict", "users.restrict", async (request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const parsed = await readJson(request, body);
  if ("response" in parsed) return parsed.response;
  if (parsed.data.action === "restrict") {
    const { kind, reason, durationDays, reportId, reportSummary } = parsed.data;
    return json(await restrictUser(actor, { userId: id, kind, reason, durationDays, reportId, reportSummary }), { status: 201 });
  }
  await liftRestriction(actor, { restrictionId: parsed.data.restrictionId, reason: parsed.data.reason }, id);
  return json({});
});
