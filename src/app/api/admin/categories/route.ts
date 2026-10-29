import { z } from "zod";
import { json, readJson, withAdmin } from "@/features/admin/api";
import { categoryInput, listCategories, reorderCategories, saveCategory } from "@/features/admin/services/config";

/** GET /api/admin/categories — categories with listing counts. */
export const GET = withAdmin("config.view", "categories.list", async (_request, _ctx, actor) => json(await listCategories(actor)));

/** POST /api/admin/categories — create `{ slug, name, description?, icon, isTicket, isActive }`. */
export const POST = withAdmin("categories.manage", "categories.create", async (request, _ctx, actor) => {
  const parsed = await readJson(request, categoryInput.omit({ id: true }).strict());
  if ("response" in parsed) return parsed.response;
  return json(await saveCategory(actor, parsed.data), { status: 201 });
});

const patchBody = z.union([categoryInput.required({ id: true }).strict(), z.object({ order: z.array(z.uuid()).min(1).max(200) }).strict()]);

/** PATCH /api/admin/categories — update `{ id, ...fields }` or reorder `{ order: uuid[] }` (must list every category). */
export const PATCH = withAdmin("categories.manage", "categories.update", async (request, _ctx, actor) => {
  const parsed = await readJson(request, patchBody);
  if ("response" in parsed) return parsed.response;
  if ("order" in parsed.data) {
    await reorderCategories(actor, parsed.data.order);
    return json({});
  }
  return json(await saveCategory(actor, parsed.data));
});
