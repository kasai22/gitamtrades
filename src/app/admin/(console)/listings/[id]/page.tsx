import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceDisplay } from "@/components/marketplace/badges";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { DetailList, EntityLink, ListingStateBadge, ModerationFlag, Muted, ReportStatusBadge, SeverityBadge } from "@/features/admin/components/admin-ui";
import { DataTable, Metric, PageHeading, Panel } from "@/features/admin/components/data-table";
import { UUID } from "@/features/admin/lib/list-params";
import { getListingDetail, type AdminListingState } from "@/features/admin/services/listings";
import { CONDITION_LABELS } from "@/features/listings/constants";
import { REPORT_REASON_LABELS } from "@/features/moderation/report-reasons";

export const metadata: Metadata = { title: "Listing" };

function adminState(status: string, moderation: string, expiresAt: string | null): AdminListingState {
  if (moderation === "removed" || status === "removed") return "removed";
  if (moderation === "blocked") return "blocked";
  if (moderation === "limited") return "quarantined";
  if (status === "draft") return "draft";
  if (status === "sold") return "sold";
  if (status === "expired" || (expiresAt && new Date(expiresAt).getTime() <= Date.now())) return "expired";
  if (status === "on_hold") return "reserved";
  return "live";
}

const STATE_EXPLANATION: Record<AdminListingState, string> = {
  live: "Visible to verified students at the university.",
  reserved: "The seller put this on hold. Hidden from default discovery; existing chats continue.",
  sold: "Marked sold by the seller. Viewable by link, not contactable.",
  expired: "Past its expiry date. The seller can renew it.",
  draft: "Not published yet.",
  quarantined: "Hidden from other students pending review (automated signal, report threshold or staff action). The seller sees an explanation.",
  blocked: "Automated checks blocked publication with a high-confidence policy match. The seller was told why and can edit or appeal.",
  removed: "Removed by the safety team or deleted by the seller.",
};

