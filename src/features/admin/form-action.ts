"use server";

import type { ActionResult } from "@/lib/errors";
import {
  activatePolicyVersion,
  addMeetupArea,
  addReportNote,
  addUniversityDomain,
  deleteCategory,
  liftRestriction,
  moderateCommunity,
  moderateListings,
  processDeletionRequest,
  requestConversationAccess,
  resolveAppeal,
  restrictConversation,
  restrictUser,
  setMeetupAreaActive,
  setUniversityDomainActive,
  setUserRole,
  updateReport,
  updateSetting,
  updateUniversity,
} from "./actions";

export type AdminFormState = { ok: boolean; message?: string; error?: string; at?: number } | null;

const str = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" && value.length ? value : undefined;
};

/**
 * Single FormData entry point for admin dialogs. Each branch delegates to a typed Server Action that
 * performs its own authorization, validation and audited database call; nothing here is trusted.
 */
export async function runAdminAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const op = str(form, "op");
  const reason = str(form, "reason") ?? "";
  let result: ActionResult<unknown>;
  switch (op) {
    case "report.update": {
      const priority = str(form, "priority");
      const assignee = form.get("assignedTo");
      result = await updateReport(str(form, "reportId") ?? "", {
        status: str(form, "status") as "open" | undefined,
        priority: priority ? Number(priority) : undefined,
        assignedTo: typeof assignee === "string" ? (assignee === "" || assignee === "none" ? null : assignee) : undefined,
        resolutionCode: str(form, "resolutionCode") as "other" | undefined,
        summary: str(form, "summary") ?? (str(form, "status") ? reason || undefined : undefined),
        reason: reason || undefined,
      });
      break;
    }
    case "report.note":
      result = await addReportNote(str(form, "reportId") ?? "", reason);
      break;
    case "listing.moderate":
      result = await moderateListings({
        listingIds: (str(form, "listingIds") ?? str(form, "listingId") ?? "").split(",").filter(Boolean),
        action: str(form, "action") as "remove",
        reason,
        reportId: str(form, "reportId"),
        reportSummary: str(form, "summary"),
      });
      break;
    case "community.moderate":
      result = await moderateCommunity({
        target: str(form, "target") as "post",
        id: str(form, "id") ?? "",
        action: str(form, "action") as "remove",
        reason,
        reportId: str(form, "reportId"),
      });
      break;
    case "user.restrict":
      result = await restrictUser({
        userId: str(form, "userId") ?? "",
        kind: str(form, "kind") as "suspension",
        reason,
        durationDays: Number(str(form, "durationDays") ?? 0),
        reportId: str(form, "reportId"),
        reportSummary: str(form, "summary"),
      });
      break;
    case "user.lift":
      result = await liftRestriction({ restrictionId: str(form, "restrictionId") ?? "", reason });
      break;
    case "user.role":
      if (str(form, "grant") !== "1" && str(form, "confirm") !== "REVOKE") {
        return { ok: false, error: "Type REVOKE to confirm.", at: Date.now() };
      }
      result = await setUserRole({ userId: str(form, "userId") ?? "", role: str(form, "role") as "moderator", grant: str(form, "grant") === "1", reason });
      break;
    case "appeal.resolve":
      result = await resolveAppeal({ appealId: str(form, "appealId") ?? "", decision: str(form, "decision") as "upheld", summary: reason });
      break;
    case "conversation.access":
      result = await requestConversationAccess({ conversationId: str(form, "conversationId") ?? "", reason, reportId: str(form, "reportId") });
      break;
    case "conversation.restrict":
      result = await restrictConversation({ conversationId: str(form, "conversationId") ?? "", restrict: str(form, "restrict") === "1", reason, reportId: str(form, "reportId") });
      break;
    case "policy.activate":
      result = await activatePolicyVersion(str(form, "policyId") ?? "");
      break;
    case "university.update":
      result = await updateUniversity({ universityId: str(form, "universityId") ?? "", name: str(form, "name") ?? "", shortName: str(form, "shortName"), city: str(form, "city") });
      break;
    case "domain.add":
      result = await addUniversityDomain({ universityId: str(form, "universityId") ?? "", domain: str(form, "domain") ?? "", note: reason || undefined });
      break;
    case "domain.toggle":
      result = await setUniversityDomainActive({ domainId: str(form, "domainId") ?? "", active: str(form, "active") === "1", reason });
      break;
    case "meetup.add":
      result = await addMeetupArea({ universityId: str(form, "universityId") ?? "", name: str(form, "name") ?? "", description: reason || undefined });
      break;
    case "meetup.toggle":
      result = await setMeetupAreaActive(str(form, "areaId") ?? "", str(form, "active") === "1");
      break;
    case "category.delete":
      if (str(form, "confirm") !== "DELETE") return { ok: false, error: "Type DELETE to confirm.", at: Date.now() };
      result = await deleteCategory(str(form, "categoryId") ?? "");
      break;
    case "setting.update": {
      const raw = str(form, "value") ?? "";
      const value = raw === "true" ? true : raw === "false" ? false : Number(raw);
      result = await updateSetting({ key: str(form, "key") as "signups_paused", value, reason });
      break;
    }
    case "deletion.process":
      result = await processDeletionRequest(str(form, "requestId") ?? "", str(form, "decision") as "complete" | "cancel");
      break;
    default:
      return { ok: false, error: "Unknown action.", at: Date.now() };
  }
  return result.ok ? { ok: true, message: result.message ?? "Done.", at: Date.now() } : { ok: false, error: result.error, at: Date.now() };
}
