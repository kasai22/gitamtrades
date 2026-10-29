"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SORT_OPTIONS, type SortOption } from "../params";

/** SortMenu: updates the `sort` URL parameter and resets pagination. */
export function SortMenu({ value, hasQuery }: { value: SortOption; hasQuery: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const options = SORT_OPTIONS.filter((o) => o.value !== "relevance" || hasQuery);

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const search = new URLSearchParams(params.toString());
        search.set("sort", next);
        search.delete("page");
        router.push(`${pathname}?${search.toString()}`);
      }}
    >
      <SelectTrigger className="w-48" aria-label="Sort listings">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Mobile drawer that hosts the (server-rendered) filter form. */
export function MobileFilters({ children, activeCount }: { children: ReactNode; activeCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="lg:hidden">
          <SlidersHorizontal aria-hidden /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow down listings by price, condition and availability.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6" onSubmit={() => setOpen(false)}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}
