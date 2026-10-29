"use client";

import { useState, useTransition } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { vote } from "../actions";

type Vote = -1 | 0 | 1;

/** Upvote / downvote with an optimistic score. Clicking the active arrow again removes the vote. */
export function VoteControl({
  target,
  id,
  score,
  myVote,
  orientation = "vertical",
  disabled = false,
}: {
  target: "post" | "comment";
  id: string;
  score: number;
  myVote: Vote;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState<Vote>(myVote);
  const [pending, startTransition] = useTransition();
  const displayed = score - myVote + current;

  const cast = (value: 1 | -1) => {
    const next: Vote = current === value ? 0 : value;
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await vote({ target, id, value: next });
      if (!result.ok) {
        setCurrent(previous);
        toast.error(result.error);
      }
    });
  };

  return (
    <div
      className={cn("flex items-center gap-0.5", orientation === "vertical" ? "flex-col" : "flex-row")}
      role="group"
      aria-label={`Vote. Score ${displayed}`}
    >
      <button
        type="button"
        onClick={() => cast(1)}
        disabled={disabled || pending}
        aria-pressed={current === 1}
        aria-label="Upvote"
        className={cn(
          "rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          current === 1 && "text-primary",
        )}
      >
        <ArrowBigUp className={cn("size-5", current === 1 && "fill-current")} aria-hidden />
      </button>
      <span className={cn("min-w-6 text-center text-sm font-semibold tabular-nums", current === 1 && "text-primary", current === -1 && "text-destructive")}>
        {displayed}
      </span>
      <button
        type="button"
        onClick={() => cast(-1)}
        disabled={disabled || pending}
        aria-pressed={current === -1}
        aria-label="Downvote"
        className={cn(
          "rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
          current === -1 && "text-destructive",
        )}
      >
        <ArrowBigDown className={cn("size-5", current === -1 && "fill-current")} aria-hidden />
      </button>
    </div>
  );
}
