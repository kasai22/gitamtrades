import { json, readJson, withAdmin } from "@/features/admin/api";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { listStaff, roleInput, setRole } from "@/features/admin/services/roles";

/** GET /api/admin/roles — staff accounts and the permission matrix (roles.manage). */
export const GET = withAdmin("roles.manage", "roles.list", async (_request, _ctx, actor) => json({ staff: await listStaff(actor), matrix: ROLE_PERMISSIONS }));

/** POST /api/admin/roles — `{ userId, role, grant, reason }`. Self-changes and removing the last Super Admin are refused. */
export const POST = withAdmin("roles.manage", "roles.set", async (request, _ctx, actor) => {
  const parsed = await readJson(request, roleInput);
  if ("response" in parsed) return parsed.response;
  await setRole(actor, parsed.data);
  return json({});
});
