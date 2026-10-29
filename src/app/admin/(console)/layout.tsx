import { cookies } from "next/headers";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/admin";
import { appConfig } from "@/lib/config";
import { AdminShell, SIDEBAR_COOKIE } from "@/features/admin/components/shell/admin-shell";
import { navFor } from "@/features/admin/components/shell/nav";
import AdminLoading from "../loading";

/**
 * Console chrome. requireAdmin() here decides only whether the shell renders (non-staff get a 404,
 * stale sessions go to /admin/login). Layouts don't re-run on client navigation, so every page and
 * action authorizes again.
 */
export default function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <ConsoleShell>{children}</ConsoleShell>
    </Suspense>
  );
}

async function ConsoleShell({ children }: { children: React.ReactNode }) {
  const actor = await requireAdmin();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";
  return (
    <AdminShell nav={navFor(actor.permissions)} user={{ name: actor.displayName, roles: actor.roles }} initialCollapsed={collapsed} appName={appConfig.name}>
      {children}
    </AdminShell>
  );
}
