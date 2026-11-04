import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Banknote,
  Bike,
  BookOpen,
  Calculator,
  ChevronRight,
  Gift,
  Handshake,
  LampDesk,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { CategoryIcon } from "@/components/marketplace/category-icon";
import { ProductGrid, ProductGridSkeleton } from "@/components/marketplace/product-card";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";
import { getAccessInfo } from "@/features/account/queries";
import { getCategories, getSavedListingIds, searchListings } from "@/features/listings/queries";
import { parseSearchParams } from "@/features/search/params";

const STEPS = [
  { icon: BadgeCheck, title: "Join with your university email", body: "Only students with a verified university email can browse, list and chat." },
  { icon: Zap, title: "List in under three minutes", body: "Add a title, price, condition and a few photos. Permitted items publish right away." },
  { icon: MessageCircle, title: "Chat, then meet on campus", body: "Agree the details in chat, meet somewhere busy and inspect the item before paying." },
  { icon: MessagesSquare, title: "Join the conversation", body: "Ask seniors for advice, find lost things and talk about anything campus in Community threads." },
];

const PROMISES = [
  { icon: Banknote, title: "Free to use", text: "No fees, no commissions. Payment happens in person, never through the site." },
  { icon: ShieldCheck, title: "Checked listings", text: "Automated checks stop prohibited items, and you can report anything suspicious." },
  { icon: Sparkles, title: "Private by default", text: "Your phone number stays private unless you choose to share it." },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b bg-muted/40 pattern-dots">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-10">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
            <div className="relative grid overflow-hidden rounded-3xl bg-secondary md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="relative z-10 p-6 sm:p-10">
                <Suspense fallback={<p className="mb-4 h-7 w-48 animate-pulse rounded-full bg-card/70" />}>
                  <AccessEyebrow />
                </Suspense>
                <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl">
                  Pass it on to someone <span className="text-primary">on your campus.</span>
                </h1>
                <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
                  Textbooks, cycles, calculators, hostel essentials and more, from fellow GITAM students. Quick to list, easy to
                  find and free to use.
                </p>
                <div className="mt-7">
                  <Suspense fallback={<div className="h-11 w-64 animate-pulse rounded-lg bg-card/70" />}>
                    <HeroActions />
                  </Suspense>
                </div>
              </div>
              <HeroArt />
            </div>

            <FreeItemsPromo />
          </div>

          <ul className="mt-4 grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-3 lg:mt-5" role="list">
            {PROMISES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3.5 border-b p-4 last:border-b-0 sm:border-r sm:border-b-0 sm:p-5 sm:last:border-r-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Suspense fallback={null}>
        <CategoryTiles />
      </Suspense>

      <Suspense fallback={null}>
        <RecentListings />
      </Suspense>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16" aria-labelledby="how-it-works">
        <SectionHeading id="how-it-works" eyebrow="How it works" title="From listing to handshake in four steps" />
        <ol className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          <span className="absolute top-11 right-[12%] left-[12%] hidden border-t-2 border-dashed border-primary/25 lg:block" aria-hidden />
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="relative rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground ring-4 ring-card">
                  {index + 1}
                </span>
                <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
              </div>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-4 sm:px-6" aria-label="More from Gitam Marketplace">
        <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
          <PromoBanner
            tone="primary"
            icon={MessagesSquare}
            eyebrow="Community"
            title="Ask seniors, find lost things"
            href="/community"
            cta="Visit Community"
          />
          <PromoBanner tone="secondary" icon={ShieldCheck} eyebrow="Safe meetups" title="Meet somewhere busy, inspect first" href="/safety" cta="Read the safety guide" />
          <PromoBanner tone="amber" icon={Ban} eyebrow="Marketplace rules" title="Know what can't be listed" href="/policies/prohibited-items" cta="Prohibited items" />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          {appConfig.independenceNotice} Email verification confirms you have a GITAM student email, not your identity, so always
          meet safely.
        </p>
      </section>
    </>
  );
}

