import { errorResponse, json, readJson, withAdmin } from "@/features/admin/api";
import { adminError } from "@/features/admin/errors";
import { UUID } from "@/features/admin/lib/list-params";
import { getListingDetail, moderateInput, moderateListings } from "@/features/admin/services/listings";

type Ctx = RouteContext<"/api/admin/listings/[id]">;

/** GET /api/admin/listings/[id] — listing, images (short-lived signed URLs), declarations, history, reports. */
export const GET = withAdmin<Ctx>("listings.view", "listings.detail", async (_request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const detail = await getListingDetail(actor, id);
  return detail ? json(detail) : errorResponse(adminError("NOT_FOUND"));
});

const body = moderateInput.omit({ listingIds: true }).strict();

/** PATCH /api/admin/listings/[id] — `{ action: "quarantine" | "remove" | "restore", reason, reportId?, reportSummary? }`. */
export const PATCH = withAdmin<Ctx>("listings.moderate", "listings.moderate", async (request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const parsed = await readJson(request, body);
  if ("response" in parsed) return parsed.response;
  return json(await moderateListings(actor, { ...parsed.data, listingIds: [id] }));
});
