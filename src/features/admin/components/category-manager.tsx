"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/marketplace/category-icon";
import { FormMessage } from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { reorderCategories, saveCategory } from "../actions";
import { AdminActionDialog } from "./admin-action";

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  is_active: boolean;
  is_ticket: boolean;
  listingCount: number;
  liveCount: number;
};

type Draft = { id?: string; slug: string; name: string; description: string; icon: string; isTicket: boolean; isActive: boolean; inUse: boolean };

const slugify = (s: string) => s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function CategoryManager({ categories, canManage }: { categories: CategoryRow[]; canManage: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        if (!draft) toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
      after?.();
      router.refresh();
    });

  const move = (index: number, delta: number) => {
    const ids = categories.map((c) => c.id);
    const [item] = ids.splice(index, 1);
    ids.splice(index + delta, 0, item);
    run(() => reorderCategories(ids));
  };

  const toggle = (c: CategoryRow) =>
    run(() => saveCategory({ id: c.id, slug: c.slug, name: c.name, description: c.description ?? "", icon: c.icon as (typeof CATEGORY_ICON_NAMES)[number], isTicket: c.is_ticket, isActive: !c.is_active }));

  return (
    <>
      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => { setError(null); setDraft({ slug: "", name: "", description: "", icon: "package", isTicket: false, isActive: true, inUse: false }); }}>
            <Plus aria-hidden /> New category
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Categories in display order</caption>
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {canManage && <th className="h-9 w-20 px-3 text-left font-medium">Order</th>}
              <th className="h-9 px-3 text-left font-medium">Category</th>
              <th className="h-9 px-3 text-left font-medium">Slug</th>
              <th className="h-9 px-3 text-left font-medium">Type</th>
              <th className="h-9 px-3 text-right font-medium">Live / total listings</th>
              <th className="h-9 px-3 text-left font-medium">Status</th>
              {canManage && <th className="h-9 px-3" />}
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.id} className="border-t">
                {canManage && (
                  <td className="px-3 py-2">
                    <span className="flex gap-0.5">
                      <Button variant="ghost" size="icon-xs" disabled={i === 0 || pending} onClick={() => move(i, -1)} aria-label={`Move ${c.name} up`}><ArrowUp aria-hidden /></Button>
                      <Button variant="ghost" size="icon-xs" disabled={i === categories.length - 1 || pending} onClick={() => move(i, 1)} aria-label={`Move ${c.name} down`}><ArrowDown aria-hidden /></Button>
                    </span>
                  </td>
                )}
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <CategoryIcon icon={c.icon} className="size-4 text-muted-foreground" />
                    <span>
                      <span className="font-medium">{c.name}</span>
                      {c.description && <span className="block max-w-sm truncate text-xs text-muted-foreground">{c.description}</span>}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2"><code className="text-xs">{c.slug}</code></td>
                <td className="px-3 py-2 text-xs">{c.is_ticket ? <Badge variant="info">Ticket fields</Badge> : "Standard"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.liveCount} / {c.listingCount}</td>
                <td className="px-3 py-2">{c.is_active ? <Badge variant="success">Enabled</Badge> : <Badge variant="outline">Disabled</Badge>}</td>
                {canManage && (
                  <td className="px-3 py-2">
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => { setError(null); setDraft({ id: c.id, slug: c.slug, name: c.name, description: c.description ?? "", icon: c.icon, isTicket: c.is_ticket, isActive: c.is_active, inUse: c.listingCount > 0 }); }}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => toggle(c)}>{c.is_active ? "Disable" : "Enable"}</Button>
                      {c.listingCount === 0 && (
                        <AdminActionDialog
                          op="category.delete"
                          fields={{ categoryId: c.id }}
                          label="Delete"
                          variant="destructive"
                          title={`Delete “${c.name}”?`}
                          description="No listings use this category. Deleting it can't be undone; disable it instead if you may need it again."
                          confirmWord="DELETE"
                          confirmLabel="Delete category"
                        />
                      )}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          {draft && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => saveCategory({ id: draft.id, slug: draft.slug, name: draft.name, description: draft.description, icon: draft.icon as (typeof CATEGORY_ICON_NAMES)[number], isTicket: draft.isTicket, isActive: draft.isActive }), () => setDraft(null));
              }}
            >
              <DialogHeader>
                <DialogTitle>{draft.id ? `Edit ${draft.name}` : "New category"}</DialogTitle>
                <DialogDescription>
                  {draft.inUse ? "Listings use this category, so its slug and ticket type are locked to keep existing listings and links valid." : "Shown to sellers when they create a listing and in browse filters."}
                </DialogDescription>
              </DialogHeader>
              {error && <FormMessage error={error} />}
              <div className="grid gap-1.5">
                <label htmlFor="cat-name" className="text-sm font-medium">Name</label>
                <Input id="cat-name" required minLength={2} maxLength={60} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.id ? draft.slug : slugify(e.target.value) })} />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="cat-slug" className="text-sm font-medium">Slug (URL)</label>
                <Input id="cat-slug" required pattern="[a-z0-9-]{2,40}" disabled={draft.inUse} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} className="font-mono" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="cat-desc" className="text-sm font-medium">Description</label>
                <Textarea id="cat-desc" rows={2} maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">Icon</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_ICON_NAMES.map((name) => (
                    <label key={name} className={`flex size-9 cursor-pointer items-center justify-center rounded-md border has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50`} title={name}>
                      <input type="radio" name="icon" value={name} checked={draft.icon === name} onChange={() => setDraft({ ...draft, icon: name })} className="sr-only" aria-label={name} />
                      <CategoryIcon icon={name} className="size-4" />
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" disabled={draft.inUse} checked={draft.isTicket} onChange={(e) => setDraft({ ...draft, isTicket: e.target.checked })} />
                <span>Event tickets: requires event name/date and transfer confirmation; blocks ticket codes and QR photos.</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                Enabled (sellers can choose it)
              </label>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
