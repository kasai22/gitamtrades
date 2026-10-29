"use client";

import { useEffect } from "react";
import { ErrorState, PageContainer } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <PageContainer size="md">
      <ErrorState
        title={offline ? "You're offline" : "Something went wrong"}
        description={
          offline
            ? "Check your connection and try again. Nothing you've already saved has been lost."
            : `We couldn't load this page. Try again in a moment.${error.digest ? ` (Reference: ${error.digest})` : ""}`
        }
        action={<Button onClick={reset}>Try again</Button>}
      />
    </PageContainer>
  );
}
