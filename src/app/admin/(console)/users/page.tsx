import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { DataTable, FilterBar, PageHeading, SearchField, SelectField, TablePagination, UnavailableNotice } from "@/features/admin/components/data-table";
import { EntityLink, Muted, RoleBadge } from "@/features/admin/components/admin-ui";
import { hrefWith, parseListParams, pickEnum } from "@/features/admin/lib/list-params";
import { listUsers, USER_SORTS, USER_STATUSES, type UserListResult } from "@/features/admin/services/users";

export const metadata: Metadata = { title: "Users" };

const STATUS_LABELS: Record<(typeof USER_STATUSES)[number], string> = {
  all: "All accounts",
  verified: "Verified",
  unverified: "Unverified",
  sellers: "Sellers",
  restricted: "Any active restriction",
  suspended: "Suspended",
  staff: "Staff",
};
const RESTRICTION_LABELS: Record<string, string> = { suspension: "Suspended", listing_ban: "Listing ban", messaging_ban: "Messaging ban" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const actor = await requirePermission("users.view", "/admin/users");
  const raw = await searchParams;
  const list = parseListParams(raw, { sorts: USER_SORTS, defaultSort: "created_at" });
  const status = pickEnum(raw, "status", USER_STATUSES, "all");
  const current = { q: list.q, status: status === "all" ? undefined : status, sort: list.sort === "created_at" ? undefined : list.sort, dir: list.dir === "desc" ? undefined : list.dir, pageSize: list.pageSize === 25 ? undefined : list.pageSize };

  let result: UserListResult | null = null;
  try {
    result = await listUsers(actor, { ...list, status });
  } catch {
    result = null;
  }
  const canContact = hasPermission(actor, "users.view_contact");

  return (
    <>
      <PageHeading
        title="Users"
        description={canContact ? "Search by display name, user ID or an exact email address (email lookups are audited)." : "Search by display name or user ID."}
        actions={
          hasPermission(actor, "users.export") ? (
            <Button asChild size="sm" variant="outline">
              <a href={hrefWith("/api/admin/users", { q: list.q.includes("@") ? undefined : list.q, status }, { format: "csv" })}><Download aria-hidden /> Export CSV</a>
            </Button>
          ) : undefined
        }
      />
      <FilterBar action="/admin/users" keep={{ sort: current.sort, dir: current.dir, pageSize: current.pageSize }} resetHref="/admin/users">
        <SearchField label="Search" defaultValue={list.q} placeholder={canContact ? "Name, user ID or email" : "Name or user ID"} />
        <SelectField name="status" label="Status" value={status} options={USER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
      </FilterBar>
      {result?.notice && <p role="status" className="mb-3 text-sm text-muted-foreground">{result.notice}</p>}
      {!result ? (
        <UnavailableNotice what="The user directory" />
      ) : (
        <>
          <DataTable
            caption="Users"
            rows={result.rows}
            rowKey={(u) => u.id}
            sort={{ sort: list.sort, dir: list.dir, hrefFor: (sort, dir) => hrefWith("/admin/users", current, { sort, dir }) }}
            empty={list.q || status !== "all" ? "No users match these filters." : "No users yet."}
            columns={[
              {
                key: "name",
                header: "Name",
                sortKey: "display_name",
                cell: (u) => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <EntityLink href={`/admin/users/${u.id}`}>{u.displayName}</EntityLink>
                    {u.roles.map((r) => <RoleBadge key={r} role={r} />)}
                  </span>
                ),
              },
              { key: "university", header: "University", cell: (u) => <span className="text-xs">{u.universityName}</span> },
              { key: "verified", header: "Email", cell: (u) => (u.emailVerifiedAt ? <Badge variant="success">Verified</Badge> : <Badge variant="outline">Unverified</Badge>) },
              { key: "seller", header: "Seller", cell: (u) => (u.sellerEnabledAt ? "Yes" : <Muted>No</Muted>) },
              {
                key: "status",
                header: "Account status",
                cell: (u) =>
                  u.restrictionKinds.length ? (
                    <span className="flex flex-wrap gap-1">{u.restrictionKinds.map((k) => <Badge key={k} variant="destructive">{RESTRICTION_LABELS[k] ?? k}</Badge>)}</span>
                  ) : (
                    <Muted>Active</Muted>
                  ),
              },
              { key: "listings", header: "Listings", sortKey: "listings", align: "right", cell: (u) => u.listingCount },
              { key: "reports", header: "Open reports", sortKey: "reports", align: "right", cell: (u) => (u.openReportCount ? <span className="font-medium text-destructive">{u.openReportCount}</span> : 0) },
              { key: "joined", header: "Joined", sortKey: "created_at", cell: (u) => formatDate(u.createdAt), className: "whitespace-nowrap" },
            ]}
          />
          <TablePagination page={list.page} pageSize={list.pageSize} total={result.total} rowCount={result.rows.length} hrefFor={(o) => hrefWith("/admin/users", current, o)} />
        </>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Email verification proves the student controls a university-domain mailbox; it isn&apos;t proof of current enrolment. <Link href="/admin/universities" className="text-primary hover:underline">Verification settings</Link>
      </p>
    </>
  );
}
