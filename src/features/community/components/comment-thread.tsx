"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MessageSquare, MinusSquare, MoreHorizontal, PlusSquare } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportDialog } from "@/features/moderation/components/report-dialog";
import { createComment, deleteOwnContent } from "../actions";
import { MAX_COMMENT_BODY, MAX_DEPTH } from "../constants";
import type { ThreadComment } from "../queries";
import { VoteControl } from "./vote-control";

/** Comment box for a top-level comment or an inline reply. */
export function CommentComposer({
  postId,
  parentId = null,
  autoFocus = false,
  onDone,
  placeholder = "What are your thoughts?",
}: {
  postId: string;
  parentId?: string | null;
  autoFocus?: boolean;
  onDone?: () => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const id = `composer-${parentId ?? "root"}`;
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        startTransition(async () => {
          const result = await createComment({ postId, parentId, body });
          if (result.ok) {
            setBody("");
            if (result.message) toast.success(result.message);
            onDone?.();
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <label htmlFor={id} className="sr-only">{parentId ? "Reply" : "Comment"}</label>
      <Textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={parentId ? 2 : 3} maxLength={MAX_COMMENT_BODY} placeholder={placeholder} autoFocus={autoFocus} />
      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} {parentId ? "Reply" : "Comment"}
        </Button>
      </div>
    </form>
  );
}

/** Report / delete menu for a post or comment. */
export function ContentMenu({ target, id, isOwn, afterDelete }: { target: "post" | "comment"; id: string; isOwn: boolean; afterDelete?: () => void }) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${target === "post" ? "Post" : "Comment"} options`} disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isOwn && <DropdownMenuItem onSelect={() => setReportOpen(true)}>Report</DropdownMenuItem>}
          {isOwn && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                startTransition(async () => {
                  if (!window.confirm(`Delete this ${target}? This can't be undone.`)) return;
                  const result = await deleteOwnContent(target, id);
                  if (result.ok) {
                    toast.success("Deleted.");
                    if (afterDelete) afterDelete();
                    else router.refresh();
                  } else toast.error(result.error);
                })
              }
            >
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportDialog targetType={target} targetId={id} open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}

function CommentNode({ comment, postId, viewerId, locked }: { comment: ThreadComment; postId: string; viewerId: string; locked: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const placeholder = comment.state === "deleted" || comment.state === "removed";
  const countReplies = (c: ThreadComment): number => c.children.reduce((n, child) => n + 1 + countReplies(child), 0);

  return (
    <li className="relative">
      <article aria-label={placeholder ? "Deleted comment" : `Comment by ${comment.authorName ?? "a student"}`} className="py-2">
        <header className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand thread" : "Collapse thread"}
            className="rounded p-0.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {collapsed ? <PlusSquare className="size-4" aria-hidden /> : <MinusSquare className="size-4" aria-hidden />}
          </button>
          {placeholder ? (
            <span className="italic">{comment.state === "removed" ? "[removed by moderators]" : "[deleted]"}</span>
          ) : (
            <>
              <Avatar className="size-5">
                {comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} alt="" />}
                <AvatarFallback className="text-[9px]">{initials(comment.authorName ?? "?")}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground">{comment.authorName ?? "Student"}</span>
              {comment.authorId === viewerId && <span className="rounded bg-secondary px-1 text-[10px] font-medium text-secondary-foreground">You</span>}
            </>
          )}
          <span aria-hidden>·</span>
          <time dateTime={comment.createdAt}>{formatRelative(comment.createdAt)}</time>
          {comment.state === "under_review" && <span className="rounded bg-warning px-1.5 text-[10px] font-medium text-warning-foreground">Hidden: under review</span>}
          {collapsed && countReplies(comment) > 0 && <span>({countReplies(comment)} more)</span>}
        </header>

        {!collapsed && (
          <div className="pl-6">
            {!placeholder && <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>}
            {!placeholder && (
              <div className="mt-1 flex items-center gap-1">
                <VoteControl target="comment" id={comment.id} score={comment.score} myVote={comment.myVote} orientation="horizontal" disabled={comment.state !== "visible"} />
                {!locked && comment.depth < MAX_DEPTH && comment.state === "visible" && (
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setReplying((r) => !r)} aria-expanded={replying}>
                    <MessageSquare aria-hidden /> Reply
                  </Button>
                )}
                <ContentMenu target="comment" id={comment.id} isOwn={comment.authorId === viewerId} />
              </div>
            )}
            {replying && (
              <div className="mt-2">
                <CommentComposer postId={postId} parentId={comment.id} autoFocus onDone={() => setReplying(false)} placeholder={`Reply to ${comment.authorName ?? "this comment"}`} />
              </div>
            )}
          </div>
        )}
      </article>
      {!collapsed && comment.children.length > 0 && (
        <ul className={cn("ml-2 border-l-2 border-border pl-3 hover:border-primary/40 sm:ml-3 sm:pl-4")} role="list">
          {comment.children.map((child) => (
            <CommentNode key={child.id} comment={child} postId={postId} viewerId={viewerId} locked={locked} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Reddit-style nested thread with collapsible branches. */
export function CommentThread({ comments, postId, viewerId, locked }: { comments: ThreadComment[]; postId: string; viewerId: string; locked: boolean }) {
  if (comments.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No comments yet. Start the conversation.</p>;
  }
  return (
    <ul className="grid" role="list" aria-label="Comments">
      {comments.map((comment) => (
        <CommentNode key={comment.id} comment={comment} postId={postId} viewerId={viewerId} locked={locked} />
      ))}
    </ul>
  );
}
