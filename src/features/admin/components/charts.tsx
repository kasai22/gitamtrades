"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Admin charts. Deliberately single-series (one hue, the design system's --chart-1): comparisons are
 * small multiples, never stacked colours or a second axis. Every chart has a hover tooltip and a
 * table view, so identity and values never depend on colour or pointer use alone.
 */

type Point = { day: string; value: number };

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (d: string) => dayFormat.format(new Date(`${d}T00:00:00Z`));

/** Long ranges are binned by week so bars stay readable. */
function bin(points: Point[]): { label: string; value: number; key: string }[] {
  if (points.length <= 92) return points.map((p) => ({ key: p.day, label: fmt(p.day), value: p.value }));
  const out: { label: string; value: number; key: string }[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    out.push({ key: chunk[0].day, label: `${fmt(chunk[0].day)} – ${fmt(chunk[chunk.length - 1].day)}`, value: chunk.reduce((s, p) => s + p.value, 0) });
  }
  return out;
}

export function DailyBars({ title, points, unit = "", height = 120 }: { title: string; points: Point[]; unit?: string; height?: number }) {
  const bars = useMemo(() => bin(points), [points]);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...bars.map((b) => b.value));
  const total = points.reduce((s, p) => s + p.value, 0);
  const weekly = points.length > 92;
  const active = hover !== null ? bars[hover] : null;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toLocaleString("en-IN")} total{weekly ? " · weekly" : ""}
        </span>
      </figcaption>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between text-[10px] text-muted-foreground">
          <span className="sr-only">Maximum</span>
          <span className="tabular-nums">{max.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex items-end gap-px border-b border-border pt-4" style={{ height }} aria-hidden>
          {max === 0 ? (
            <p className="w-full self-center text-center text-xs text-muted-foreground">No activity in this range</p>
          ) : (
            bars.map((b, i) => (
              <div key={b.key} className="flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)}>
                <div
                  className={cn("w-full rounded-t-[3px] bg-chart-1 transition-opacity", hover !== null && hover !== i && "opacity-45")}
                  style={{ height: b.value === 0 ? 0 : `max(2px, ${(b.value / max) * 100}%)` }}
                />
              </div>
            ))
          )}
        </div>
        {active && (
          <div className="pointer-events-none absolute -top-1 right-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm" role="status">
            <span className="text-muted-foreground">{active.label}: </span>
            <span className="font-medium tabular-nums">{active.value.toLocaleString("en-IN")}{unit}</span>
          </div>
        )}
        {bars.length > 0 && (
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{bars[0].label.split(" – ")[0]}</span>
            <span>{bars[bars.length - 1].label.split(" – ").at(-1)}</span>
          </div>
        )}
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Table view</summary>
        <div className="mt-1 max-h-48 overflow-y-auto">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-0.5 font-normal">{weekly ? "Week" : "Day"}</th>
                <th className="py-0.5 text-right font-normal">Count</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-t border-border/60">
                  <td className="py-0.5">{b.label}</td>
                  <td className="py-0.5 text-right tabular-nums">{b.value.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Horizontal magnitude bars with direct value labels (category distribution, report reasons). */
export function RankedBars({ rows, empty = "No data in this range.", valueLabel }: { rows: { label: string; value: number; note?: string }[]; empty?: string; valueLabel?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul role="list" className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-2 text-sm" title={`${r.label}: ${r.value.toLocaleString("en-IN")}${valueLabel ? ` ${valueLabel}` : ""}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-3 rounded-r-[3px] bg-muted/60" aria-hidden>
            <span className="block h-full rounded-r-[3px] bg-chart-1" style={{ width: r.value === 0 ? 0 : `max(2px, ${(r.value / max) * 100}%)` }} />
          </span>
          <span className="text-right text-xs tabular-nums">
            {r.value.toLocaleString("en-IN")}
            {r.note && <span className="ml-1 text-muted-foreground">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
