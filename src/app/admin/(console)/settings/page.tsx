import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { appConfig, features } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { AdminActionDialog } from "@/features/admin/components/admin-action";
import { DetailList, Muted } from "@/features/admin/components/admin-ui";
import { PageHeading, Panel, UnavailableNotice } from "@/features/admin/components/data-table";
import { getSettings } from "@/features/admin/services/config";
import { SETTING_DEFINITIONS, SETTING_KEYS } from "@/features/admin/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const actor = await requirePermission("config.view", "/admin/settings");
  const { rows, effective } = await getSettings(actor);
  const canManage = hasPermission(actor, "settings.manage");

  return (
    <>
      <PageHeading
        title="Platform settings"
        description={canManage ? "Emergency switches and console security. Each switch is enforced on the server; changes are recorded in the audit log." : "Read-only: only Super Admins can change settings."}
      />
      {!effective.loaded && <div className="mb-4"><UnavailableNotice what="Platform settings" /></div>}
      <div className="grid gap-3">
        {SETTING_KEYS.map((key) => {
          const def = SETTING_DEFINITIONS[key];
          const row = rows.find((r) => r.key === key);
          const value = row?.value;
          const isBool = key !== "admin_session_max_hours";
          return (
            <Panel
              key={key}
              title={def.label}
              description={def.description}
              actions={
                canManage && row ? (
                  isBool ? (
                    <AdminActionDialog
                      op="setting.update"
                      fields={{ key, value: value === true ? "false" : "true" }}
                      label={value === true ? "Turn off" : "Turn on"}
                      variant={value === true ? "default" : "destructive"}
                      title={`${value === true ? "Turn off" : "Turn on"}: ${def.label}?`}
                      description={def.description}
                      reasonLabel="Reason (audit log)"
                    />
                  ) : (
                    <AdminActionDialog
                      op="setting.update"
                      fields={{ key }}
                      label="Change"
                      title={def.label}
                      description={def.description}
                      extra={
                        <div className="grid gap-1.5">
                          <label htmlFor="session-hours" className="text-sm font-medium">Hours</label>
                          <select id="session-hours" name="value" defaultValue={String(value ?? 12)} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
                            {[1, 2, 4, 8, 12, 24].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
                          </select>
                        </div>
                      }
                      reasonLabel="Reason (audit log)"
                    />
                  )
                ) : undefined
              }
            >
              <DetailList
                items={[
                  ["Current value", isBool ? (value === true ? <Badge key="on" variant="destructive">On</Badge> : <Badge key="off" variant="success">Off</Badge>) : `${String(value ?? "—")} hours`],
                  ["Enforced in", <code key="e" className="text-xs">{def.enforcedIn}</code>],
                  ["Last changed", row?.updated_by ? `${formatDateTime(row.updated_at)} by ${row.editor?.display_name ?? "former staff"}` : <Muted key="d">Default</Muted>],
                ]}
              />
            </Panel>
          );
        })}
        <Panel title="Deploy-time configuration" description="Set through environment variables; shown here for reference.">
          <DetailList
            items={[
              ["Product name", appConfig.name],
              ["Terms version", appConfig.termsVersion],
              ["Grievance officer", `${appConfig.grievance.name} · ${appConfig.grievance.email}`],
              ["Meetup area picker", features.meetupAreas ? "Enabled" : "Disabled (sellers arrange in chat)"],
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
