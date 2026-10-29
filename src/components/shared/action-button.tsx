"use client";

import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/errors";

type Props = Omit<ComponentProps<typeof Button>, "onClick"> & {
  action: () => Promise<ActionResult<unknown>>;
  successMessage?: string;
  /** When set, a confirmation dialog is shown first (ConfirmationDialog). */
  confirm?: { title: string; description: ReactNode; confirmLabel?: string; destructive?: boolean };
  children: ReactNode;
};

/** Runs a server action with pending state, toast feedback and a router refresh. */
export function ActionButton({ action, successMessage, confirm, children, ...buttonProps }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () =>
    startTransition(async () => {
      const result = await action();
      setOpen(false);
      if (result.ok) {
        toast.success(result.message ?? successMessage ?? "Done.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const button = (
    <Button {...buttonProps} disabled={pending || buttonProps.disabled} onClick={confirm ? undefined : run}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );

  if (!confirm) return button;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              run();
            }}
            disabled={pending}
            className={confirm.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirm.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
