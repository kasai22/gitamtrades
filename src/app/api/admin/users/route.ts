import { csv, isCsv, json, withAdmin } from "@/features/admin/api";
import { parseListParams, pickEnum } from "@/features/admin/lib/list-params";
import { exportUsers } from "@/features/admin/services/exports";
import { listUsers, USER_SORTS, USER_STATUSES } from "@/features/admin/services/users";

/** GET /api/admin/users — directory (users.view); `format=csv` requires users.export and never includes emails. */
export const GET = withAdmin((r) => (isCsv(r) ? "users.export" : "users.view"), "users.list", async (request, _ctx, actor) => {
  const params = request.nextUrl.searchParams;
  const list = parseListParams(params, { sorts: USER_SORTS, defaultSort: "created_at" });
  const status = pickEnum(params, "status", USER_STATUSES, "all");
  if (isCsv(request)) {
    const file = await exportUsers(actor, { status, q: list.q });
    return csv(file.filename, file.csv);
  }
  const result = await listUsers(actor, { ...list, status });
  return json({ rows: result.rows, notice: result.notice ?? null }, { page: { page: list.page, pageSize: list.pageSize, total: result.total } });
});
