import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { DetailList, EntityLink, Muted, ReportStatusBadge } from "@/features/admin/components/admin-ui";
import { PageHeading, Panel } from "@/features/admin/components/data-table";
import { UUID } from "@/features/admin/lib/list-params";
import { getConversationMeta, readConversationMessages } from "@/features/admin/services/conversations";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Conversation" };

export default async function AdminConversationPage({ params, searchParams }: PageProps<"/admin/messages/[conversationId]">) {
  const { conversationId } = await params;
  const actor = await requirePermission("messages.investigate", `/admin/messages/${conversationId}`);
  if (!UUID.test(conversationId)) notFound();
  const meta = await getConversationMeta(actor, conversationId);
  if (!meta) notFound();
  const { conversation: c } = meta;
  const reportParam = (await searchParams).report;
  const preselected = typeof reportParam === "string" && meta.reports.some((r) => r.id === reportParam) ? reportParam : "";
  // Messages load only while this admin holds a valid, documented grant; each load is audited in the database.
  const messages = meta.grant && !meta.isParticipant ? await readConversationMessages(actor, conversationId) : null;
  const sideOf = (senderId: string | null) => (senderId === c.buyerId ? "buyer" : senderId === c.sellerId ? "seller" : "system");

  return (
    <>
      <PageHeading
        title="Conversation investigation"
        description={
          <span>
            About <EntityLink href={`/admin/listings/${c.listingId}`}>{c.listingTitle}</EntityLink>
            {c.restrictedAt && <Badge variant="destructive" className="ml-2">Restricted</Badge>}
          </span>
        }
        actions={
          !meta.isParticipant && (
            <AdminActionDialog
              op="conversation.restrict"
              fields={{ conversationId: c.id, restrict: c.restrictedAt ? "0" : "1", ...(preselected ? { reportId: preselected } : {}) }}
              label={c.restrictedAt ? "Lift restriction" : "Restrict conversation"}
              variant={c.restrictedAt ? "outline" : "destructive"}
              title={c.restrictedAt ? "Allow messages again?" : "Stop new messages in this conversation?"}
              description={
                c.restrictedAt
                  ? "Both participants can send messages again."
                  : "Both participants can still read earlier messages and see that the safety team paused the chat. To stop one person messaging anyone, restrict their account instead."
              }
              reasonLabel={c.restrictedAt ? "Reason (audit log)" : "Reason (shown to participants)"}
            />
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {meta.isParticipant ? (
            <Panel title="Messages">
              <p className="text-sm text-muted-foreground">You take part in this conversation, so you can&apos;t investigate it. Ask another moderator.</p>
            </Panel>
          ) : !messages ? (
            <Panel title="Messages are private">
              <div className="grid gap-3 text-sm">
                <p className="flex items-start gap-2 text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Record why you need to read this conversation. Access lasts 30 minutes, is limited to you, and the reason, time and every view are written to the audit log.
                </p>
                <AdminActionDialog
                  op="conversation.access"
                  fields={{ conversationId: c.id }}
                  label="Request access"
                  variant="default"
                  className="justify-self-start"
                  title="Open this conversation for investigation?"
                  description="Only open conversations you have a documented reason to review, such as a report about this chat."
                  extra={
                    meta.reports.length > 0 ? (
                      <div className="grid gap-1.5">
                        <label htmlFor="access-report" className="text-sm font-medium">Linked report</label>
                        <select id="access-report" name="reportId" defaultValue={preselected} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
                          <option value="">No specific report</option>
                          {meta.reports.map((r) => (
                            <option key={r.id} value={r.id}>{r.caseNumber} · {REPORT_REASON_LABELS[r.reason]}</option>
                          ))}
                        </select>
                      </div>
                    ) : undefined
                  }
                  reasonLabel="Investigation reason (at least 10 characters)"
                  reasonMinLength={10}
                  confirmLabel="Record reason and open"
                />
              </div>
            </Panel>
          ) : (
            <Panel title={`Messages (${messages.length})`} description={`Access recorded until ${formatDateTime(meta.grant!.expires_at)}. Reason: “${meta.grant!.reason}”`}>
              {messages.length === 0 ? (
                <Muted>No messages.</Muted>
              ) : (
                <ol className="grid gap-2" role="list">
                  {messages.map((m) => {
                    const side = sideOf(m.senderId);
                    return (
                      <li
                        key={m.id}
                        className={cn("max-w-[85%] rounded-lg border p-2.5 text-sm", side === "seller" ? "justify-self-end bg-secondary/40" : side === "system" ? "justify-self-center bg-muted text-xs" : "bg-card")}
                      >
                        <p className="mb-0.5 text-xs text-muted-foreground">
                          {side === "buyer" ? `${c.buyerName} (buyer)` : side === "seller" ? `${c.sellerName} (seller)` : "System"} · {formatDateTime(m.createdAt)}
                          {m.kind === "contact_share" && <Badge variant="info" className="ml-1">Contact shared</Badge>}
                        </p>
                        <p className="break-words whitespace-pre-wrap">{m.body}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Panel>
          )}
        </div>
        <aside className="grid content-start gap-4">
          <Panel title="Participants">
            <DetailList
              className="sm:grid-cols-1"
              items={[
                ["Buyer", <EntityLink key="b" href={`/admin/users/${c.buyerId}`}>{c.buyerName}</EntityLink>],
                ["Seller", <EntityLink key="s" href={`/admin/users/${c.sellerId}`}>{c.sellerName}</EntityLink>],
                ["Started", formatDateTime(c.createdAt)],
                ["Messages", String(c.messageCount)],
                ["Conversation ID", <code key="id" className="text-xs break-all">{c.id}</code>],
              ]}
            />
          </Panel>
          <Panel title="Linked reports">
            {meta.reports.length === 0 ? (
              <Muted>No reports link to this conversation.</Muted>
            ) : (
              <ul className="grid gap-1.5 text-sm" role="list">
                {meta.reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-1.5">
                    <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.caseNumber}</EntityLink>
                    <ReportStatusBadge status={r.status} />
                    <span className="text-xs text-muted-foreground">{REPORT_REASON_LABELS[r.reason]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