export default async function AdminListingPage({ params }: PageProps<"/admin/listings/[id]">) {
  const { id } = await params;
  const actor = await requirePermission("listings.view", `/admin/listings/${id}`);
  if (!UUID.test(id)) notFound();
  const detail = await getListingDetail(actor, id);
  if (!detail) notFound();
  const { listing } = detail;
  const state = adminState(listing.status, listing.moderation_status, listing.expires_at);
  const openReports = detail.reports.filter((r) => r.status === "open" || r.status === "in_review" || r.status === "escalated");
  const canModerate = hasPermission(actor, "listings.moderate");
  const sellerDeleted = listing.status === "removed" && listing.moderation_status !== "removed";

  return (
    <>
      <PageHeading
        title={listing.title}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <ListingStateBadge state={state} />
            {openReports.length > 0 && <ListingStateBadge state="flagged" />}
            <span>{STATE_EXPLANATION[state]}</span>
          </span>
        }
        actions={
          state === "live" || state === "reserved" || state === "sold" || state === "expired" ? (
            <Link href={`/listings/${listing.id}`} className="text-sm text-primary hover:underline">View as students see it</Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title="Details">
            <DetailList
              items={[
                ["Price", <PriceDisplay key="p" priceInr={listing.price_inr} size="sm" />],
                ["Category", listing.categories?.name ?? "—"],
                ["Condition", CONDITION_LABELS[listing.condition]],
                [
                  "Seller",
                  listing.seller ? (
                    <span key="s">
                      {hasPermission(actor, "users.view") ? <EntityLink href={`/admin/users/${listing.seller.id}`}>{listing.seller.display_name}</EntityLink> : listing.seller.display_name}
                      <span className="text-muted-foreground"> · member since {formatDate(listing.seller.created_at)} · {detail.stats.sellerListingCount} listings</span>
                    </span>
                  ) : "—",
                ],
                ["Description", <p key="d" className="whitespace-pre-line">{listing.description || <Muted>No description</Muted>}</p>],
                ...(listing.categories?.is_ticket
                  ? ([["Ticket", `${listing.ticket_event_name ?? "—"}${listing.ticket_event_date ? ` on ${formatDate(listing.ticket_event_date)}` : ""} · transfer confirmed: ${listing.ticket_transfer_confirmed ? "yes" : "no"}`]] as [string, string][])
                  : []),
                ["Created", formatDateTime(listing.created_at)],
                ["Published", listing.published_at ? formatDateTime(listing.published_at) : "—"],
                ["Expires", listing.expires_at ? formatDateTime(listing.expires_at) : "—"],
                ["Sold", listing.sold_at ? formatDateTime(listing.sold_at) : "—"],
                ["Schema state", <code key="st" className="text-xs">status={listing.status} · moderation={listing.moderation_status} via {listing.moderation_source ?? "—"} · {listing.moderation_rule_version ?? "no rule version"}</code>],
              ]}
            />
          </Panel>

          <Panel title={`Photos (${detail.images.length})`} description="QR codes are flagged at upload. Duplicate photos are matched by content hash.">
            {detail.images.length === 0 ? (
              <Muted>No photos.</Muted>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" role="list">
                {detail.images.map((image, index) => (
                  <li key={image.id} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                    {image.url ? (
                      <a href={image.url} target="_blank" rel="noreferrer" aria-label={`Open photo ${index + 1} at full size`}>
                        <Image src={image.url} alt={`Photo ${index + 1}`} fill unoptimized sizes="200px" className="object-cover" />
                      </a>
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-muted-foreground">Unavailable</span>
                    )}
                    {image.qr_detected && <Badge variant="warning" className="absolute top-1 left-1">QR</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Moderation reasons" description="What the seller currently sees.">
            {detail.reasons.length === 0 ? (
              <Muted>No active moderation reasons.</Muted>
            ) : (
              <ul className="grid gap-2" role="list">
                {detail.reasons.map((r, i) => (
                  <li key={`${r.code}-${i}`} className="rounded-lg border p-2.5 text-sm">
                    <code className="text-xs">{r.code}</code> <span className="text-xs text-muted-foreground">({r.severity ?? "—"}{r.field ? `, ${r.field}` : ""})</span>
                    <p className="mt-1">{r.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Moderation history" bodyClassName="p-0">
            <DataTable
              rows={detail.events}
              rowKey={(e) => e.id}
              empty="No moderation events."
              columns={[
                { key: "when", header: "When", cell: (e) => formatDateTime(e.created_at), className: "whitespace-nowrap" },
                { key: "action", header: "Action", cell: (e) => <code className="text-xs">{e.action}</code> },
                { key: "actor", header: "By", cell: (e) => e.actor?.display_name ?? e.source },
                { key: "codes", header: "Codes", cell: (e) => <ModerationFlag codes={e.reason_codes} /> },
                { key: "rule", header: "Rule", cell: (e) => <span className="text-xs">{e.rule_version ?? "—"}</span> },
                { key: "note", header: "Note", cell: (e) => <span className="line-clamp-2">{e.reason_text ?? "—"}</span> },
              ]}
            />
          </Panel>

          <Panel title="Reports" bodyClassName="p-0">
            <DataTable
              rows={detail.reports}
              rowKey={(r) => r.id}
              empty="No reports on this listing."
              columns={[
                { key: "case", header: "Case", cell: (r) => (hasPermission(actor, "reports.view") ? <EntityLink href={`/admin/reports/${r.id}`} className="font-mono">{r.case_number}</EntityLink> : r.case_number) },
                { key: "reason", header: "Reason", cell: (r) => REPORT_REASON_LABELS[r.reason] },
                { key: "severity", header: "Severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
                { key: "status", header: "Status", cell: (r) => <ReportStatusBadge status={r.status} /> },
                { key: "when", header: "Received", cell: (r) => formatDateTime(r.created_at), className: "whitespace-nowrap" },
              ]}
            />
          </Panel>
        </div>

        <aside className="grid content-start gap-4">
          <Panel title="Actions">
            {!canModerate ? (
              <p className="text-sm text-muted-foreground">Your role can view listings but not moderate them.</p>
            ) : sellerDeleted ? (
              <p className="text-sm text-muted-foreground">The seller deleted this listing. It can&apos;t be restored by staff.</p>
            ) : (
              <div className="grid gap-2">
                {(state === "quarantined" || state === "removed" || state === "blocked") && (
                  <AdminActionDialog
                    op="listing.moderate"
                    fields={{ listingId: listing.id, action: "restore" }}
                    label={state === "blocked" ? "Restore and publish" : "Restore"}
                    variant="default"
                    title="Restore this listing?"
                    description={state === "blocked" ? "It will be published immediately with a fresh expiry date." : "It becomes visible to students again and the moderation notice is cleared."}
                    reasonLabel="Reason (audit log)"
                  />
                )}
                {state !== "quarantined" && state !== "removed" && state !== "blocked" && (
                  <AdminActionDialog
                    op="listing.moderate"
                    fields={{ listingId: listing.id, action: "quarantine" }}
                    label="Quarantine (hide pending review)"
                    title="Quarantine this listing?"
                    description="It's hidden from other students while you investigate. The seller sees a review notice and can appeal. Nothing is deleted."
                    reasonLabel="Reason (audit log)"
                  />
                )}
                {state !== "removed" && (
                  <AdminActionDialog
                    op="listing.moderate"
                    fields={{ listingId: listing.id, action: "remove" }}
                    label="Remove listing"
                    variant="destructive"
                    title="Remove this listing?"
                    description={`The seller sees your reason and can request a review.${openReports.length ? ` ${openReports.length} open report(s) stay open; resolve them from the report page.` : ""}`}
                    reasonLabel="Reason shown to the seller"
                    confirmLabel="Remove"
                  />
                )}
              </div>
            )}
          </Panel>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Open reports" value={openReports.length} tone="danger" />
            <Metric label="Saves" value={detail.stats.favourites} />
            <Metric label="Chats" value={detail.stats.conversations} />
          </div>
          <Panel title="Duplicate signals">
            <DetailList
              className="sm:grid-cols-1"
              items={[
                [
                  "Same photo elsewhere",
                  detail.duplicates.imageMatches.length ? (
                    <span key="img" className="flex flex-wrap gap-1">{detail.duplicates.imageMatches.map((lid) => <EntityLink key={lid} href={`/admin/listings/${lid}`} className="text-xs">{lid.slice(0, 8)}</EntityLink>)}</span>
                  ) : "None",
                ],
                [
                  "Same title",
                  detail.duplicates.titleMatches.length ? (
                    <span key="t" className="grid gap-0.5">{detail.duplicates.titleMatches.map((l) => <EntityLink key={l.id} href={`/admin/listings/${l.id}`} className="text-xs">{l.status} · {l.moderation_status}{l.seller_id === listing.seller?.id ? " · same seller" : ""}</EntityLink>)}</span>
                  ) : "None",
                ],
              ]}
            />
          </Panel>
          <Panel title="Seller declarations">
            {detail.declarations.length === 0 ? (
              <Muted>None recorded.</Muted>
            ) : (
              <ul className="grid gap-1.5 text-xs" role="list">
                {detail.declarations.map((d) => (
                  <li key={d.id}>
                    v{d.policy_version} · {formatDateTime(d.declared_at)} · owns item: {d.owns_item ? "yes" : "no"} · complies: {d.complies_with_policy ? "yes" : "no"}
                    {d.ticket_transferable !== null && ` · transferable: ${d.ticket_transferable ? "yes" : "no"}`}
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
