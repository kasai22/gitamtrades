import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { AdminInlineAction } from "@/features/admin/components/admin-action";
import { EntityLink, ModerationFlag, Muted } from "@/features/admin/components/admin-ui";
import { DataTable, Metric, PageHeading, Panel } from "@/features/admin/components/data-table";
import { PolicyEditor } from "@/features/admin/components/policy-editor";
import { getModerationConfig } from "@/features/admin/services/config";
import { DEFAULT_POLICY } from "@/features/moderation/policy";
import { BUILT_IN_CHECKS, classifierStatus } from "@/features/moderation/providers";

export const metadata: Metadata = { title: "Moderation rules" };

/** Automated moderation: deterministic, versioned rules. Never a pre-approval queue. */
export default async function AdminModerationPage() {
  const actor = await requirePermission("moderation.view", "/admin/moderation");
  const data = await getModerationConfig(actor);
  const canManage = hasPermission(actor, "moderation.manage");
  const config = data.activeConfig ?? DEFAULT_POLICY;
  const ai = classifierStatus();
  const blockRules = config.rules.filter((r) => r.action === "block").length;

  return (
    <>
      <PageHeading
        title="Moderation rules"
        description="Listings publish immediately when checks pass. High-confidence matches are blocked with an explanation; uncertain signals publish quarantined for review. Every change creates a new policy version you can roll back."
        actions={data.active ? <Badge variant="success">Policy v{data.active.version} active</Badge> : <Badge variant="destructive">No active policy (defaults in use)</Badge>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Keyword rules" value={config.rules.length} hint={`${blockRules} block · ${config.rules.length - blockRules} review`} />
        <Metric label="Restricted terms" value={config.rules.reduce((n, r) => n + r.terms.length, 0)} />
        <Metric label="Prohibited categories" value={config.disabledCategorySlugs.length} />
        <Metric label="Auto-quarantine threshold" value={config.reports.anyReasonAutoLimitThreshold} hint={`${config.reports.highSeverityAutoLimitThreshold} for high-severity reasons`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Built-in deterministic checks" description="Always on, applied to every listing at publish and edit time." bodyClassName="p-0">
          <DataTable
            rows={BUILT_IN_CHECKS}
            rowKey={(c) => c.name}
            columns={[
              { key: "name", header: "Check", cell: (c) => <span className="font-medium">{c.name}</span> },
              { key: "action", header: "Action", cell: (c) => <Badge variant={c.action === "block" ? "destructive" : "warning"}>{c.action === "block" ? "Block" : "Quarantine for review"}</Badge> },
              { key: "detail", header: "What it detects", cell: (c) => <span className="text-xs">{c.detail}</span> },
              { key: "codes", header: "Reason codes", cell: (c) => <ModerationFlag codes={c.codes} /> },
            ]}
          />
        </Panel>
        <Panel title="AI moderation">
          <p className="flex items-start gap-2 text-sm">
            <Bot className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            {ai.configured ? `Provider ${ai.id} v${ai.version} is configured.` : ai.reason}
          </p>
          {!ai.configured && (
            <p className="mt-2 text-xs text-muted-foreground">
              A provider-independent classifier interface exists (<code>src/features/moderation/providers.ts</code>). Image content such as nudity or illegal material isn&apos;t classified automatically; rely on reports and review.
            </p>
          )}
        </Panel>
      </div>

      <Panel title={canManage ? "Edit policy" : "Active policy"} description={canManage ? "Changes are validated, versioned and recorded in the audit log." : "Read-only: only Super Admins can change moderation rules."} className="mb-4">
        {canManage ? (
          <PolicyEditor initial={config} categories={data.categories.map((c) => ({ slug: c.slug, name: c.name }))} />
        ) : (
          <DataTable
            rows={config.rules}
            rowKey={(r) => r.id}
            columns={[
              { key: "id", header: "Rule", cell: (r) => <code className="text-xs">{r.id}</code> },
              { key: "action", header: "Action", cell: (r) => r.action },
              { key: "reason", header: "Reason", cell: (r) => <code className="text-xs">{r.reasonCode}</code> },
              { key: "terms", header: "Terms", cell: (r) => <span className="line-clamp-2 text-xs">{r.terms.join(", ")}</span> },
            ]}
          />
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Policy versions" description="Roll back by activating an earlier version." bodyClassName="p-0">
          <DataTable
            rows={data.versions}
            rowKey={(v) => v.id}
            columns={[
              { key: "version", header: "Version", cell: (v) => <span className="font-mono">v{v.version}</span> },
              { key: "note", header: "Change note", cell: (v) => <span className="line-clamp-2">{v.note ?? "—"}</span> },
              { key: "by", header: "By", cell: (v) => v.creator?.display_name ?? <Muted>migration</Muted> },
              { key: "when", header: "Created", cell: (v) => formatDateTime(v.created_at), className: "whitespace-nowrap" },
              {
                key: "state",
                header: "",
                cell: (v) => (v.is_active ? <Badge variant="success">Active</Badge> : canManage ? <AdminInlineAction op="policy.activate" fields={{ policyId: v.id }} label="Activate" /> : null),
              },
            ]}
          />
        </Panel>
        <Panel title="Recent automated decisions" description="Moderation event history from checks and report thresholds." bodyClassName="p-0">
          <DataTable
            rows={data.automatedEvents}
            rowKey={(e) => e.id}
            empty="No automated decisions yet."
            columns={[
              { key: "when", header: "When", cell: (e) => formatDateTime(e.created_at), className: "whitespace-nowrap" },
              { key: "action", header: "Outcome", cell: (e) => <code className="text-xs">{e.action}</code> },
              { key: "codes", header: "Reasons", cell: (e) => <ModerationFlag codes={e.reason_codes} /> },
              { key: "rule", header: "Rule version", cell: (e) => <span className="text-xs">{e.rule_version ?? "—"}</span> },
              {
                key: "target",
                header: "",
                cell: (e) => (e.listing_id && hasPermission(actor, "listings.view") ? <EntityLink href={`/admin/listings/${e.listing_id}`}>Listing</EntityLink> : e.forum_post_id ? <EntityLink href={`/community/${e.forum_post_id}`}>Post</EntityLink> : null),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
