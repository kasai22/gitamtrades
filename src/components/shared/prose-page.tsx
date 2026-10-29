import Link from "next/link";
import type { ReactNode } from "react";
import { appConfig } from "@/lib/config";
import { PageContainer } from "./states";

const POLICY_LINKS = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/policies/prohibited-items", label: "Prohibited Items" },
  { href: "/grievance", label: "Grievance Redressal" },
  { href: "/safety", label: "Safety" },
];

/** Shared layout for policy and help pages. */
export function ProsePage({ title, intro, effective = true, children }: { title: string; intro?: ReactNode; effective?: boolean; children: ReactNode }) {
  return (
    <PageContainer size="md">
      <article className="grid gap-6">
        <header className="border-b pb-6">
          <p className="text-sm font-medium text-primary">{appConfig.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
          {effective && <p className="mt-2 text-sm text-muted-foreground">Effective {appConfig.policyEffectiveDate} · Version {appConfig.termsVersion}</p>}
          {intro && <div className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{intro}</div>}
        </header>
        <div className="grid gap-7 text-[15px] leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
        <nav aria-label="Policies" className="mt-4 border-t pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" role="list">
            {POLICY_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground hover:text-foreground">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </PageContainer>
  );
}
