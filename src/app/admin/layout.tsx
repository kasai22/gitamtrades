import type { Metadata } from "next";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s · Admin · ${appConfig.name}` },
  robots: { index: false, follow: false },
};

/** Static admin root: no session read here. /admin/login is public; the console group authorizes. */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-svh flex-1 flex-col">{children}</div>;
}
