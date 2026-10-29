import { csv, isCsv, json, withAdmin } from "@/features/admin/api";
import { parseListParams, pickEnum, pickInt, pickOptionalEnum, UUID } from "@/features/admin/lib/list-params";
import { exportReports } from "@/features/admin/services/exports";
import { listReports, REPORT_REASON_FILTERS, REPORT_SORTS, REPORT_STATUS_FILTERS, REPORT_TARGETS } from "@/features/admin/services/reports";

/** GET /api/admin/reports — queue (reports.view); `format=csv` (reports.export) is de-identified. */
export const GET = withAdmin((r) => (isCsv(r) ? "reports.export" : "reports.view"), "reports.list", async (request, _ctx, actor) => {
  const params = request.nextUrl.searchParams;
  const list = parseListParams(params, { sorts: REPORT_SORTS, defaultSort: "priority" });
  const assigneeRaw = params.get("assignee") ?? undefined;
  const filters = {
    status: pickEnum(params, "status", REPORT_STATUS_FILTERS, "active"),
    reason: pickOptionalEnum(params, "reason", REPORT_REASON_FILTERS),
    target: pickOptionalEnum(params, "target", REPORT_TARGETS),
    priority: pickInt(params, "priority", 1, 4),
    severity: pickInt(params, "severity", 1, 3),
    assignee: assigneeRaw === "me" || assigneeRaw === "unassigned" || (assigneeRaw && UUID.test(assigneeRaw)) ? assigneeRaw : undefined,
  };
  if (isCsv(request)) {
    const file = await exportReports(actor, { ...filters, q: list.q });
    return csv(file.filename, file.csv);
  }
  const result = await listReports(actor, { ...list, ...filters });
  return json(result.rows, { page: { page: list.page, pageSize: list.pageSize, total: result.total } });
});
