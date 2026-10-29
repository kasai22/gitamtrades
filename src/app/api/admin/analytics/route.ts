import { csv, isCsv, json, withAdmin } from "@/features/admin/api";
import { parseDateRange } from "@/features/admin/lib/date-range";
import { getAnalytics } from "@/features/admin/services/analytics";
import { exportAnalyticsDaily } from "@/features/admin/services/exports";

/** GET /api/admin/analytics?from&to|range — aggregates (analytics.view); `format=csv` daily series (analytics.export). */
export const GET = withAdmin((r) => (isCsv(r) ? "analytics.export" : "analytics.view"), "analytics", async (request, _ctx, actor) => {
  const range = parseDateRange(request.nextUrl.searchParams);
  if (isCsv(request)) {
    const file = await exportAnalyticsDaily(actor, range);
    return csv(file.filename, file.csv);
  }
  return json(await getAnalytics(actor, range));
});
