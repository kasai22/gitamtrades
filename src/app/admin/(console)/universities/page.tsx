import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { features } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { AdminActionDialog, AdminInlineAction } from "@/features/admin/components/admin-action";
import { DetailList, Muted } from "@/features/admin/components/admin-ui";
import { RankedBars } from "@/features/admin/components/charts";
import { DataTable, Metric, PageHeading, Panel } from "@/features/admin/components/data-table";
import { getUniversityConfig } from "@/features/admin/services/config";
import { getPlatformSettings } from "@/features/admin/settings";

export const metadata: Metadata = { title: "University" };

const inputClass = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm";

export default async function AdminUniversitiesPage() {
  const actor = await requirePermission("config.view", "/admin/universities");
  const [data, settings] = await Promise.all([getUniversityConfig(actor), getPlatformSettings()]);
  const canManage = hasPermission(actor, "university.manage");
  const v = data.verification;
  const allowed = new Set(data.universities.flatMap((u) => (u.university_domains ?? []).filter((d) => d.is_active).map((d) => d.domain)));

  return (
    <>
      <PageHeading
        title="University & verification"
        description="Single-university pilot. The schema supports more universities; adding one is a configuration and policy decision, not a code change."
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Accounts" value={v.total} />
        <Metric label="Verified" value={v.verified} hint={v.total ? `${Math.round(((v.verified ?? 0) / v.total) * 100)}%` : undefined} />
        <Metric label="Unverified" value={v.unverified} />
        <Metric label="Unverified > 72h" value={v.unverifiedOlderThan72h} tone="warning" hint="Likely abandoned or undeliverable" />
        <Metric label="Registered (7 days)" value={v.registeredLast7Days} hint={v.verifiedLast7Days !== null ? `${v.verifiedLast7Days} verified` : undefined} />
        <Metric label="Registered (last hour)" value={v.registeredLastHour} tone={v.registeredLastHour && v.registeredLastHour >= 20 ? "danger" : undefined} hint="Spikes can indicate scripted sign-ups" />
      </div>

      <Panel title="Verification method" className="mb-4">
        <DetailList
          items={[
            ["Method", "Confirmation of a university-domain email address (link or 6-digit code) through Supabase Auth."],
            ["What it proves", "The student controls a mailbox on an approved domain. It doesn't prove current enrolment or legal identity, and the product never claims it does."],
            ["Generic providers", "Gmail, Outlook, Yahoo and similar are always rejected, independent of this list."],
            ["New sign-ups", settings.signupsPaused ? <Badge key="p" variant="destructive">Paused in Settings</Badge> : <Badge key="o" variant="success">Open</Badge>],
            ["Verification failures", "Rejected-domain attempts are refused before an account exists, so they aren't stored. Undelivered or ignored confirmations show up as unverified accounts above."],
          ]}
        />
      </Panel>

      {data.universities.map((u) => (
        <div key={u.id} className="mb-4 grid gap-4 xl:grid-cols-2">
          <Panel
            title={u.name}
            description={u.is_active ? "Active university" : "Inactive"}
            actions={
              canManage ? (
                <AdminActionDialog
                  op="university.update"
                  fields={{ universityId: u.id }}
                  label="Edit details"
                  title="Edit university details"
                  extra={
                    <div className="grid gap-3">
                      <div className="grid gap-1.5"><label htmlFor="u-name" className="text-sm font-medium">Name</label><input id="u-name" name="name" required minLength={2} maxLength={120} defaultValue={u.name} className={inputClass} /></div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5"><label htmlFor="u-short" className="text-sm font-medium">Short name</label><input id="u-short" name="shortName" maxLength={30} defaultValue={u.short_name ?? ""} className={inputClass} /></div>
                        <div className="grid gap-1.5"><label htmlFor="u-city" className="text-sm font-medium">City</label><input id="u-city" name="city" maxLength={80} defaultValue={u.city ?? ""} className={inputClass} /></div>
                      </div>
                    </div>
                  }
                  confirmLabel="Save"
                />
              ) : undefined
            }
          >
            <DetailList items={[["Slug", <code key="s">{u.slug}</code>], ["Short name", u.short_name ?? "—"], ["City", u.city ?? "—"], ["Since", formatDate(u.created_at)]]} />
          </Panel>

          <Panel
            title="Approved email domains"
            description="Only these domains can register. Disabling a domain blocks new sign-ups from it but doesn't affect existing accounts."
            actions={
              canManage ? (
                <AdminActionDialog
                  op="domain.add"
                  fields={{ universityId: u.id }}
                  label="Add domain"
                  title="Add an email domain"
                  description="Confirm with the university that this domain is issued only to eligible students."
                  extra={<div className="grid gap-1.5"><label htmlFor="domain" className="text-sm font-medium">Domain</label><input id="domain" name="domain" required placeholder="students.example.edu.in" className={inputClass} /></div>}
                  reasonLabel="Note (optional)"
                  reasonRequired={false}
                  confirmLabel="Add domain"
                />
              ) : undefined
            }
            bodyClassName="p-0"
          >
            <DataTable
              rows={u.university_domains ?? []}
              rowKey={(d) => d.id}
              empty="No domains: nobody can sign up."
              columns={[
                { key: "domain", header: "Domain", cell: (d) => <code>@{d.domain}</code> },
                { key: "note", header: "Note", cell: (d) => d.note ?? <Muted>—</Muted> },
                { key: "state", header: "Status", cell: (d) => (d.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Disabled</Badge>) },
                {
                  key: "action",
                  header: "",
                  cell: (d) =>
                    canManage ? (
                      <AdminActionDialog
                        op="domain.toggle"
                        fields={{ domainId: d.id, active: d.is_active ? "0" : "1" }}
                        label={d.is_active ? "Disable" : "Enable"}
                        variant={d.is_active ? "destructive" : "outline"}
                        title={d.is_active ? `Stop sign-ups from @${d.domain}?` : `Allow sign-ups from @${d.domain}?`}
                        description={d.is_active ? "Existing accounts keep working. The last active domain can't be disabled; pause sign-ups instead." : "Students with this domain will be able to register."}
                        reasonLabel="Reason (audit log)"
                      />
                    ) : null,
                },
              ]}
            />
          </Panel>

          {features.meetupAreas && (
            <Panel
              title="Meetup areas"
              description="General, public campus spots sellers can choose. Never personal locations."
              actions={
                canManage ? (
                  <AdminActionDialog
                    op="meetup.add"
                    fields={{ universityId: u.id }}
                    label="Add area"
                    title="Add a meetup area"
                    extra={<div className="grid gap-1.5"><label htmlFor="meetup-name" className="text-sm font-medium">Name</label><input id="meetup-name" name="name" required maxLength={80} className={inputClass} /></div>}
                    reasonLabel="Description (optional)"
                    reasonRequired={false}
                    confirmLabel="Add"
                  />
                ) : undefined
              }
              bodyClassName="p-0"
            >
              <DataTable
                rows={u.meetup_areas ?? []}
                rowKey={(m) => m.id}
                empty="No meetup areas."
                columns={[
                  { key: "name", header: "Area", cell: (m) => m.name },
                  { key: "desc", header: "Description", cell: (m) => m.description ?? "—" },
                  { key: "state", header: "", cell: (m) => (canManage ? <AdminInlineAction op="meetup.toggle" fields={{ areaId: m.id, active: m.is_active ? "0" : "1" }} label={m.is_active ? "Disable" : "Enable"} /> : m.is_active ? "Active" : "Disabled") },
                ]}
              />
            </Panel>
          )}
        </div>
      ))}

      <Panel title="Accounts by email domain" description="Aggregated counts only. A domain that's no longer approved still shows its existing accounts.">
        <RankedBars rows={v.byEmailDomain.map((d) => ({ label: `@${d.domain}`, value: d.count, note: allowed.has(d.domain) ? undefined : "not approved" }))} empty="No accounts yet." />
      </Panel>
    </>
  );
}
