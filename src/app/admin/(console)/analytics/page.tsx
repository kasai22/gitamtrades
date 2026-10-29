import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { DailyBars, RankedBars } from "@/features/admin/components/charts";
import { DataTable, Metric, PageHeading, Panel, UnavailableNotice } from "@/features/admin/components/data-table";
import { RangePicker } from "@/features/admin/components/range-picker";
import { parseDateRange } from "@/features/admin/lib/date-range";
import { getAnalytics, type AnalyticsData } from "@/features/admin/services/analytics";
import { REPORT_REASON_LABELS, type ReportReason } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Analytics" };

const sum = (rows: AnalyticsData["series"], key: keyof AnalyticsData["series"][number]) => rows.reduce((n, r) => n + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
const hours = (h: number | null) => (h === null ? null : h < 1 ? `${Math.round(h * 60)} min` : `${h} h`);

/** Aggregated operational analytics. Metrics that aren't tracked are labelled, never estimated. */
export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const actor = await requirePermission("analytics.view", "/admin/analytics");
  const range = parseDateRange(await searchParams, new Date(), "30d");
  let data: AnalyticsData | null = null;
  try {
    data = await getAnalytics(actor, range);
  } catch {
    data = null;
  }
  const exportHref = `/api/admin/analytics?format=csv&from=${range.from}&to=${range.to}`;

  return (
    <>
      <PageHeading
        title="Analytics"
        description={`Aggregates for ${range.from} to ${range.to} (IST calendar days). No individual records are shown here.`}
        actions={
          <>
            <RangePicker base="/admin/analytics" range={range} />
            {hasPermission(actor, "analytics.export") && (
              <Button asChild size="sm" variant="outline"><a href={exportHref}><Download aria-hidden /> Daily CSV</a></Button>
            )}
          </>
        }
      />
      {!data ? (
        <UnavailableNotice what="Analytics" />
      ) : (
        <AnalyticsBody data={data} />
      )}
    </>
  );
}

