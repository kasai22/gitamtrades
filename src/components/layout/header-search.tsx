"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchProps = { className?: string; autoFocus?: boolean; inputId?: string };

function SearchForm({ className, autoFocus, inputId = "site-search" }: SearchProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <form role="search" onSubmit={submit} action="/search" className={cn("relative w-full", className)}>
      <label htmlFor={inputId} className="sr-only">
        Search listings
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id={inputId}
        name="q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search textbooks, cycles, calculators…"
        className="h-11 w-full min-w-0 rounded-xl border border-input bg-muted/50 pr-24 pl-10 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        maxLength={100}
        autoFocus={autoFocus}
      />
      <button
        type="submit"
        className="absolute top-1 right-1 bottom-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Search
      </button>
    </form>
  );
}

/** SearchBar: works without JavaScript (GET /search) and enhances to client navigation. */
export function HeaderSearch(props: SearchProps) {
  return (
    <Suspense fallback={<div className={cn("h-11 w-full rounded-xl border bg-muted/50", props.className)} />}>
      <SearchForm {...props} />
    </Suspense>
  );
}
