import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BadgeCheck, Banknote, MessageCircle, MessagesSquare, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { ProductGrid, ProductGridSkeleton } from "@/components/marketplace/product-card";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { getAccessInfo } from "@/features/account/queries";
import { searchListings } from "@/features/listings/queries";
import { parseSearchParams } from "@/features/search/params";

const STEPS = [
  { icon: BadgeCheck, title: "Join with your university email", body: "Only students with a verified university email can browse, list and chat." },
  { icon: Zap, title: "List in under three minutes", body: "Add a title, price, condition and a few photos. Permitted items publish right away." },
  { icon: MessageCircle, title: "Chat, then meet on campus", body: "Agree the details in chat, meet somewhere busy and inspect the item before paying." },
  { icon: MessagesSquare, title: "Join the conversation", body: "Ask seniors for advice, find lost things and talk about anything campus in Community threads." },
];

const PROMISES = [
  { icon: Banknote, text: "No fees, no commissions. Payment happens in person, never through the site." },
  { icon: ShieldCheck, text: "Automated checks stop prohibited items, and you can report anything suspicious." },
  { icon: Sparkles, text: "Your phone number stays private unless you choose to share it." },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b bg-gradient-to-b from-secondary/60 to-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <Suspense fallback={<p className="mb-3 h-5 w-48 animate-pulse rounded bg-muted" />}>
              <AccessEyebrow />
            </Suspense>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Pass it on to someone <span className="text-primary">on your campus.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">
              Textbooks, cycles, calculators, hostel essentials and more, from fellow GITAM students. Quick to list, easy
              to find and free to use.
            </p>
            <div className="mt-8">
              <Suspense fallback={<div className="h-11 w-64 animate-pulse rounded-lg bg-muted" />}>
                <HeroActions />
              </Suspense>
            </div>
          </div>
          <ul className="grid content-center gap-3" role="list">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-xs">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Suspense fallback={null}>
        <RecentListings />
      </Suspense>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <Icon className="size-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted-foreground">
          {appConfig.independenceNotice} Email verification confirms you have a GITAM student email, not your identity, so
          always meet safely.{" "}
          <Link href="/safety" className="font-medium text-primary underline-offset-4 hover:underline">Read the safety guide</Link>.
        </p>
      </section>
    </>
  );
}

async function AccessEyebrow() {
  const info = await getAccessInfo();
  if (!info) return <p className="mb-3 text-sm font-medium text-primary">Students only</p>;
  return (
    <p className="mb-3 text-sm font-medium text-primary">
      For students of {info.name}
      {info.domains.length > 0 && <span className="text-muted-foreground"> · sign up with @{info.domains[0]}</span>}
    </p>
  );
}

async function HeroActions() {
  const viewer = isSupabaseConfigured() ? await getViewer() : null;
  if (viewer) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/marketplace">Browse listings <ArrowRight aria-hidden /></Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/sell">Sell an item</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg">
        <Link href="/signup">Join with university email <ArrowRight aria-hidden /></Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}

async function RecentListings() {
  const viewer = isSupabaseConfigured() ? await getViewer() : null;
  if (!viewer?.isVerified) return null;
  const { items } = await searchListings(parseSearchParams({}), 10);
  if (items.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6" aria-labelledby="recent">
      <div className="mb-4 flex items-end justify-between">
        <h2 id="recent" className="text-2xl font-semibold tracking-tight">Just listed</h2>
        <Link href="/marketplace" className="text-sm font-medium text-primary hover:underline">See everything</Link>
      </div>
      <Suspense fallback={<ProductGridSkeleton count={5} />}>
        <ProductGrid listings={items} priorityCount={5} />
      </Suspense>
    </section>
  );
}
