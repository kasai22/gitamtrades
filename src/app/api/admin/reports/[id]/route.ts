import { errorResponse, json, readJson, withAdmin } from "@/features/admin/api";
import { adminError } from "@/features/admin/errors";
import { UUID } from "@/features/admin/lib/list-params";
import { addReportNote, getReportDetail, noteInput, reportPatchInput, updateReport } from "@/features/admin/services/reports";

type Ctx = RouteContext<"/api/admin/reports/[id]">;

/** GET /api/admin/reports/[id] — report, notes, related reports and history. Message evidence is omitted over HTTP. */
export const GET = withAdmin<Ctx>("reports.view", "reports.detail", async (_request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const detail = await getReportDetail(actor, id);
  if (!detail) return errorResponse(adminError("NOT_FOUND"));
  const evidence = Object.fromEntries(Object.entries(detail.evidence).filter(([key]) => key !== "body"));
  const report = Object.fromEntries(Object.entries(detail.report).filter(([key]) => key !== "evidence"));
  return json({ ...detail, report, evidence });
});

/** PATCH /api/admin/reports/[id] — `{ status?, priority?, assignedTo?, resolutionCode?, summary?, reason? }`. */
export const PATCH = withAdmin<Ctx>("reports.manage", "reports.update", async (request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const parsed = await readJson(request, reportPatchInput);
  if ("response" in parsed) return parsed.response;
  await updateReport(actor, id, parsed.data);
  return json({});
});

/** POST /api/admin/reports/[id] — add an internal note `{ note }`. */
export const POST = withAdmin<Ctx>("reports.note", "reports.note", async (request, { params }, actor) => {
  const { id } = await params;
  if (!UUID.test(id)) return errorResponse(adminError("NOT_FOUND"));
  const parsed = await readJson(request, noteInput);
  if ("response" in parsed) return parsed.response;
  return json(await addReportNote(actor, id, parsed.data.note), { status: 201 });
});
