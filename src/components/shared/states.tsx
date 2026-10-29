import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, type LucideIcon, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = SearchX,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: { href: string; label: string } | ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && (
        <div className="mt-5">
          {action && typeof action === "object" && "href" in action ? (
            <Button asChild>
              <Link href={action.href}>{action.label}</Link>
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 size-8 text-destructive" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children, className, size = "lg" }: { children: ReactNode; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8",
        size === "sm" && "max-w-xl",
        size === "md" && "max-w-3xl",
        size === "lg" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const pages = new Set([1, page - 1, page, page + 1, pageCount].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page - 1)} rel="prev">Previous</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>Previous</Button>
      )}
      {sorted.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && sorted[i - 1] !== p - 1 && <span className="px-1 text-muted-foreground" aria-hidden>…</span>}
          <Button asChild variant={p === page ? "default" : "ghost"} size="sm">
            <Link href={hrefFor(p)} aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`}>{p}</Link>
          </Button>
        </span>
      ))}
      {page < pageCount ? (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page + 1)} rel="next">Next</Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>Next</Button>
      )}
    </nav>
  );
}