function SectionHeading({ id, eyebrow, title, action }: { id: string; eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div>
        {eyebrow && <p className="mb-1.5 text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>}
        <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline underline-offset-4">
      {children}
      <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** Decorative composition of example items for the hero banner (hidden from assistive tech). */
function HeroArt() {
  const items: { icon: LucideIcon; label: string; price: string; className: string }[] = [
    { icon: BookOpen, label: "Textbooks", price: "₹250", className: "top-[14%] left-[8%] -rotate-6" },
    { icon: Bike, label: "Cycles", price: "₹3,500", className: "top-[8%] right-[6%] rotate-3" },
    { icon: Calculator, label: "Calculators", price: "₹600", className: "bottom-[14%] left-[14%] rotate-2" },
    { icon: LampDesk, label: "Desk lamp", price: "Free", className: "right-[10%] bottom-[20%] -rotate-3" },
  ];
  return (
    <div className="relative hidden min-h-72 md:block" aria-hidden>
      <div className="absolute top-1/2 left-1/2 size-[19rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10" />
      <div className="absolute top-1/2 left-1/2 size-[13rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10" />
      <div className="absolute top-1/2 left-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/25">
        <Handshake className="size-10" strokeWidth={1.75} />
      </div>
      {items.map(({ icon: Icon, label, price, className }) => (
        <div key={label} className={cn("absolute flex items-center gap-2.5 rounded-2xl bg-card p-2.5 pr-4 shadow-lg shadow-foreground/5 ring-1 ring-border/70", className)}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
            <Icon className="size-5" />
          </span>
          <span>
            <span className="block text-xs font-medium text-muted-foreground">{label}</span>
            <span className={cn("block text-sm font-semibold", price === "Free" ? "text-success" : "text-foreground")}>{price}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const FREE_TAGS = ["Notes", "Lab coats", "Buckets", "Drafters", "Kettles", "Novels"];

function FreeItemsPromo() {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl bg-warning p-6 text-warning-foreground sm:p-8">
      <div className="pointer-events-none absolute -right-12 -bottom-12 size-44 rounded-full bg-chart-3/35" aria-hidden />
      <div className="pointer-events-none absolute right-5 bottom-5 flex size-16 rotate-6 items-center justify-center rounded-2xl bg-card/70 shadow-sm" aria-hidden>
        <Gift className="size-8 text-warning-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Pass it on, for free</p>
      <p className="mt-3 text-3xl leading-tight font-semibold tracking-tight">
        Free items,
        <br />
        zero fees
      </p>
      <p className="mt-3 text-sm leading-relaxed opacity-90">
        Seniors give away notes, buckets and lab coats every semester. Grab them before someone else does.
      </p>
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Often given away">
        {FREE_TAGS.map((tag) => (
          <li key={tag} className="rounded-full bg-card/60 px-3 py-1 text-xs font-medium ring-1 ring-warning-foreground/10">{tag}</li>
        ))}
      </ul>
      <div className="mt-6 pr-20 lg:mt-auto lg:pt-6">
        <Button asChild className="bg-card text-foreground shadow-sm hover:bg-card/85">
          <Link href="/marketplace?free=1">
            Browse free items <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

const BANNER_TONES = {
  primary: { box: "bg-primary text-primary-foreground pattern-dots-light", icon: "bg-primary-foreground/15 text-primary-foreground", eyebrow: "opacity-80", button: "bg-card text-foreground hover:bg-card/85" },
  secondary: { box: "bg-secondary text-secondary-foreground pattern-dots", icon: "bg-card text-primary", eyebrow: "text-primary", button: "" },
  amber: { box: "bg-warning text-warning-foreground", icon: "bg-card/70 text-warning-foreground", eyebrow: "opacity-80", button: "bg-card text-foreground hover:bg-card/85" },
} as const;

function PromoBanner({
  tone,
  icon: Icon,
  eyebrow,
  title,
  href,
  cta,
}: {
  tone: keyof typeof BANNER_TONES;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  href: string;
  cta: string;
}) {
  const t = BANNER_TONES[tone];
  return (
    <div className={cn("relative flex min-h-52 flex-col overflow-hidden rounded-3xl p-6 sm:p-7", t.box)}>
      <span className={cn("absolute top-6 right-6 flex size-14 rotate-6 items-center justify-center rounded-2xl", t.icon)} aria-hidden>
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
      <p className={cn("text-xs font-semibold tracking-wide uppercase", t.eyebrow)}>{eyebrow}</p>
      <h3 className="mt-2 max-w-[14rem] text-xl leading-snug font-semibold tracking-tight">{title}</h3>
      <div className="mt-auto pt-6">
        <Button asChild size="sm" className={cn("h-9 px-3.5", t.button)}>
          <Link href={href}>
            {cta} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </div>
  );
}

async function AccessEyebrow() {
  const info = await getAccessInfo();
  const pill = "mb-4 inline-flex max-w-full items-start gap-1.5 rounded-2xl bg-card px-3 py-1 text-xs font-medium text-primary shadow-xs ring-1 ring-border/70 sm:text-sm";
  if (!info) {
    return (
      <p className={pill}>
        <BadgeCheck className="size-4 shrink-0" aria-hidden /> Students only
      </p>
    );
  }
  return (
    <p className={pill}>
      <BadgeCheck className="mt-0.5 size-4 shrink-0 sm:mt-[3px]" aria-hidden />
      <span>
        For students of {info.name}
        {info.domains.length > 0 && <span className="text-muted-foreground"> · sign up with @{info.domains[0]}</span>}
      </span>
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
        <Button asChild size="lg" variant="outline" className="bg-card">
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
      <Button asChild size="lg" variant="outline" className="bg-card">
        <Link href="/login">Sign in</Link>
      </Button>
    </div>
  );
}

/** Category tiles. Categories are public, so signed-out visitors see them too (links lead to sign-in). */
async function CategoryTiles() {
  if (!isSupabaseConfigured()) return null;
  const categories = await getCategories();
  if (categories.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6 md:pt-16" aria-labelledby="browse-categories">
      <SectionHeading id="browse-categories" title="Browse by category" action={<SectionLink href="/marketplace">All listings</SectionLink>} />
      <ul className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5 sm:gap-4 xl:grid-cols-9" role="list">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/categories/${c.slug}`}
              className="group flex h-full flex-col items-center gap-3 rounded-2xl border border-transparent bg-muted/60 px-2 py-5 text-center transition-all outline-none hover:-translate-y-0.5 hover:border-border hover:bg-card hover:shadow-lg hover:shadow-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="relative flex size-14 items-center justify-center">
                <span className="absolute right-0 bottom-0 size-8 rounded-full bg-chart-3/40 transition-transform group-hover:scale-110" aria-hidden />
                <CategoryIcon icon={c.icon} className="relative size-8 text-primary" />
              </span>
              <span className="line-clamp-3 text-xs leading-snug font-medium sm:text-sm">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function RecentListings() {
  const viewer = isSupabaseConfigured() ? await getViewer() : null;
  if (!viewer?.isVerified) return null;
  const { items } = await searchListings(parseSearchParams({}), 10);
  if (items.length === 0) return null;
  const savedIds = await getSavedListingIds(viewer.id, items.map((i) => i.id));
  return (
    <section className="mt-12 border-y bg-muted/40 md:mt-16" aria-labelledby="recent">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <SectionHeading id="recent" eyebrow="Fresh on campus" title="Just listed" action={<SectionLink href="/marketplace">See everything</SectionLink>} />
        <div className="mt-6">
          <Suspense fallback={<ProductGridSkeleton count={5} />}>
            <ProductGrid listings={items} priorityCount={5} savedIds={savedIds} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
