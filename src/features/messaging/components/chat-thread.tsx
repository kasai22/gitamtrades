"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { AlertCircle, Check, Loader2, MoreVertical, Phone, RotateCw, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportDialog } from "@/features/moderation/components/report-dialog";
import { blockUser, fetchMessagesSince, markConversationRead, sendMessage, shareContact, unblockUser } from "../actions";
import type { ChatMessage } from "../queries";

type LocalMessage = ChatMessage & { state: "sent" | "sending" | "failed" };
type Props = {
  conversationId: string;
  viewerId: string;
  otherId: string;
  otherName: string;
  initialMessages: ChatMessage[];
  canSend: boolean;
  blockedByMe: boolean;
  savedPhone: string | null;
};

const POLL_MS = 15_000;

function mergeMessages(current: LocalMessage[], incoming: ChatMessage[]): LocalMessage[] {
  const byClientId = new Map(current.map((m) => [m.clientId, m]));
  for (const message of incoming) byClientId.set(message.clientId, { ...message, state: "sent" });
  return [...byClientId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** ChatThread: persisted messaging with live updates and reliable, de-duplicated sends (CHAT-01). */
export function ChatThread({ conversationId, viewerId, otherId, otherName, initialMessages, canSend, blockedByMe, savedPhone }: Props) {
  const [messages, setMessages] = useState<LocalMessage[]>(() => initialMessages.map((m) => ({ ...m, state: "sent" })));
  const [draft, setDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef(initialMessages.at(-1)?.createdAt ?? new Date(0).toISOString());

  const ingest = useCallback(
    (incoming: ChatMessage[]) => {
      if (!incoming.length) return;
      setMessages((current) => mergeMessages(current, incoming));
      const newest = incoming.reduce((max, m) => (m.createdAt > max ? m.createdAt : max), lastSeen.current);
      lastSeen.current = newest;
      if (incoming.some((m) => m.senderId !== viewerId)) void markConversationRead(conversationId);
    },
    [conversationId, viewerId],
  );

  // Live updates via Supabase Realtime (RLS applies), plus a polling fallback that also catches gaps.
  useEffect(() => {
    void markConversationRead(conversationId);
    let channel: ReturnType<ReturnType<typeof getBrowserClient>["channel"]> | null = null;
    try {
      const supabase = getBrowserClient();
      channel = supabase
        .channel(`conversation:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const m = payload.new as { id: string; sender_id: string | null; kind: ChatMessage["kind"]; body: string; client_id: string; created_at: string };
            ingest([{ id: m.id, senderId: m.sender_id, kind: m.kind, body: m.body, clientId: m.client_id, createdAt: m.created_at }]);
          },
        )
        .subscribe();
    } catch {
      // Realtime unavailable: polling below keeps the thread current.
    }
    const poll = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const result = await fetchMessagesSince(conversationId, lastSeen.current);
      if (result.ok) ingest(result.data);
    }, POLL_MS);
    return () => {
      window.clearInterval(poll);
      if (channel) void getBrowserClient().removeChannel(channel);
    };
  }, [conversationId, ingest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const deliver = useCallback(
    async (message: LocalMessage, send: () => Promise<{ ok: true; data: ChatMessage } | { ok: false; error: string }>) => {
      setMessages((current) =>
        current.some((m) => m.clientId === message.clientId)
          ? current.map((m) => (m.clientId === message.clientId ? { ...m, state: "sending" } : m))
          : [...current, { ...message, state: "sending" }],
      );
      const result = await send();
      if (result.ok) {
        ingest([result.data]);
      } else {
        setMessages((current) => current.map((m) => (m.clientId === message.clientId ? { ...m, state: "failed" } : m)));
        toast.error(result.error);
      }
    },
    [ingest],
  );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !canSend) return;
    const clientId = crypto.randomUUID();
    const optimistic: LocalMessage = { id: clientId, clientId, senderId: viewerId, kind: "text", body, createdAt: new Date().toISOString(), state: "sending" };
    setDraft("");
    void deliver(optimistic, () => sendMessage({ conversationId, clientId, body }));
  };

  const retry = (message: LocalMessage) =>
    deliver(message, () =>
      message.kind === "contact_share"
        ? shareContact({ conversationId, clientId: message.clientId, method: "other", value: message.body })
        : sendMessage({ conversationId, clientId: message.clientId, body: message.body }),
    );

  const grouped = useMemo(() => {
    const groups: { day: string; items: LocalMessage[] }[] = [];
    for (const message of messages) {
      const day = formatDate(message.createdAt);
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1)!.items.push(message);
    }
    return groups;
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-1 border-b px-3 py-1.5">
        <ThreadMenu conversationId={conversationId} otherId={otherId} otherName={otherName} blockedByMe={blockedByMe} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions" role="log" aria-label={`Conversation with ${otherName}`}>
        {messages.length === 0 && (
          <p className="mx-auto max-w-sm py-10 text-center text-sm text-muted-foreground">
            Say hi and ask about the item: condition, what&apos;s included, and a good time and place to meet on campus.
          </p>
        )}
        {grouped.map((group) => (
          <div key={group.day} className="grid gap-2">
            <p className="my-2 text-center text-xs text-muted-foreground">{group.day}</p>
            {group.items.map((message) => (
              <MessageBubble key={message.clientId} message={message} mine={message.senderId === viewerId} onRetry={() => retry(message)} />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <form onSubmit={submit} className="border-t bg-background p-3">
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => setShareOpen(true)} aria-label="Share contact details">
              <Phone aria-hidden />
            </Button>
            <label htmlFor="composer" className="sr-only">Message</label>
            <Textarea
              id="composer"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Write a message…"
              className="max-h-40 min-h-10 resize-none"
            />
            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message">
              <Send aria-hidden />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Never send money in advance or share OTPs. Meet on campus and inspect the item first.</p>
        </form>
      ) : (
        <div role="status" className="flex items-center gap-2 border-t bg-muted/50 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          {blockedByMe ? `You blocked ${otherName}. Unblock them from the menu to send messages.` : "You can't send messages in this conversation."}
        </div>
      )}

      <ContactShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        otherName={otherName}
        savedPhone={savedPhone}
        onShare={async (method, value, saveAsDefault) => {
          const clientId = crypto.randomUUID();
          const body = method === "phone" ? `Phone: ${value}` : value;
          const optimistic: LocalMessage = { id: clientId, clientId, senderId: viewerId, kind: "contact_share", body, createdAt: new Date().toISOString(), state: "sending" };
          setShareOpen(false);
          await deliver(optimistic, () => shareContact({ conversationId, clientId, method, value, saveAsDefault }));
        }}
      />
    </div>
  );
}

function MessageBubble({ message, mine, onRetry }: { message: LocalMessage; mine: boolean; onRetry: () => void }) {
  const isContact = message.kind === "contact_share";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
            mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
            isContact && "border-2 border-dashed",
            message.state === "failed" && "opacity-70",
          )}
        >
          {isContact && (
            <span className={cn("mb-1 flex items-center gap-1 text-xs font-medium", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
              <Phone className="size-3" aria-hidden /> {mine ? "You shared contact details" : "Shared contact details with you"}
            </span>
          )}
          {message.body}
        </div>
        <div className={cn("mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground", mine ? "justify-end" : "justify-start")}>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {mine && message.state === "sending" && (
            <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden /> Sending</span>
          )}
          {mine && message.state === "sent" && (
            <span className="flex items-center gap-0.5"><Check className="size-3" aria-hidden /> Sent</span>
          )}
          {mine && message.state === "failed" && (
            <button type="button" onClick={onRetry} className="flex items-center gap-1 font-medium text-destructive hover:underline">
              <AlertCircle className="size-3" aria-hidden /> Not sent. Retry <RotateCw className="size-3" aria-hidden />
            </button>
          )}
          {!mine && message.kind !== "system" && (
            <ReportDialog
              targetType="message"
              targetId={message.id}
              trigger={<button type="button" className="hover:text-foreground hover:underline">Report</button>}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadMenu({ conversationId, otherId, otherName, blockedByMe }: { conversationId: string; otherId: string; otherName: string; blockedByMe: boolean }) {
  const [pending, startTransition] = useTransition();
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending} aria-label="Conversation options">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <MoreVertical aria-hidden />} Options
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>Report {otherName}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant={blockedByMe ? "default" : "destructive"}
            onSelect={() =>
              startTransition(async () => {
                const result = blockedByMe ? await unblockUser(otherId, conversationId) : await blockUser(otherId, conversationId);
                if (result.ok) {
                  toast.success(result.message ?? "Done.");
                  window.location.reload();
                } else toast.error(result.error);
              })
            }
          >
            {blockedByMe ? `Unblock ${otherName}` : `Block ${otherName}`}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog targetType="user" targetId={otherId} open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}

function ContactShareDialog({
  open,
  onOpenChange,
  otherName,
  savedPhone,
  onShare,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherName: string;
  savedPhone: string | null;
  onShare: (method: "phone" | "other", value: string, saveAsDefault: boolean) => Promise<void>;
}) {
  const [method, setMethod] = useState<"phone" | "other">("phone");
  const [value, setValue] = useState(savedPhone ?? "");
  const [save, setSave] = useState(!savedPhone);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim().length >= 3) void onShare(method, value.trim(), method === "phone" && save);
          }}
        >
          <DialogHeader>
            <DialogTitle>Share contact details with {otherName}?</DialogTitle>
            <DialogDescription>
              Only {otherName} will see this, inside this conversation. It can&apos;t be unshared once sent. You don&apos;t have to share
              anything; you can keep chatting here.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 grid gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label="Contact type">
              {(["phone", "other"] as const).map((m) => (
                <Button key={m} type="button" variant={method === m ? "default" : "outline"} size="sm" role="radio" aria-checked={method === m} onClick={() => { setMethod(m); setValue(m === "phone" ? (savedPhone ?? "") : ""); }}>
                  {m === "phone" ? "Phone number" : "Other (e.g. Instagram)"}
                </Button>
              ))}
            </div>
            <label htmlFor="contact-value" className="text-sm font-medium">{method === "phone" ? "Phone number" : "Contact detail"}</label>
            <Input
              id="contact-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode={method === "phone" ? "tel" : "text"}
              autoComplete={method === "phone" ? "tel" : "off"}
              placeholder={method === "phone" ? "+91 98765 43210" : "@your.handle"}
              maxLength={120}
              required
            />
            {method === "phone" && !savedPhone && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={save} onCheckedChange={(v) => setSave(v === true)} /> Remember this number for next time (kept private)
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={value.trim().length < 3}>Share with {otherName}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
