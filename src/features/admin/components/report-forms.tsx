"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addReportNote, updateReport } from "../actions";

const selectClass = "h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm";

/** Assignment and priority. Assigning an open case moves it to Investigating (server-side). */
export function ReportTriage({ reportId, assignedTo, priority, staff, actorId }: { reportId: string; assignedTo: string | null; priority: number; staff: { id: string; name: string }[]; actorId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (patch: Parameters<typeof updateReport>[1]) =>
    start(async () => {
      const result = await updateReport(reportId, patch);
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        router.refresh();
      } else toast.error(result.error);
    });
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <label htmlFor="assignee" className="text-xs font-medium text-muted-foreground">Assigned to</label>
        <select id="assignee" className={selectClass} disabled={pending} value={assignedTo ?? ""} onChange={(e) => save({ assignedTo: e.target.value || null })}>
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.id === actorId ? " (you)" : ""}</option>
          ))}
        </select>
        {assignedTo !== actorId && (
          <Button size="xs" variant="link" className="justify-self-start px-0" disabled={pending} onClick={() => save({ assignedTo: actorId })}>Assign to me</Button>
        )}
      </div>
      <div className="grid gap-1">
        <label htmlFor="priority" className="text-xs font-medium text-muted-foreground">Priority</label>
        <select id="priority" className={selectClass} disabled={pending} value={priority} onChange={(e) => save({ priority: Number(e.target.value) })}>
          <option value={4}>Urgent</option>
          <option value={3}>High</option>
          <option value={2}>Normal</option>
          <option value={1}>Low</option>
        </select>
      </div>
    </div>
  );
}

/** Internal note: visible to staff with reports.view only, never to students. Append-only. */
export function ReportNoteForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await addReportNote(reportId, note);
          if (result.ok) {
            setNote("");
            toast.success("Note added.");
            router.refresh();
          } else toast.error(result.error);
        });
      }}
    >
      <label htmlFor="report-note" className="sr-only">Internal note</label>
      <Textarea id="report-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Findings, context, next steps… (staff only)" />
      <Button type="submit" size="sm" disabled={pending || note.trim().length < 2} className="justify-self-end">{pending ? "Saving…" : "Add note"}</Button>
    </form>
  );
}

/** Extra fields for closing a case (status-change dialog). */
export function ResolutionFields({ codes, defaultCode }: { codes: readonly { value: string; label: string }[]; defaultCode?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor="resolution-code" className="text-sm font-medium">Resolution</label>
      <select id="resolution-code" name="resolutionCode" required defaultValue={defaultCode ?? ""} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
        <option value="" disabled>Choose an outcome</option>
        {codes.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    </div>
  );
}
