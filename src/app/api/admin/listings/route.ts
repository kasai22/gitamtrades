import { z } from "zod";
import { json, readJson, withAdmin } from "@/features/admin/api";
import { parseListParams, pickEnum, pickOptionalEnum } from "@/features/admin/lib/list-params";
import { LISTING_SIGNALS, LISTING_SORTS, LISTING_STATES, listListings, moderateInput, moderateListings } from "@/features/admin/services/listings";

/** GET /api/admin/listings — every state and category (listings.view). */
export const GET = withAdmin("listings.view", "listings.list", async (request, _ctx, actor) => {
  const params = request.nextUrl.searchParams;
  const list = parseListParams(params, { sorts: LISTING_SORTS, defaultSort: "updated_at" });
  const category = params.get("category")?.match(/^[a-z0-9-]{2,40}$/)?.[0];
  const result = await listListings(actor, {
    ...list,
    state: pickEnum(params, "state", LISTING_STATES, "all"),
    category,
    signal: pickOptionalEnum(params, "signal", LISTING_SIGNALS.map((s) => s.code)),
  });
  return json(result.rows, { page: { page: list.page, pageSize: list.pageSize, total: result.total } });
});

const bulkBody = moderateInput.omit({ reportId: true, reportSummary: true }).extend({ confirm: z.literal(true, { message: "Set confirm: true to apply a bulk action." }) }).strict();

/** POST /api/admin/listings — bulk quarantine/remove/restore of 1–50 listings; requires `confirm: true`. */
export const POST = withAdmin("listings.moderate", "listings.bulk", async (request, _ctx, actor) => {
  const parsed = await readJson(request, bulkBody);
  if ("response" in parsed) return parsed.response;
  return json(await moderateListings(actor, { listingIds: parsed.data.listingIds, action: parsed.data.action, reason: parsed.data.reason }));
});
