import Link from "next/link";
import { ArrowRight, Banknote, BadgeCheck, Handshake, Mail } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/lib/config";

const COLUMNS = [
  {
    label: "Marketplace",
    links: [
      { href: "/marketplace", label: "Browse listings" },
      { href: "/marketplace?free=1", label: "Free items" },
      { href: "/sell", label: "Sell an item" },
      { href: "/account/favourites", label: "Saved items" },
      { href: "/community", label: "Community" },
    ],
  },
  {
    label: "Help & safety",
    links: [
      { href: "/safety", label: "Safe meetups" },
      { href: "/help", label: "Help & FAQ" },
      { href: "/grievance", label: "Grievance redressal" },
      { href: "/account/cases", label: "Reports & appeals" },
    ],
  },
  {
    label: "Policies",
    links: [
      { href: "/policies/prohibited-items", label: "Prohibited items" },
      { href: "/terms", label: "Terms of use" },
      { href: "/privacy", label: "Privacy notice" },
    ],
  },
];

const TRUST = [
  { icon: BadgeCheck, label: "University email verified" },
  { icon: Banknote, label: "No fees or commissions" },
  { icon: Handshake, label: "Pay in person, on campus" },
];

/** ADMIN-04: grievance/help entry points are on every page. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
        <div className="flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-lg font-semibold tracking-tight">Got something to pass on?</p>
            <p className="mt-1 text-sm text-muted-foreground">Listing takes under three minutes, and it&rsquo;s always free.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/sell">Sell an item <ArrowRight aria-hidden /></Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/safety">Safety guide</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div className="sm:col-span-2">
          <BrandLogo className="h-10" />
          <p className="mt-4 max-w-sm leading-relaxed text-muted-foreground">
            The marketplace for verified GITAM students. Students arrange exchanges and payments themselves; we never process
            payments or guarantee items.
          </p>
          <a
            className="mt-4 inline-flex items-center gap-2 rounded-lg font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
            href={`mailto:${appConfig.supportEmail}`}
          >
            <Mail className="size-4 text-primary" aria-hidden />
            {appConfig.supportEmail}
          </a>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.label} aria-label={column.label === "Policies" ? "Legal" : column.label}>
            <p className="mb-3 text-xs font-semibold tracking-wide text-foreground uppercase">{column.label}</p>
            <ul className="space-y-2 text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link className="transition-colors hover:text-primary" href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p>© 2026 {appConfig.name}. All rights reserved.</p>
            <p className="max-w-2xl">{appConfig.independenceNotice}</p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2" role="list">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4 text-primary" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
