"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getViewer } from "@/lib/auth/session";
import { fail, friendlyError, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { REPORT_REASON_VALUES } from "./report-reasons";

const reportSchema = z.object({
  targetType: z.enum(["listing", "user", "message", "post", "comment"]),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASON_VALUES, { message: "Choose a reason." }),
  details: z.string().trim().max(1000, "Keep details under 1,000 characters.").optional(),
});

/** SAFE-02: creates (or returns the existing) case; risk thresholds run inside submit_report(). */
export async function submitReport(input: z.input<typeof reportSchema>): Promise<ActionResult<{ caseNumber: string; alreadyReported: boolean }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Please sign in again.");
  if (!viewer.isVerified) return fail(friendlyError({ message: "NOT_VERIFIED" }));
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the report details.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_report", {
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details || null,
  });
  const row = data?.[0];
  if (error || !row?.case_number) return fail(friendlyError(error));

  track("listing_reported", viewer.id, {
    case_id: row.case_number,
    reason: parsed.data.reason,
    target_type: parsed.data.targetType,
    deduplicated: Boolean(row.already_reported),
  });
  revalidatePath("/account/cases");
  return ok({ caseNumber: row.case_number, alreadyReported: Boolean(row.already_reported) });
}

const appealSchema = z
  .object({
    listingId: z.uuid().optional(),
    restrictionId: z.uuid().optional(),
    message: z.string().trim().min(10, "Explain your request in at least 10 characters.").max(2000, "Keep it under 2,000 characters."),
  })
  .refine((v) => Boolean(v.listingId) !== Boolean(v.restrictionId), "Choose what you're appealing.");

export type AppealState = { ok: boolean; error?: string; caseNumber?: string; alreadyOpen?: boolean } | null;

/** SAFE-04 / AC-12: request a human review of an automated or admin decision; returns a case id. */
export async function submitAppeal(_prev: AppealState, formData: FormData): Promise<AppealState> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in again." };
  const parsed = appealSchema.safeParse({
    listingId: formData.get("listingId") || undefined,
    restrictionId: formData.get("restrictionId") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_appeal", {
    p_listing_id: parsed.data.listingId ?? null,
    p_restriction_id: parsed.data.restrictionId ?? null,
    p_message: parsed.data.message,
  });
  const row = data?.[0];
  if (error || !row?.case_number) return { ok: false, error: friendlyError(error) };
  track("appeal_submitted", viewer.id, { case_id: row.case_number, target: parsed.data.listingId ? "listing" : "restriction" });
  revalidatePath("/account/cases");
  return { ok: true, caseNumber: row.case_number, alreadyOpen: Boolean(row.already_open) };
}
