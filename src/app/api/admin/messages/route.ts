import { json, withAdmin } from "@/features/admin/api";
import { parseListParams } from "@/features/admin/lib/list-params";
import { searchConversations } from "@/features/admin/services/conversations";

/**
 * GET /api/admin/messages?q=R-000123|<conversation id>|<user id> — conversation metadata only.
 * Message content is never served over HTTP; reading it requires the audited grant flow in the console.
 */
export const GET = withAdmin("messages.investigate", "messages.search", async (request, _ctx, actor) => {
  const list = parseListParams(request.nextUrl.searchParams, { sorts: ["last_message_at"] as const, defaultSort: "last_message_at" });
  const result = await searchConversations(actor, list.q, { limit: list.pageSize, offset: list.offset });
  return json(result.rows, { page: { page: list.page, pageSize: list.pageSize, total: result.total } });
});
