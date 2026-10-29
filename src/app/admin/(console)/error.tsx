"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title="This page couldn't load"
      description={`The data may be temporarily unavailable. Nothing was changed.${error.digest ? ` (Reference: ${error.digest})` : ""}`}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
