import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/states";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { AdminDataTable } from "@/features/admin/components/admin-ui";

export const metadata: Metadata = { title: "Account deletion requests" };

export default async function AdminDeletionRequestsPage() {
  const actor = await requirePermission("deletions.view", "/admin/deletion-requests");
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("account_deletion_requests")
    .select("id, status, reason, created_at, processed_at, user:profiles!account_deletion_requests_user_id_fkey (id, display_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader
        title="Account deletion requests"
        description="Completing a request permanently deletes the Auth user, profile, listings, photos and their side of conversations. Check for open reports or legal holds first."
      />
      <AdminDataTable
        rows={requests ?? []}
        rowKey={(r) => r.id}
        empty="No requests."
        columns={[
          { key: "user", header: "User", cell: (r) => (r.user ? <Link className="text-primary hover:underline" href={`/admin/users/${r.user.id}`}>{r.user.display_name}</Link> : "Deleted") },
          { key: "reason", header: "Reason", cell: (r) => r.reason ?? "—" },
          { key: "when", header: "Requested", cell: (r) => formatDateTime(r.created_at) },
          { key: "status", header: "Status", cell: (r) => r.status },
          {
            key: "actions",
            header: "",
            cell: (r) =>
              r.status === "pending" && hasPermission(actor, "deletions.process") && r.user?.id !== actor.id ? (
                <span className="flex gap-2">
                  <AdminActionDialog op="deletion.process" fields={{ requestId: r.id, decision: "complete" }} label="Delete account" variant="destructive" title="Permanently delete this account?" description="The account, its listings and photos are deleted. Audit records are kept. This can't be undone." confirmLabel="Delete" />
                  <AdminActionDialog op="deletion.process" fields={{ requestId: r.id, decision: "cancel" }} label="Cancel" title="Cancel this request?" description="Use if the user withdrew the request or a legal hold applies. Their removed listings stay removed." />
                </span>
              ) : null,
          },
        ]}
      />
    </>
  );
}
