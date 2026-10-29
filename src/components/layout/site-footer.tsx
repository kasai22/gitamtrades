import Link from "next/link";
import { appConfig } from "@/lib/config";

/** ADMIN-04: grievance/help entry points are on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-semibold">{appConfig.name}</p>
          <p className="mt-2 max-w-sm text-muted-foreground">
            The marketplace for verified GITAM students. Students arrange exchanges and payments themselves; we never process
            payments or guarantee items.
          </p>
          <p className="mt-2 max-w-sm text-xs text-muted-foreground">{appConfig.independenceNotice}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Questions or complaints: <a className="underline underline-offset-4 hover:text-foreground" href={`mailto:${appConfig.supportEmail}`}>{appConfig.supportEmail}</a>
          </p>
        </div>
        <nav aria-label="Help and policies">
          <p className="mb-2 font-medium">Help &amp; safety</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/community">Community</Link></li>
            <li><Link className="hover:text-foreground" href="/safety">Safe meetups</Link></li>
            <li><Link className="hover:text-foreground" href="/help">Help &amp; FAQ</Link></li>
            <li><Link className="hover:text-foreground" href="/grievance">Grievance redressal</Link></li>
            <li><Link className="hover:text-foreground" href="/account/cases">Reports &amp; appeals</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p className="mb-2 font-medium">Policies</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><Link className="hover:text-foreground" href="/policies/prohibited-items">Prohibited items</Link></li>
            <li><Link className="hover:text-foreground" href="/terms">Terms of use</Link></li>
            <li><Link className="hover:text-foreground" href="/privacy">Privacy notice</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          © 2026 {appConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
