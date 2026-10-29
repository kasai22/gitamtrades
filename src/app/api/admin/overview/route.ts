import { json, withAdmin } from "@/features/admin/api";
import { parseDateRange } from "@/features/admin/lib/date-range";
import { getOverview } from "@/features/admin/services/analytics";

/** GET /api/admin/overview?range=7d|30d|90d|365d or ?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const GET = withAdmin("overview.view", "overview", async (request, _ctx, actor) =>
  json(await getOverview(actor, parseDateRange(request.nextUrl.searchParams))),
);
