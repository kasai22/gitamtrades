import type { Metadata } from "next";
import Link from "next/link";
import { Flag, Package, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission, isPermission, PERMISSION_LABELS } from "@/lib/auth/permissions";
import { formatDateTime, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DailyBars, RankedBars } from "@/features/admin/components/charts";
import { DataTable, Metric, PageHeading, Panel, UnavailableNotice } from "@/features/admin/components/data-table";
import { EntityLink, ModerationFlag, PriorityBadge, ReportStatusBadge } from "@/features/admin/components/admin-ui";
import { RangePicker } from "@/features/admin/components/range-picker";
import { parseDateRange } from "@/features/admin/lib/date-range";
import { getOverview, type OverviewData } from "@/features/admin/services/analytics";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Overview" };

/** Overview: live snapshot + activity in the chosen range. Every value comes from the database; failures show "Unavailable", never 0. */
export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const actor = await requirePermission("overview.view", "/admin");
  const params = await searchParams;
  const range = parseDateRange(params, new Date(), "30d");
  const denied = typeof params.denied === "string" && isPermission(params.denied) ? params.denied : null;
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  const supabase = await createClient();

  const [overview, recentUsers, recentListings, recentReports, recentEvents] = await Promise.all([
    getOverview(actor, range).then((d) => ({ data: d, ok: true as const })).catch(() => ({ data: null, ok: false as const })),
    can("users.view") ? supabase.from("profiles").select("id, display_name, email_verified_at, created_at").order("created_at", { ascending: false }).limit(6) : null,
    can("listings.view")
      ? supabase.from("listings").select("id, title, status, moderation_status, created_at, seller:profiles!listings_seller_id_fkey (display_name)").neq("status", "draft").order("created_at", { ascending: false }).limit(6)
      : null,
    can("reports.view") ? supabase.from("reports").select("id, case_number, reason, status, priority, created_at").order("created_at", { ascending: false }).limit(6) : null,
    can("moderation.view") || can("listings.view")
      ? supabase.from("moderation_events").select("id, action, source, reason_codes, listing_id, subject_user_id, report_id, created_at").order("created_at", { ascending: false }).limit(8)
      : null,
  ]);
  const o: OverviewData | null = overview.data;
  const v = <T,>(pick: (d: OverviewData) => T) => (o ? pick(o) : null);

  return (
    <>
      <PageHeading
        title="Overview"
        description="Marketplace health and trust & safety workload. Listings publish without approval; this console handles reports, automated escalations and appeals."
        actions={<RangePicker base="/admin" range={range} />}
      />
      {denied && (
        <p role="alert" className="mb-4 rounded-lg border border-warning-foreground/20 bg-warning px-3 py-2 text-sm text-warning-foreground">
          Your role doesn&apos;t include “{PERMISSION_LABELS[denied]}”, so that page isn&apos;t available. Ask a Super Admin if you need access.
        </p>
      )}
      {!overview.ok && <div className="mb-4"><UnavailableNotice what="Dashboard metrics" /></div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {can("reports.view") && (
          <Button asChild size="sm"><Link href="/admin/reports?status=active&sort=priority"><Flag aria-hidden /> Review reports{o ? ` (${(o.reports.open + o.reports.in_review + o.reports.escalated).toLocaleString("en-IN")})` : ""}</Link></Button>
        )}
        {can("listings.view") && <Button asChild size="sm" variant="outline"><Link href="/admin/listings?state=quarantined"><Package aria-hidden /> Quarantined listings</Link></Button>}
        {can("users.view") && <Button asChild size="sm" variant="outline"><Link href="/admin/users?status=restricted"><Users aria-hidden /> Restricted accounts</Link></Button>}
      </div>

      <section aria-label="Trust and safety" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Open reports" value={v((d) => d.reports.open)} href={can("reports.view") ? "/admin/reports?status=open" : undefined} tone="warning" />
        <Metric label="Investigating" value={v((d) => d.reports.in_review)} href={can("reports.view") ? "/admin/reports?status=in_review" : undefined} />
        <Metric label="Escalated" value={v((d) => d.reports.escalated)} href={can("reports.view") ? "/admin/reports?status=escalated" : undefined} tone="danger" />
        <Metric label="High/urgent open" value={v((d) => d.reports.urgent_open)} tone="danger" hint={o ? `${o.reports.unassigned_open} unassigned` : undefined} />
        <Metric label="Resolved (all time)" value={v((d) => d.reports.actioned + d.reports.resolved + d.reports.dismissed)} hint={o ? `${o.reports.actioned} action taken · ${o.reports.dismissed} dismissed` : undefined} />
        <Metric label="Open appeals" value={v((d) => d.safety.open_appeals)} href={can("appeals.view") ? "/admin/appeals" : undefined} />
      </section>

      <section aria-label="Students and listings" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Students" value={v((d) => d.students.total)} hint={o ? `${o.students.new_in_range} new in range` : undefined} />
        <Metric label="Verified" value={v((d) => d.students.verified)} hint={o && o.students.total ? `${Math.round((o.students.verified / o.students.total) * 100)}% of accounts` : undefined} />
        <Metric label="Live listings" value={v((d) => d.listings.live)} href={can("listings.view") ? "/admin/listings?state=live" : undefined} />
        <Metric label="Reserved" value={v((d) => d.listings.reserved)} href={can("listings.view") ? "/admin/listings?state=reserved" : undefined} />
        <Metric label="Sold" value={v((d) => d.listings.sold)} />
        <Metric label="Flagged" value={v((d) => d.listings.flagged)} href={can("listings.view") ? "/admin/listings?state=flagged" : undefined} tone="warning" hint="Open reports" />
        <Metric label="Quarantined" value={v((d) => d.listings.quarantined)} href={can("listings.view") ? "/admin/listings?state=quarantined" : undefined} tone="warning" />
        <Metric label="Removed" value={v((d) => d.listings.removed)} hint={o ? `${o.listings.blocked} auto-blocked` : undefined} />
      </section>

      <section aria-label="Activity" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Conversations" value={v((d) => d.conversations.total)} hint={o ? `${o.conversations.in_range} started in range` : undefined} />
        <Metric label="Listings created" value={v((d) => d.listings.created_in_range)} hint="In range (incl. drafts)" />
        <Metric label="Published" value={v((d) => d.listings.published_in_range)} hint="In range" />
        <Metric label="Reported listings" value={v((d) => d.reports.reported_listings_open)} hint="With open cases" />
        <Metric label="Reported users" value={v((d) => d.reports.reported_users_open)} hint="With open cases" />
        <Metric label="Active restrictions" value={v((d) => d.safety.active_restrictions)} hint={o ? `${o.safety.active_suspensions} suspensions` : undefined} />
      </section>

      {o && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Panel title="Registrations" className="lg:col-span-1"><DailyBars title="New accounts per day" points={o.series.map((s) => ({ day: s.day, value: s.registrations }))} /></Panel>
          <Panel title="Listing activity"><DailyBars title="Listings created per day" points={o.series.map((s) => ({ day: s.day, value: s.listings }))} /></Panel>
          <Panel title="Reports"><DailyBars title="Reports filed per day" points={o.series.map((s) => ({ day: s.day, value: s.reports }))} /></Panel>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {o && (
          <Panel title="Live listings by category" description="Current snapshot; disabled categories are marked.">
            <RankedBars rows={o.categories.map((c) => ({ label: c.name, value: c.live, note: c.is_active ? `of ${c.total}` : `of ${c.total} · disabled` }))} empty="No live listings yet." />
          </Panel>
        )}
        {recentReports && (
          <Panel title="Recent reports" actions={<EntityLink href="/admin/reports">All reports</EntityLink>} bodyClassName="p-0">
            <DataTable
              rows={recentReports.data ?? []}
              rowKey={(r) => r.id}
              empty={recentReports.error ? "Couldn't load reports." : "No reports yet."}
              columns={[
                { key: "case", header: "Case", cell: (r) => <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.case_number}</EntityLink> },
                { key: "reason", header: "Reason", cell: (r) => REPORT_REASON_LABELS[r.reason] },
                { key: "priority", header: "Priority", cell: (r) => <PriorityBadge priority={r.priority} /> },
                { key: "status", header: "Status", cell: (r) => <ReportStatusBadge status={r.status} /> },
                { key: "when", header: "Received", cell: (r) => formatRelative(r.created_at), className: "whitespace-nowrap text-muted-foreground" },
              ]}
            />
          </Panel>
        )}
        {recentUsers && (
          <Panel title="Recent registrations" actions={<EntityLink href="/admin/users">All users</EntityLink>} bodyClassName="p-0">
            <DataTable
              rows={recentUsers.data ?? []}
              rowKey={(u) => u.id}
              empty={recentUsers.error ? "Couldn't load users." : "No registrations yet."}
              columns={[
                { key: "name", header: "Name", cell: (u) => <EntityLink href={`/admin/users/${u.id}`}>{u.display_name}</EntityLink> },
                { key: "verified", header: "Verified", cell: (u) => (u.email_verified_at ? "Yes" : <span className="text-muted-foreground">Not yet</span>) },
                { key: "when", header: "Joined", cell: (u) => formatRelative(u.created_at), className: "whitespace-nowrap text-muted-foreground" },
              ]}
            />
          </Panel>
        )}
        {recentListings && (
          <Panel title="Recent listings" actions={<EntityLink href="/admin/listings?sort=created_at">All listings</EntityLink>} bodyClassName="p-0">
            <DataTable
              rows={recentListings.data ?? []}
              rowKey={(l) => l.id}
              empty={recentListings.error ? "Couldn't load listings." : "No listings yet."}
              columns={[
                { key: "title", header: "Listing", cell: (l) => <EntityLink href={`/admin/listings/${l.id}`} className="line-clamp-1">{l.title}</EntityLink> },
                { key: "seller", header: "Seller", cell: (l) => l.seller?.display_name ?? "—" },
                { key: "state", header: "State", cell: (l) => <span className="text-xs">{l.status} · {l.moderation_status}</span> },
                { key: "when", header: "Created", cell: (l) => formatRelative(l.created_at), className: "whitespace-nowrap text-muted-foreground" },
              ]}
            />
          </Panel>
        )}
        {recentEvents && (
          <Panel title="Recent moderation activity" description="Automated decisions and staff actions." actions={can("audit.view") ? <EntityLink href="/admin/audit-logs">Audit log</EntityLink> : undefined} bodyClassName="p-0" className="xl:col-span-2">
            <DataTable
              rows={recentEvents.data ?? []}
              rowKey={(e) => e.id}
              empty={recentEvents.error ? "Couldn't load moderation activity." : "No moderation activity yet."}
              columns={[
                { key: "when", header: "When", cell: (e) => formatDateTime(e.created_at), className: "whitespace-nowrap" },
                { key: "action", header: "Action", cell: (e) => <code className="text-xs">{e.action}</code> },
                { key: "source", header: "Source", cell: (e) => e.source },
                { key: "codes", header: "Reasons", cell: (e) => <ModerationFlag codes={e.reason_codes} /> },
                {
                  key: "target",
                  header: "Target",
                  cell: (e) =>
                    e.report_id && can("reports.view") ? <EntityLink href={`/admin/reports/${e.report_id}`}>Report</EntityLink>
                    : e.listing_id && can("listings.view") ? <EntityLink href={`/admin/listings/${e.listing_id}`}>Listing</EntityLink>
                    : e.subject_user_id && can("users.view") ? <EntityLink href={`/admin/users/${e.subject_user_id}`}>User</EntityLink>
                    : "—",
                },
              ]}
            />
          </Panel>
        )}
      </div>
      {o && <p className="mt-4 text-xs text-muted-foreground">Range {o.range.from} to {o.range.to} ({o.range.tz} calendar days). Snapshot values are current.</p>}
    </>
  );
}
