import { json, readJson, withAdmin } from "@/features/admin/api";
import { getSettings, settingInput, updateSetting } from "@/features/admin/services/config";

/** GET /api/admin/settings — platform settings (config.view). */
export const GET = withAdmin("config.view", "settings.get", async (_request, _ctx, actor) => {
  const { rows } = await getSettings(actor);
  return json(rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updated_at, updatedBy: r.editor?.display_name ?? null })));
});

/** PATCH /api/admin/settings — `{ key, value, reason }` (settings.manage); value is validated per key. */
export const PATCH = withAdmin("settings.manage", "settings.update", async (request, _ctx, actor) => {
  const parsed = await readJson(request, settingInput);
  if ("response" in parsed) return parsed.response;
  await updateSetting(actor, parsed.data);
  return json({});
});
