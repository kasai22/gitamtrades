import { z } from "zod";
import { json, readJson, withAdmin } from "@/features/admin/api";
import {
  addDomain,
  domainActiveInput,
  domainInput,
  getUniversityConfig,
  setDomainActive,
  universityInput,
  updateUniversity,
} from "@/features/admin/services/config";

/** GET /api/admin/universities — university, domains, meetup areas and aggregated verification overview. */
export const GET = withAdmin("config.view", "universities.get", async (_request, _ctx, actor) => json(await getUniversityConfig(actor)));

const body = z.discriminatedUnion("action", [
  universityInput.extend({ action: z.literal("update") }).strict(),
  domainInput.extend({ action: z.literal("add_domain") }).strict(),
  domainActiveInput.extend({ action: z.literal("set_domain_active") }).strict(),
]);

/** PATCH /api/admin/universities — `action: update | add_domain | set_domain_active` (university.manage). */
export const PATCH = withAdmin("university.manage", "universities.update", async (request, _ctx, actor) => {
  const parsed = await readJson(request, body);
  if ("response" in parsed) return parsed.response;
  const { action, ...input } = parsed.data;
  if (action === "update") await updateUniversity(actor, input as z.infer<typeof universityInput>);
  else if (action === "add_domain") await addDomain(actor, input as z.infer<typeof domainInput>);
  else await setDomainActive(actor, input as z.infer<typeof domainActiveInput>);
  return json({});
});
