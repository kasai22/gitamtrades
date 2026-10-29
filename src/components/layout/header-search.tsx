"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function SearchForm({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/marketplace");
  };

  return (
    <form role="search" onSubmit={submit} action="/search" className={cn("relative max-w-xl", className)}>
      <label htmlFor="site-search" className="sr-only">
        Search listings
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        id="site-search"
        name="q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search textbooks, cycles, calculators…"
        className="pl-9"
        autoComplete="off"
        maxLength={100}
        autoFocus={autoFocus}
      />
    </form>
  );
}

/** SearchBar: works without JavaScript (GET /search) and enhances to client navigation. */
export function HeaderSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  return (
    <Suspense fallback={<div className={cn("h-10 max-w-xl rounded-lg border bg-card", className)} />}>
      <SearchForm className={className} autoFocus={autoFocus} />
    </Suspense>
  );
}
