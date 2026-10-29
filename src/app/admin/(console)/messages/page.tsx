import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { formatDateTime } from "@/lib/format";
import { EntityLink, Muted } from "@/features/admin/components/admin-ui";
import { DataTable, FilterBar, PageHeading, SearchField, TablePagination, UnavailableNotice } from "@/features/admin/components/data-table";
import { hrefWith, parseListParams } from "@/features/admin/lib/list-params";
import { searchConversations, type ConversationRow } from "@/features/admin/services/conversations";

export const metadata: Metadata = { title: "Conversations" };

/** Restricted investigation of reported conversations. Search shows metadata only, never message text. */
export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const actor = await requirePermission("messages.investigate", "/admin/messages");
  const raw = await searchParams;
  const list = parseListParams(raw, { sorts: ["last_message_at"] as const, defaultSort: "last_message_at" });
  const current = { q: list.q, pageSize: list.pageSize === 25 ? undefined : list.pageSize };
  let result: { rows: ConversationRow[]; total: number } | null = null;
  try {
    result = await searchConversations(actor, list.q, { limit: list.pageSize, offset: list.offset });
  } catch {
    result = null;
  }

  return (
    <>
      <PageHeading
        title="Conversations"
        description="Find a conversation by report case number (R-000123), conversation ID or a participant's user ID. Messages stay private: reading them needs a documented reason and is recorded in the audit log."
      />
      <FilterBar action="/admin/messages" keep={{ pageSize: current.pageSize }} resetHref="/admin/messages">
        <SearchField label="Case number, conversation ID or user ID" defaultValue={list.q} placeholder="R-000123 or a UUID" />
      </FilterBar>
      {!list.q ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>There is no browsable list of conversations. Start from a report, or search with an identifier you already have for a documented investigation.</p>
        </div>
      ) : !result ? (
        <UnavailableNotice what="Conversations" />
      ) : (
        <>
          <DataTable
            caption="Matching conversations"
            rows={result.rows}
            rowKey={(c) => c.id}
            empty="No conversation matches that identifier."
            columns={[
              { key: "listing", header: "Listing", cell: (c) => <EntityLink href={`/admin/messages/${c.id}`} className="line-clamp-1">{c.listingTitle || "Listing"}</EntityLink> },
              { key: "buyer", header: "Buyer", cell: (c) => c.buyerName },
              { key: "seller", header: "Seller", cell: (c) => c.sellerName },
              { key: "messages", header: "Messages", align: "right", cell: (c) => c.messageCount },
              { key: "reports", header: "Message reports", align: "right", cell: (c) => (c.reportCount ? <span className="font-medium text-destructive">{c.reportCount}</span> : 0) },
              { key: "state", header: "State", cell: (c) => (c.restrictedAt ? <Badge variant="destructive">Restricted</Badge> : <Muted>Open</Muted>) },
              { key: "last", header: "Last message", cell: (c) => (c.lastMessageAt ? formatDateTime(c.lastMessageAt) : "—"), className: "whitespace-nowrap" },
            ]}
          />
          <TablePagination page={list.page} pageSize={list.pageSize} total={result.total} rowCount={result.rows.length} hrefFor={(o) => hrefWith("/admin/messages", current, o)} />
        </>
      )}
    </>
  );
}
