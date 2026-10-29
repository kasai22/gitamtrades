import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS, todayInZone, type DateRange } from "../lib/date-range";

/** Date range filter: preset links plus a custom from/to GET form (works without JavaScript). */
export function RangePicker({ base, range }: { base: string; range: DateRange }) {
  const today = todayInZone();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <nav aria-label="Date range" className="flex gap-1">
        {RANGE_PRESETS.map((p) => (
          <Link
            key={p.value}
            href={`${base}?range=${p.value}`}
            aria-current={range.preset === p.value ? "true" : undefined}
            className={cn("inline-flex h-8 items-center rounded-md border px-2.5 text-sm hover:bg-muted", range.preset === p.value ? "border-primary bg-primary/8 font-medium" : "bg-card text-muted-foreground")}
          >
            {p.value === "365d" ? "12m" : p.value}
            <span className="sr-only"> ({p.label})</span>
          </Link>
        ))}
      </nav>
      <form action={base} method="get" className="flex items-end gap-1.5">
        <label className="sr-only" htmlFor="range-from">From</label>
        <input id="range-from" type="date" name="from" defaultValue={range.from} max={today} className="h-8 rounded-md border border-input bg-card px-2 text-sm" />
        <span className="pb-1.5 text-xs text-muted-foreground">to</span>
        <label className="sr-only" htmlFor="range-to">To</label>
        <input id="range-to" type="date" name="to" defaultValue={range.to} max={today} className="h-8 rounded-md border border-input bg-card px-2 text-sm" />
        <Button type="submit" size="sm" variant="outline">Apply</Button>
      </form>
    </div>
  );
}
