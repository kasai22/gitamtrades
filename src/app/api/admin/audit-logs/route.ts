import { csv, isCsv, json, withAdmin } from "@/features/admin/api";
import { parseListParams, pickOptionalEnum, pickString, pickUuid } from "@/features/admin/lib/list-params";
import { AUDIT_OUTCOMES, AUDIT_TARGET_TYPES, listAuditLogs, type AuditFilters } from "@/features/admin/services/audit-logs";
import { exportAuditLogs } from "@/features/admin/services/exports";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/admin/audit-logs — append-only trail (audit.view); `format=csv` requires audit.export. No write methods exist. */
export const GET = withAdmin((r) => (isCsv(r) ? "audit.export" : "audit.view"), "audit.list", async (request, _ctx, actor) => {
  const params = request.nextUrl.searchParams;
  const list = parseListParams(params, { sorts: ["created_at"] as const, defaultSort: "created_at", defaultPageSize: 50 });
  const from = pickString(params, "from", 10);
  const to = pickString(params, "to", 10);
  const filters: AuditFilters = {
    action: pickString(params, "action", 60).replace(/[^a-z_.]/g, "") || undefined,
    actorId: pickUuid(params, "actor"),
    targetType: pickOptionalEnum(params, "targetType", AUDIT_TARGET_TYPES),
    targetId: pickString(params, "targetId", 120) || undefined,
    outcome: pickOptionalEnum(params, "outcome", AUDIT_OUTCOMES),
    from: ISO.test(from) ? from : undefined,
    to: ISO.test(to) ? to : undefined,
  };
  if (isCsv(request)) {
    const file = await exportAuditLogs(actor, filters);
    return csv(file.filename, file.csv);
  }
  const result = await listAuditLogs(actor, filters, { limit: list.pageSize, offset: list.offset });
  return json(result.rows, { page: { page: list.page, pageSize: list.pageSize, total: result.total } });
});