function AnalyticsBody({ data }: { data: AnalyticsData }) {
  const s = data.series;
  const searches = sum(s, "searches");
  const zero = sum(s, "zero_result_searches");
  const registered = data.verification.registered_in_range;
  const verifiedShare = registered ? Math.round((data.verification.verified_of_registered / registered) * 100) : null;
  const m = data.moderation;
  const autoBlocked = m.auto_blocked ?? 0;
  const overturned = data.enforcement.appeals_overturned;
  const series = (key: keyof AnalyticsData["series"][number]) => s.map((r) => ({ day: r.day, value: Number(r[key]) || 0 }));

  return (
    <div className="grid gap-4">
      <section aria-label="Growth" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Metric label="Registrations" value={registered} />
        <Metric label="Verification rate" value={verifiedShare} display={verifiedShare === null ? "—" : `${verifiedShare}%`} hint={verifiedShare === null ? "No registrations in range" : "of new accounts verified"} />
        <Metric label="Listings created" value={sum(s, "listings_created")} hint="Incl. drafts" />
        <Metric label="Published" value={sum(s, "listings_published")} />
        <Metric label="Marked sold" value={sum(s, "listings_sold")} hint="Seller-reported" />
        <Metric label="Reserved now" value={data.listings_now.reserved} hint="No history tracked" />
        <Metric label="Conversations" value={sum(s, "conversations")} />
        <Metric label="Reports" value={sum(s, "reports")} />
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="Registrations"><DailyBars title="New accounts" points={series("registrations")} /></Panel>
        <Panel title="Verifications"><DailyBars title="Emails verified" points={series("verifications")} /></Panel>
        <Panel title="Publication"><DailyBars title="Listings published" points={series("listings_published")} /></Panel>
        <Panel title="Sold"><DailyBars title="Listings marked sold" points={series("listings_sold")} /></Panel>
        <Panel title="Conversations"><DailyBars title="Conversations started" points={series("conversations")} /></Panel>
        <Panel title="Reports"><DailyBars title="Reports filed" points={series("reports")} /></Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Search and discovery" description="From first-party search events (query text isn't stored except letters-only zero-result terms).">
          {!data.tracking.search_events ? (
            <p className="text-sm text-muted-foreground">No search events have been recorded yet, so search activity can&apos;t be shown.</p>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <Metric label="Searches" value={searches} />
                <Metric label="Zero results" value={zero} hint={searches ? `${Math.round((zero / searches) * 100)}% of searches` : undefined} tone="warning" />
                <Metric label="Listing views" value={data.tracking.listing_view_events ? sum(s, "listing_views") : null} hint={data.tracking.listing_view_events ? undefined : "Not tracked yet"} />
              </div>
              <DailyBars title="Searches per day" points={series("searches")} />
            </>
          )}
        </Panel>
        <Panel title="Category popularity" description="Listings created in range; live is the current snapshot." bodyClassName="p-0">
          <DataTable
            rows={data.categories}
            rowKey={(c) => c.slug}
            columns={[
              { key: "name", header: "Category", cell: (c) => c.name },
              { key: "created", header: "Created", align: "right", cell: (c) => c.created },
              { key: "conv", header: "Chats", align: "right", cell: (c) => c.conversations },
              { key: "sold", header: "Sold", align: "right", cell: (c) => c.sold },
              { key: "live", header: "Live now", align: "right", cell: (c) => c.live },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Reports by category" className="xl:col-span-2">
          <RankedBars rows={data.reports_by_reason.map((r) => ({ label: REPORT_REASON_LABELS[r.reason as ReportReason] ?? r.reason, value: r.count, note: r.high ? `${r.high} high` : undefined }))} empty="No reports in this range." />
          <p className="mt-3 text-xs text-muted-foreground">
            By severity: high {data.reports_by_severity["3"] ?? 0} · medium {data.reports_by_severity["2"] ?? 0} · low {data.reports_by_severity["1"] ?? 0}
          </p>
        </Panel>
        <Panel title="Response and resolution">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Cases closed" value={data.resolution.closed} />
            <Metric label="Median to resolve" value={null} display={hours(data.resolution.median_hours) ?? "—"} hint={data.resolution.closed ? undefined : "No closed cases"} />
            <Metric label="90th percentile" value={null} display={hours(data.resolution.p90_hours) ?? "—"} />
            <Metric label="Median first staff action" value={null} display={hours(data.first_response.median_hours) ?? "—"} hint={data.first_response.responded ? `${data.first_response.responded} cases` : "No staff actions"} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">“—” means there were no cases to measure in this range.</p>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Automated moderation">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Auto-published" value={m.auto_published ?? 0} />
            <Metric label="Quarantined by checks" value={m.auto_limited ?? 0} />
            <Metric label="Auto-blocked" value={autoBlocked} />
            <Metric label="Report threshold" value={m.report_auto_limited ?? 0} />
            <Metric label="Staff removals" value={m.admin_removed ?? 0} />
            <Metric label="Staff restores" value={m.admin_restored ?? 0} />
            <Metric label="Appeals overturned" value={overturned} hint={autoBlocked ? `vs ${autoBlocked} auto-blocks` : undefined} />
            <Metric label="Appeals upheld" value={data.enforcement.appeals_upheld} />
          </div>
        </Panel>
        <Panel title="Enforcement">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Active suspensions" value={data.enforcement.active_suspensions} />
            <Metric label="New restrictions" value={data.enforcement.new_restrictions} />
            <Metric label="New suspensions" value={data.enforcement.new_suspensions} />
            <Metric label="Repeat violators" value={data.enforcement.repeat_violators} hint="≥2 enforcement events" tone="warning" />
            <Metric label="Unverified > 72h" value={data.verification.unverified_older_than_72h} />
            <Metric label="Quarantined now" value={data.listings_now.quarantined} />
            <Metric label="Appeals submitted" value={data.enforcement.appeals_submitted} />
            <Metric label="Live listings now" value={data.listings_now.live} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
