import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/states";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getMyCases } from "@/features/account/queries";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Reports & appeals" };

const REPORT_STATUS: Record<string, string> = {
  open: "Received",
  in_review: "Being reviewed",
  actioned: "Action taken",
  dismissed: "Closed, no action",
  resolved: "Resolved",
  escalated: "Escalated",
};
const APPEAL_STATUS: Record<string, string> = { open: "Waiting for review", upheld: "Decision upheld", overturned: "Decision reversed" };

export default async function CasesPage() {
  const viewer = await requireUser("/account/cases");
  const { reports, appeals, deletionRequests } = await getMyCases(viewer.id);

  return (
    <>
      <PageHeader title="Reports & appeals" description="Case numbers for everything you've reported or asked us to review." />
      <div className="grid gap-6">
        <section aria-labelledby="appeals-heading">
          <h2 id="appeals-heading" className="mb-3 font-semibold">Review requests</h2>
          {appeals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No review requests.</p>
          ) : (
            <ul className="grid gap-2" role="list">
              {appeals.map((a) => (
                <li key={a.id} className="rounded-xl border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-medium">{a.case_number}</span>
                    <Badge variant={a.status === "overturned" ? "success" : a.status === "open" ? "info" : "secondary"}>{APPEAL_STATUS[a.status]}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {a.listing_id ? `Listing: ${a.listings?.title ?? "removed listing"}` : "Account restriction"} · {formatDate(a.created_at)}
                  </p>
                  {a.resolution_summary && <p className="mt-2">{a.resolution_summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="reports-heading">
          <h2 id="reports-heading" className="mb-3 font-semibold">Your reports</h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t reported anything.</p>
          ) : (
            <ul className="grid gap-2" role="list">
              {reports.map((r) => (
                <li key={r.id} className="rounded-xl border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-medium">{r.case_number}</span>
                    <Badge variant={r.status === "actioned" ? "success" : r.status === "dismissed" ? "secondary" : "info"}>{REPORT_STATUS[r.status]}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {REPORT_REASON_LABELS[r.reason]} · {r.target_type} · {formatDate(r.created_at)}
                  </p>
                  {r.resolution_summary && <p className="mt-2">{r.resolution_summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {deletionRequests.length > 0 && (
          <section aria-labelledby="deletion-heading">
            <h2 id="deletion-heading" className="mb-3 font-semibold">Account deletion</h2>
            <ul className="grid gap-2 text-sm" role="list">
              {deletionRequests.map((d) => (
                <li key={d.id} className="rounded-xl border bg-card p-4">Requested {formatDate(d.created_at)} · {d.status}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
