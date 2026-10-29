import type { Metadata } from "next";
import Link from "next/link";
import { ModerationBadge } from "@/components/marketplace/badges";
import { EmptyState, PageHeader } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { FilterTabs } from "@/features/admin/components/admin-ui";

export const metadata: Metadata = { title: "Appeals" };

export default async function AdminAppealsPage({ searchParams }: PageProps<"/admin/appeals">) {
  const actor = await requirePermission("appeals.view", "/admin/appeals");
  const params = await searchParams;
  const status = params.status === "resolved" ? "resolved" : "open";
  const supabase = await createClient();
  let query = supabase
    .from("appeals")
    .select(
      `id, case_number, message, status, resolution_summary, created_at, resolved_at, listing_id, restriction_id,
       user:profiles!appeals_user_id_fkey (id, display_name),
       listings (id, title, moderation_status, moderation_source),
       account_restrictions (id, kind, reason)`,
    )
    .order("created_at", { ascending: status === "open" })
    .limit(100);
  query = status === "open" ? query.eq("status", "open") : query.neq("status", "open");
  const { data: appeals } = await query;

  return (
    <>
      <PageHeader title="Appeals" description="Human review of automated blocks, removals and account restrictions (SAFE-04)." />
      <FilterTabs active={status} tabs={[{ value: "open", label: "Open", href: "/admin/appeals" }, { value: "resolved", label: "Resolved", href: "/admin/appeals?status=resolved" }]} />
      {(appeals ?? []).length === 0 ? (
        <EmptyState title="No appeals here" description="When a student requests a review it appears in this list." />
      ) : (
        <ul className="grid gap-3" role="list">
          {(appeals ?? []).map((a) => (
            <li key={a.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono font-medium">{a.case_number}</p>
                <Badge variant={a.status === "open" ? "info" : a.status === "overturned" ? "success" : "secondary"}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                From {a.user ? <Link className="text-primary hover:underline" href={`/admin/users/${a.user.id}`}>{a.user.display_name}</Link> : "deleted user"} ·{" "}
                {formatDateTime(a.created_at)}
              </p>
              <p className="mt-2 text-sm">
                {a.listings ? (
                  <>Listing: <Link className="text-primary hover:underline" href={`/admin/listings/${a.listings.id}`}>{a.listings.title}</Link> <ModerationBadge status={a.listings.moderation_status} /> <span className="text-xs text-muted-foreground">via {a.listings.moderation_source}</span></>
                ) : a.account_restrictions ? (
                  <>Restriction: {a.account_restrictions.kind} ({a.account_restrictions.reason})</>
                ) : (
                  "Target no longer exists"
                )}
              </p>
              <blockquote className="mt-3 rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-wrap">{a.message}</blockquote>
              {a.resolution_summary && <p className="mt-3 text-sm"><strong>Resolution:</strong> {a.resolution_summary}</p>}
              {a.status === "open" && hasPermission(actor, "appeals.resolve") && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <AdminActionDialog
                    op="appeal.resolve"
                    fields={{ appealId: a.id, decision: "overturned" }}
                    label="Overturn (restore)"
                    variant="default"
                    title="Overturn the decision?"
                    description={a.listing_id ? "The listing is restored (and published if it was blocked)." : "The restriction is lifted."}
                    reasonLabel="Summary for the student"
                  />
                  <AdminActionDialog op="appeal.resolve" fields={{ appealId: a.id, decision: "upheld" }} label="Uphold decision" title="Uphold the decision?" reasonLabel="Explain the decision to the student" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
