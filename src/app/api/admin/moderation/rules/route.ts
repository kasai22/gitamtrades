import { json, readJson, withAdmin } from "@/features/admin/api";
import { createPolicyVersion, getModerationConfig, policyInput } from "@/features/admin/services/config";
import { BUILT_IN_CHECKS, classifierStatus } from "@/features/moderation/providers";

/** GET /api/admin/moderation/rules — active policy, versions, built-in checks and AI provider status. */
export const GET = withAdmin("moderation.view", "moderation.rules", async (_request, _ctx, actor) => {
  const data = await getModerationConfig(actor);
  return json({
    activeVersion: data.active?.version ?? null,
    activeConfig: data.activeConfig,
    versions: data.versions.map((v) => ({ id: v.id, version: v.version, isActive: v.is_active, note: v.note, createdAt: v.created_at, createdBy: v.creator?.display_name ?? null })),
    builtInChecks: BUILT_IN_CHECKS,
    aiProvider: classifierStatus(),
  });
});

/** POST /api/admin/moderation/rules — `{ config: PolicyConfig, note, activate }` creates a new version. */
export const POST = withAdmin("moderation.manage", "moderation.policy_create", async (request, _ctx, actor) => {
  const parsed = await readJson(request, policyInput);
  if ("response" in parsed) return parsed.response;
  return json(await createPolicyVersion(actor, parsed.data), { status: 201 });
});
