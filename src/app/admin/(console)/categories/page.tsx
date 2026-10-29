import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { CategoryManager } from "@/features/admin/components/category-manager";
import { PageHeading, Panel } from "@/features/admin/components/data-table";
import { listCategories } from "@/features/admin/services/config";
import { CONDITIONS, STATUS_LABELS } from "@/features/listings/constants";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const actor = await requirePermission("config.view", "/admin/categories");
  const categories = await listCategories(actor);
  const canManage = hasPermission(actor, "categories.manage");

  return (
    <>
      <PageHeading
        title="Categories"
        description={
          canManage
            ? "Order, names and availability of marketplace categories. Disabling a category stops new listings in it; existing listings aren't changed. To block a category for policy reasons, use Moderation rules."
            : "Read-only: only Super Admins can change categories."
        }
      />
      <CategoryManager categories={categories} canManage={canManage} />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel title="Listing conditions" description="Defined in the database schema. Changing them requires a migration because existing listings reference them.">
          <ul className="grid gap-1 text-sm" role="list">
            {CONDITIONS.map((c) => (
              <li key={c.value}><span className="font-medium">{c.label}</span> <span className="text-muted-foreground">— {c.hint}</span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Listing statuses" description="The seller lifecycle is enforced by the database state machine.">
          <ul className="grid gap-1 text-sm" role="list">
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <li key={value}><code className="text-xs">{value}</code> <span className="text-muted-foreground">— {label}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Moderation states (quarantined, removed) are separate. See <Link href="/admin/moderation" className="text-primary hover:underline">Moderation rules</Link>.</p>
        </Panel>
      </div>
    </>
  );
}
