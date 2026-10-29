"use client";

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { revealUserContact } from "../actions";

/** Shows a user's account email on demand. Each reveal is authorised and audited on the server. */
export function RevealContact({ userId }: { userId: string }) {
  const [contact, setContact] = useState<{ email: string | null; emailConfirmedAt: string | null; lastSignInAt: string | null } | null>(null);
  const [pending, start] = useTransition();
  if (contact) {
    return (
      <span className="grid gap-0.5">
        <span className="font-mono text-sm break-all">{contact.email ?? "—"}</span>
        <span className="text-xs text-muted-foreground">
          Confirmed {contact.emailConfirmedAt ? formatDateTime(contact.emailConfirmedAt) : "never"} · last sign-in {contact.lastSignInAt ? formatDateTime(contact.lastSignInAt) : "unknown"}
        </span>
      </span>
    );
  }
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await revealUserContact(userId);
          if (result.ok && result.data) setContact(result.data);
          else toast.error(result.ok ? "No account email found." : result.error);
        })
      }
    >
      <Eye aria-hidden /> Show email (audited)
    </Button>
  );
}
