import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { audit } from "@/features/admin/audit";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { DetailList, EntityLink, ModerationFlag, Muted, PriorityBadge, ReportStatusBadge, SeverityBadge } from "@/features/admin/components/admin-ui";
import { DataTable, PageHeading, Panel } from "@/features/admin/components/data-table";
import { ReportNoteForm, ReportTriage, ResolutionFields } from "@/features/admin/components/report-forms";
import { RestrictFields } from "@/features/admin/components/restrict-fields";
import { UUID } from "@/features/admin/lib/list-params";
import { getReportDetail, listAssignableStaff, RESOLUTION_CODES } from "@/features/admin/services/reports";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Report" };

const CLOSED = new Set(["actioned", "dismissed", "resolved"]);
const RESOLUTION_LABELS = Object.fromEntries(RESOLUTION_CODES.map((c) => [c.value, c.label])) as Record<string, string>;
const selectClass = "h-10 rounded-lg border border-input bg-card px-3 text-sm";

export default async function AdminReportPage({ params }: PageProps<"/admin/reports/[id]">) {
  const { id } = await params;
  const actor = await requirePermission("reports.view", `/admin/reports/${id}`);
  if (!UUID.test(id)) notFound();
  const detail = await getReportDetail(actor, id);
  if (!detail) notFound();
  const { report, evidence } = detail;
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  const closed = CLOSED.has(report.status);
  const canManage = can("reports.manage");
  const staff = canManage ? await listAssignableStaff(actor) : [];

  // Message evidence is private conversation content: shown only to investigators, and each view is audited (§9.2).
  const messageEvidence = report.target_type === "message" && typeof evidence.body === "string";
  const showMessageEvidence = messageEvidence && can("messages.investigate");
  if (showMessageEvidence) {
    await audit({ actorId: actor.id, action: "report.viewed_message_evidence", targetType: "report", targetId: report.id, metadata: { case_number: report.case_number } });
  }
  const otherEvidence = Object.fromEntries(Object.entries(evidence).filter(([k]) => k !== "body"));
  const contentId = report.comment_id ?? report.post_id;

  return (
    <>
      <PageHeading
        title={`Case ${report.case_number}`}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <ReportStatusBadge status={report.status} />
            <PriorityBadge priority={report.priority} />
            <SeverityBadge severity={report.severity} />
            <span>{REPORT_REASON_LABELS[report.reason]} · {report.target_type} · received {formatDateTime(report.created_at)}</span>
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="Report">
            <DetailList
              items={[
                ["Report ID", <code key="id" className="text-xs">{report.id}</code>],
                ["Category", REPORT_REASON_LABELS[report.reason]],
                ["Reporter's details", report.details ? <p key="d" className="whitespace-pre-line">{report.details}</p> : <Muted key="n">None given</Muted>],
                [
                  "Listing",
                  report.listings ? (
                    can("listings.view") ? <EntityLink key="l" href={`/admin/listings/${report.listings.id}`}>{report.listings.title}</EntityLink> : report.listings.title
                  ) : report.listing_id ? "Deleted listing" : "—",
                ],
                ["Community post", report.forum_posts ? <EntityLink key="p" href={`/community/${report.forum_posts.id}`}>{report.forum_posts.title}</EntityLink> : "—"],
                [
                  "Reported user",
                  report.reported ? (can("users.view") ? <EntityLink key="u" href={`/admin/users/${report.reported.id}`}>{report.reported.display_name}</EntityLink> : report.reported.display_name) : "—",
                ],
                [
                  "Reporter",
                  report.reporter ? (can("users.view") ? <EntityLink key="r" href={`/admin/users/${report.reporter.id}`}>{report.reporter.display_name}</EntityLink> : report.reporter.display_name) : "Deleted account",
                ],
                [
                  "Conversation",
                  detail.conversationId ? (
                    can("messages.investigate") ? <EntityLink key="c" href={`/admin/messages/${detail.conversationId}?report=${report.id}`}>Investigate conversation</EntityLink> : <Muted key="c">Restricted to investigators</Muted>
                  ) : "—",
                ],
                ["Assigned", report.assignee ? `${report.assignee.display_name}${report.assigned_at ? ` since ${formatDateTime(report.assigned_at)}` : ""}` : "Unassigned"],
                [
                  "Resolution",
                  closed ? (
                    <span key="res" className="grid gap-0.5">
                      <span>{RESOLUTION_LABELS[report.resolution_code ?? ""] ?? report.resolution_code ?? "—"} · {report.resolved_at ? formatDateTime(report.resolved_at) : ""}{report.resolver ? ` by ${report.resolver.display_name}` : ""}</span>
                      {report.resolution_summary && <span className="text-muted-foreground">Reporter sees: “{report.resolution_summary}”</span>}
                    </span>
                  ) : "Open",
                ],
              ]}
            />
          </Panel>

          <Panel title="Evidence snapshot" description="Captured when the report was filed, so later edits don't hide what was reported.">
            {messageEvidence && !showMessageEvidence && <p className="mb-2 text-sm text-muted-foreground">The reported message text is visible only to roles that can investigate conversations.</p>}
            {showMessageEvidence && (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Reported message. This view is recorded in the audit log.</p>
                <blockquote className="mb-3 rounded-lg border-l-4 border-destructive/40 bg-muted/50 p-3 text-sm whitespace-pre-wrap">{String(evidence.body)}</blockquote>
              </>
            )}
            {Object.keys(otherEvidence).length > 0 ? (
              <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(otherEvidence, null, 2)}</pre>
            ) : (
              !messageEvidence && <Muted>No snapshot recorded.</Muted>
            )}
          </Panel>

          <Panel title="Internal notes" description="Staff only. Never shown to the reporter or the reported user. Notes can't be edited or deleted.">
            {detail.notes.length === 0 ? (
              <p className="mb-3 text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ol className="mb-3 grid gap-2" role="list">
                {detail.notes.map((n) => (
                  <li key={n.id} className="rounded-lg border bg-muted/30 p-2.5 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">{n.author?.display_name ?? "Former staff"} · {formatDateTime(n.created_at)}</p>
                    <p className="whitespace-pre-line">{n.body}</p>
                  </li>
                ))}
              </ol>
            )}
            {can("reports.note") ? <ReportNoteForm reportId={report.id} /> : <Muted>Your role can&apos;t add notes.</Muted>}
          </Panel>

          <Panel title="Action history" bodyClassName="p-0">
            <DataTable
              rows={detail.history}
              rowKey={(e) => e.id}
              empty="No actions yet."
              columns={[
                { key: "when", header: "When", cell: (e) => formatDateTime(e.created_at), className: "whitespace-nowrap" },
                { key: "action", header: "Action", cell: (e) => <code className="text-xs">{e.action}</code> },
                { key: "by", header: "By", cell: (e) => e.actor?.display_name ?? e.source },
                { key: "codes", header: "Codes", cell: (e) => <ModerationFlag codes={e.reason_codes} /> },
                { key: "note", header: "Note", cell: (e) => <span className="line-clamp-2">{e.reason_text ?? "—"}</span> },
              ]}
            />
          </Panel>

          <Panel title={`Other reports on this ${report.listing_id ? "listing" : "user"}`} bodyClassName="p-0">
            <DataTable
              rows={detail.related}
              rowKey={(r) => r.id}
              empty="No other reports."
              columns={[
                { key: "case", header: "Case", cell: (r) => <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.case_number}</EntityLink> },
                { key: "reason", header: "Category", cell: (r) => REPORT_REASON_LABELS[r.reason] },
                { key: "severity", header: "Severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
                { key: "status", header: "Status", cell: (r) => <ReportStatusBadge status={r.status} /> },
                { key: "when", header: "Received", cell: (r) => formatDateTime(r.created_at), className: "whitespace-nowrap" },
              ]}
            />
          </Panel>
        </div>

        <aside className="grid content-start gap-4">
          <Panel title="Triage">
            {canManage ? (
              <ReportTriage reportId={report.id} assignedTo={report.assigned_to} priority={report.priority} staff={staff} actorId={actor.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Your role can view reports and add notes but not change their status.</p>
            )}
          </Panel>

          {canManage && (
            <Panel title="Status">
              <div className="grid gap-2">
                {report.status === "open" && (
                  <AdminActionDialog op="report.update" fields={{ reportId: report.id, status: "in_review" }} label="Start investigating" variant="default" title="Start investigating?" reasonLabel="Note (optional, audit log)" reasonRequired={false} />
                )}
                {!closed && (
                  <AdminActionDialog
                    op="report.update"
                    fields={{ reportId: report.id }}
                    label="Close case"
                    variant={report.status === "open" ? "outline" : "default"}
                    title="Close this case?"
                    description="Choose the outcome. The summary is shown to the reporter on their Reports & appeals page; keep it free of personal details about the other student."
                    extra={
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <label htmlFor="close-status" className="text-sm font-medium">Status</label>
                          <select id="close-status" name="status" defaultValue="actioned" className={selectClass}>
                            <option value="actioned">Action taken</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                          </select>
                        </div>
                        <ResolutionFields codes={RESOLUTION_CODES} />
                      </div>
                    }
                    reasonLabel="Summary for the reporter"
                    confirmLabel="Close case"
                  />
                )}
                {!closed && report.status !== "escalated" && (
                  <AdminActionDialog op="report.update" fields={{ reportId: report.id, status: "escalated" }} label="Escalate (legal/compliance)" title="Escalate this case?" description="For legal requests, threats or cases needing the compliance owner. Preserve records." reasonLabel="Why is this being escalated?" />
                )}
                {closed && (
                  <AdminActionDialog op="report.update" fields={{ reportId: report.id, status: "in_review" }} label="Reopen case" title="Reopen this case?" description="The resolution is cleared and the case returns to Investigating." reasonLabel="Why is it being reopened?" />
                )}
              </div>
            </Panel>
          )}

          {!closed && (
            <Panel title="Take action" description="Proportionate action closes the case as “Action taken”.">
              <div className="grid gap-2">
                {report.listing_id && report.listings && report.listings.moderation_status !== "removed" && can("listings.moderate") && (
                  <>
                    {report.listings.moderation_status !== "limited" && (
                      <AdminActionDialog op="listing.moderate" fields={{ listingId: report.listing_id, action: "quarantine", reportId: report.id }} label="Quarantine listing" title="Hide this listing while you investigate?" description="The report stays open." reasonLabel="Reason (audit log)" />
                    )}
                    <AdminActionDialog
                      op="listing.moderate"
                      fields={{ listingId: report.listing_id, action: "remove", reportId: report.id, summary: "The listing was removed for breaking the marketplace rules." }}
                      label="Remove listing"
                      variant="destructive"
                      title="Remove this listing?"
                      description="The seller sees the reason and can request a review. This case closes as “Action taken · Content removed”."
                      reasonLabel="Reason shown to the seller"
                      confirmLabel="Remove listing"
                    />
                  </>
                )}
                {(report.target_type === "post" || report.target_type === "comment") && contentId && can("community.moderate") && (
                  <AdminActionDialog
                    op="community.moderate"
                    fields={{ target: report.target_type, id: contentId, action: "remove", reportId: report.id }}
                    label={`Remove ${report.target_type}`}
                    variant="destructive"
                    title={`Remove this ${report.target_type}?`}
                    description="Its text is cleared for everyone and kept in the moderation log so an appeal can restore it."
                    reasonLabel="Reason (audit log)"
                    confirmLabel="Remove"
                  />
                )}
                {report.reported_user_id && report.reported_user_id !== actor.id && can("users.restrict") && (
                  <AdminActionDialog
                    op="user.restrict"
                    fields={{ userId: report.reported_user_id, reportId: report.id, summary: "Action was taken on the account." }}
                    label="Restrict account"
                    variant="destructive"
                    title="Restrict the reported account?"
                    description="The student is told the reason and can request a review. Choose the narrowest restriction that works."
                    extra={<RestrictFields />}
                    reasonLabel="Reason shown to the user"
                    confirmLabel="Apply restriction"
                  />
                )}
                {!can("listings.moderate") && !can("users.restrict") && <Muted>Your role can&apos;t take enforcement action.</Muted>}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
