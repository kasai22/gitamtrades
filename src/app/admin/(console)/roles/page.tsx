import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { ADMIN_ROLES, PERMISSION_LABELS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { EntityLink, Muted, RoleBadge } from "@/features/admin/components/admin-ui";
import { DataTable, PageHeading, Panel } from "@/features/admin/components/data-table";
import { listStaff } from "@/features/admin/services/roles";

export const metadata: Metadata = { title: "Roles & access" };

const inputClass = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";

/** Super Admin only. Roles live in user_roles, which no client can write; changes go through admin_set_role(). */
export default async function AdminRolesPage() {
  const actor = await requirePermission("roles.manage", "/admin/roles");
  const staff = await listStaff(actor);

  return (
    <>
      <PageHeading
        title="Roles & access"
        description="Grant the narrowest role that fits. You can't change your own roles, and the last active Super Admin can't be removed."
        actions={
          <AdminActionDialog
            op="user.role"
            fields={{ grant: "1" }}
            label="Grant a role"
            variant="default"
            title="Grant an admin role"
            description="The account must have a verified university email and no suspension. Find the user ID on the user's page."
            extra={
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><label htmlFor="grant-user" className="text-sm font-medium">User ID</label><input id="grant-user" name="userId" required pattern="[0-9a-fA-F-]{36}" className={`${inputClass} font-mono text-xs`} /></div>
                <div className="grid gap-1.5">
                  <label htmlFor="grant-role" className="text-sm font-medium">Role</label>
                  <select id="grant-role" name="role" defaultValue="moderator" className={inputClass}>
                    {ADMIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
              </div>
            }
            reasonLabel="Reason (audit log)"
            confirmLabel="Grant role"
          />
        }
      />

      <Panel title={`Staff (${staff.length})`} bodyClassName="p-0" className="mb-4">
        <DataTable
          rows={staff}
          rowKey={(s) => s.id}
          empty="No staff accounts."
          columns={[
            { key: "name", header: "Name", cell: (s) => <span className="flex flex-wrap items-center gap-1.5"><EntityLink href={`/admin/users/${s.id}`}>{s.name}</EntityLink>{s.id === actor.id && <Badge variant="info">You</Badge>}{s.suspended && <Badge variant="destructive">Suspended (no access)</Badge>}</span> },
            {
              key: "roles",
              header: "Roles",
              cell: (s) => (
                <span className="grid gap-1">
                  {s.roles.map((r) => (
                    <span key={r.role} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <RoleBadge role={r.role} />
                      <Muted>since {formatDate(r.grantedAt)}{r.grantedBy ? ` by ${r.grantedBy}` : ""}</Muted>
                      {s.id !== actor.id && (
                        <AdminActionDialog
                          op="user.role"
                          fields={{ userId: s.id, role: r.role, grant: "0" }}
                          label="Revoke"
                          size="sm"
                          variant="ghost"
                          title={`Revoke ${ROLE_LABELS[r.role]} from ${s.name}?`}
                          description="Access ends on their next request."
                          reasonLabel="Reason (audit log)"
                          confirmWord="REVOKE"
                          confirmLabel="Revoke role"
                        />
                      )}
                    </span>
                  ))}
                </span>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Permission matrix" description="Enforced on the server and again inside the database (admin_role_permissions). Hiding a page is never the only control." bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Permissions granted by each role</caption>
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="h-9 px-3 text-left font-medium">Permission</th>
                {ADMIN_ROLES.map((r) => <th key={r} scope="col" className="h-9 px-3 text-center font-medium" title={ROLE_DESCRIPTIONS[r]}>{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p} className="border-t">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{PERMISSION_LABELS[p]} <code className="ml-1 text-[11px] text-muted-foreground">{p}</code></th>
                  {ADMIN_ROLES.map((r) => (
                    <td key={r} className="px-3 py-1.5 text-center">
                      {ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-4 text-success" aria-label="Granted" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not granted" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
