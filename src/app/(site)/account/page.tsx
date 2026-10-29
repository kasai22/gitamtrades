import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, MailWarning } from "lucide-react";
import { VerificationIndicator } from "@/components/marketplace/badges";
import { FormMessage } from "@/components/shared/form";
import { PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Account" };

const RESTRICTION_COPY = {
  suspension: "Your account is suspended. You can't browse, list or message until this is lifted.",
  listing_ban: "You can't publish new listings right now.",
  messaging_ban: "You can't send messages or start new chats right now.",
} as const;

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const viewer = await requireUser("/account");
  const params = await searchParams;

  return (
    <>
      <PageHeader title={`Hi, ${viewer.displayName}`} description={viewer.universityName} />
      {params.password === "updated" && <FormMessage className="mb-4" message="Your password has been updated." />}

      {viewer.restrictions.map((restriction) => (
        <section key={restriction.id} role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="size-5" aria-hidden /> Account restriction
          </h2>
          <p className="mt-1 text-sm">{RESTRICTION_COPY[restriction.kind]}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Reason: {restriction.reason}
            {restriction.expiresAt ? ` · Until ${formatDate(restriction.expiresAt)}` : ""}
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={`/appeals/new?restriction=${restriction.id}`}>Request a review</Link>
          </Button>
        </section>
      ))}

      {!viewer.emailVerified && (
        <section className="mb-4 rounded-xl border border-warning-foreground/20 bg-warning p-4 text-warning-foreground">
          <h2 className="flex items-center gap-2 font-semibold"><MailWarning className="size-5" aria-hidden /> Verify your email</h2>
          <p className="mt-1 text-sm">You need to verify your university email before you can browse, message or sell.</p>
          <Button asChild size="sm" className="mt-3"><Link href="/verify-email">Verify now</Link></Button>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Your profile</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{viewer.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">University</dt><dd>{viewer.universityName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Status</dt><dd>{viewer.emailVerified ? <VerificationIndicator verified /> : "Not verified"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Member since</dt><dd>{formatDate(viewer.memberSince)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Verification confirms you have a university email. It doesn&apos;t verify identity, so always meet safely.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4"><Link href="/account/settings">Edit profile</Link></Button>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Selling</h2>
          {viewer.isSeller ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">Selling is on. Manage your listings, mark items sold and renew expiring ones.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm"><Link href="/sell">Sell an item</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href="/account/listings">My listings</Link></Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted-foreground">Turn on selling from the same account; there&apos;s no approval step.</p>
              <Button asChild size="sm" className="mt-4"><Link href="/sell">Start selling</Link></Button>
            </>
          )}
        </section>
      </div>
    </>
  );
}
