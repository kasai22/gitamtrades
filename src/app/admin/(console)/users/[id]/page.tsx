import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ListingStatusBadge, ModerationBadge } from "@/components/marketplace/badges";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { DetailList, EntityLink, ModerationFlag, Muted, ReportStatusBadge, RoleBadge, SeverityBadge } from "@/features/admin/components/admin-ui";
import { DataTable, Metric, PageHeading, Panel } from "@/features/admin/components/data-table";
import { RestrictFields } from "@/features/admin/components/restrict-fields";
import { RevealContact } from "@/features/admin/components/reveal-contact";
import { UUID } from "@/features/admin/lib/list-params";
import { getUserDetail } from "@/features/admin/services/users";
import { isRestrictionActive } from "@/features/account/restrictions";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "User" };

const RESTRICTION_LABELS: Record<string, string> = { suspension: "Suspension", listing_ban: "Listing ban", messaging_ban: "Messaging ban" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const actor = await requirePermission("users.view", `/admin/users/${id}`);
  if (!UUID.test(id)) notFound();
  const detail = await getUserDetail(actor, id);
  if (!detail) notFound();
  const { user, signals } = detail;

  const active = detail.restrictions.filter((r) => isRestrictionActive(r));
  const isSelf = user.id === actor.id;
  const isStaff = detail.roles.length > 0;
  const canRestrict = hasPermission(actor, "users.restrict") && !isSelf && (!isStaff || hasPermission(actor, "roles.manage"));
  const suspicious = signals.listingsLast24h >= 5 || signals.distinctReporters >= 3 || signals.enforcementEvents >= 2 || signals.conversationsStartedLast24h >= 15;

  return (
    <>
      <PageHeading
        title={user.display_name}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            {detail.roles.map((r) => <RoleBadge key={r} role={r} />)}
            {user.email_verified_at ? <Badge variant="success">Email verified</Badge> : <Badge variant="outline">Unverified</Badge>}
            {active.map((r) => <Badge key={r.id} variant="destructive">{RESTRICTION_LABELS[r.kind]}</Badge>)}
            {isSelf && <Badge variant="info">This is you</Badge>}
          </span>
        }
        actions={
          <>
            {canRestrict && (
              <AdminActionDialog
                op="user.restrict"
                fields={{ userId: user.id }}
                label="Restrict account"
                variant="destructive"
                title={`Restrict ${user.display_name}?`}
                description="The student sees this reason on their account page and can request a review. Choose the narrowest restriction that addresses the problem."
                extra={<RestrictFields />}
                reasonLabel="Reason shown to the user"
                confirmLabel="Apply restriction"
              />
            )}
            {isStaff && hasPermission(actor, "roles.manage") && !isSelf && (
              <Link href="/admin/roles" className="text-sm text-primary hover:underline">Manage roles</Link>
            )}
          </>
        }
      />

      {suspicious && (
        <p role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-warning-foreground/20 bg-warning px-3 py-2 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Unusual activity: review the signals below and the reports and listings tabs before deciding on any action.
        </p>
      )}

      <section aria-label="Signals" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Account age" value={signals.accountAgeDays} hint="days" />
        <Metric label="Listings (24h)" value={signals.listingsLast24h} tone="warning" />
        <Metric label="Blocked/removed" value={signals.blockedOrRemovedListings} tone="danger" hint="listings" />
        <Metric label="Quarantined" value={signals.quarantinedListings} tone="warning" />
        <Metric label="Open reports" value={signals.openReportsAgainst} tone="danger" hint={`${signals.distinctReporters} distinct reporters`} />
        <Metric label="Reports filed" value={signals.reportsFiled} hint="by this user" />
        <Metric label="Conversations" value={signals.conversations} hint={`${signals.conversationsStartedLast24h} started in 24h`} />
        <Metric label="Enforcement events" value={signals.enforcementEvents} tone="danger" />
      </section>

      <Tabs defaultValue="profile" className="gap-3">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="restrictions">Restrictions ({detail.restrictions.length})</TabsTrigger>
          <TabsTrigger value="listings">Listings ({detail.listings.length})</TabsTrigger>
          <TabsTrigger value="reports">Reports ({detail.reportsAgainst.length + detail.reportsFiled.length})</TabsTrigger>
          <TabsTrigger value="history">Moderation history</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Account">
              <DetailList
                items={[
                  ["User ID", <code key="id" className="text-xs break-all">{user.id}</code>],
                  ["University", user.universityName || "—"],
                  ["Email domain", detail.private?.emailDomain ? <code key="d">@{detail.private.emailDomain}</code> : "—"],
                  ["Account email", hasPermission(actor, "users.view_contact") ? <RevealContact key="c" userId={user.id} /> : <Muted key="m">Hidden for your role</Muted>],
                  ["Email verified", user.email_verified_at ? formatDateTime(user.email_verified_at) : "Not verified"],
                  ["Joined", formatDateTime(user.created_at)],
                  ["Seller since", user.seller_enabled_at ? formatDate(user.seller_enabled_at) : "Not a seller"],
                  ["Saved contact number", detail.private ? (detail.private.hasContactPhone ? "Yes (not shown)" : "No") : "—"],
                ]}
              />
            </Panel>
            <Panel title="Agreements">
              <DetailList
                items={[
                  ["18+ confirmed", detail.private?.ageConfirmedAt ? formatDateTime(detail.private.ageConfirmedAt) : "—"],
                  ["Terms version", detail.private?.termsVersion ?? "—"],
                  ["Terms accepted", detail.private?.termsAcceptedAt ? formatDateTime(detail.private.termsAcceptedAt) : "—"],
                  ["Seller terms", detail.private?.sellerTermsAcceptedAt ? formatDateTime(detail.private.sellerTermsAcceptedAt) : "—"],
                  [
                    "Deletion request",
                    detail.deletionRequests[0] ? (
                      <span key="del">
                        {detail.deletionRequests[0].status} since {formatDate(detail.deletionRequests[0].created_at)}{" "}
                        {hasPermission(actor, "deletions.view") && <EntityLink href="/admin/deletion-requests">Review</EntityLink>}
                      </span>
                    ) : (
                      "None"
                    ),
                  ],
                  ["Appeals", detail.appeals.length ? detail.appeals.map((a) => `${a.case_number} (${a.status})`).join(", ") : "None"],
                ]}
              />
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="restrictions">
          <DataTable
            rows={detail.restrictions}
            rowKey={(r) => r.id}
            empty="No restrictions on this account."
            columns={[
              { key: "kind", header: "Restriction", cell: (r) => RESTRICTION_LABELS[r.kind] },
              { key: "reason", header: "Reason (shown to user)", cell: (r) => <span className="line-clamp-3">{r.reason}</span> },
              { key: "from", header: "Applied", cell: (r) => formatDateTime(r.created_at), className: "whitespace-nowrap" },
              { key: "until", header: "Until", cell: (r) => (r.expires_at ? formatDateTime(r.expires_at) : "Until lifted"), className: "whitespace-nowrap" },
              { key: "state", header: "State", cell: (r) => (r.lifted_at ? <span title={r.lift_reason ?? ""}>Lifted</span> : active.includes(r) ? <Badge variant="destructive">Active</Badge> : <Muted>Expired</Muted>) },
              {
                key: "actions",
                header: "",
                cell: (r) =>
                  active.includes(r) && hasPermission(actor, "users.restrict") && !isSelf ? (
                    <AdminActionDialog op="user.lift" fields={{ restrictionId: r.id }} label="Lift" title="Lift this restriction?" description="The account regains this capability immediately." reasonLabel="Reason (audit log)" />
                  ) : null,
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="listings">
          <DataTable
            rows={detail.listings}
            rowKey={(l) => l.id}
            empty="This user hasn't created listings."
            columns={[
              { key: "title", header: "Title", cell: (l) => <EntityLink href={`/admin/listings/${l.id}`}>{l.title}</EntityLink> },
              { key: "state", header: "State", cell: (l) => <span className="flex gap-1"><ListingStatusBadge status={l.status} /><ModerationBadge status={l.moderation_status} /></span> },
              { key: "created", header: "Created", cell: (l) => formatDateTime(l.created_at), className: "whitespace-nowrap" },
              { key: "updated", header: "Updated", cell: (l) => formatDateTime(l.updated_at), className: "whitespace-nowrap" },
            ]}
          />
          {detail.listings.length >= 50 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the 50 most recent. <EntityLink href={`/admin/listings?q=${encodeURIComponent(user.display_name)}`}>Search all listings</EntityLink>
            </p>
          )}
        </TabsContent>

        <TabsContent value="reports">
          <div className="grid gap-4">
            <Panel title="Reports against this user" bodyClassName="p-0">
              <DataTable
                rows={detail.reportsAgainst}
                rowKey={(r) => r.id}
                empty="No reports against this user."
                columns={[
                  { key: "case", header: "Case", cell: (r) => <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.case_number}</EntityLink> },
                  { key: "reason", header: "Reason", cell: (r) => REPORT_REASON_LABELS[r.reason] },
                  { key: "severity", header: "Severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
                  { key: "target", header: "Target", cell: (r) => r.target_type },
                  { key: "status", header: "Status", cell: (r) => <ReportStatusBadge status={r.status} /> },
                  { key: "when", header: "Received", cell: (r) => formatDateTime(r.created_at), className: "whitespace-nowrap" },
                ]}
              />
            </Panel>
            <Panel title="Reports filed by this user" description="Useful for spotting report abuse." bodyClassName="p-0">
              <DataTable
                rows={detail.reportsFiled}
                rowKey={(r) => r.id}
                empty="This user hasn't filed reports."
                columns={[
                  { key: "case", header: "Case", cell: (r) => <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.case_number}</EntityLink> },
                  { key: "reason", header: "Reason", cell: (r) => REPORT_REASON_LABELS[r.reason] },
                  { key: "target", header: "Target", cell: (r) => r.target_type },
                  { key: "status", header: "Status", cell: (r) => <ReportStatusBadge status={r.status} /> },
                  { key: "when", header: "Filed", cell: (r) => formatDateTime(r.created_at), className: "whitespace-nowrap" },
                ]}
              />
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            rows={detail.events}
            rowKey={(e) => e.id}
            empty="No moderation events for this user."
            columns={[
              { key: "when", header: "When", cell: (e) => formatDateTime(e.created_at), className: "whitespace-nowrap" },
              { key: "action", header: "Action", cell: (e) => <code className="text-xs">{e.action}</code> },
              { key: "source", header: "Source", cell: (e) => e.source },
              { key: "codes", header: "Codes", cell: (e) => <ModerationFlag codes={e.reason_codes} /> },
              { key: "note", header: "Note", cell: (e) => <span className="line-clamp-2">{e.reason_text ?? "—"}</span> },
              {
                key: "link",
                header: "",
                cell: (e) =>
                  e.listing_id ? <EntityLink href={`/admin/listings/${e.listing_id}`}>Listing</EntityLink> : e.report_id ? <EntityLink href={`/admin/reports/${e.report_id}`}>Report</EntityLink> : null,
              },
            ]}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
