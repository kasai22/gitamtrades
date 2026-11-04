"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const FADE = "48px";

/**
 * Horizontal scroller without a visible scrollbar. Edges fade and arrow buttons appear only when
 * there is more to see in that direction. The current item (aria-current) is scrolled into view.
 * Arrows are a pointer convenience: keyboard users tab through the links, which scroll themselves.
 */
export function ScrollRail({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>("[aria-current='page']");
    if (current) {
      const offset = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, offset);
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  const scrollBy = (direction: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const mask = `linear-gradient(to right, ${edges.left ? "transparent" : "#000"} 0, #000 ${edges.left ? FADE : "0px"}, #000 calc(100% - ${edges.right ? FADE : "0px"}), ${edges.right ? "transparent" : "#000"} 100%)`;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        onScroll={update}
        className="-my-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
      <ArrowButton side="left" visible={edges.left} onClick={() => scrollBy(-1)} />
      <ArrowButton side="right" visible={edges.right} onClick={() => scrollBy(1)} />
    </div>
  );
}

function ArrowButton({ side, visible, onClick }: { side: "left" | "right"; visible: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-md transition-opacity hover:bg-muted sm:flex",
        side === "left" ? "left-0" : "right-0",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
