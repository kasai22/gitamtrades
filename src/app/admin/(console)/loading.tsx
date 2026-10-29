import { TableSkeleton } from "@/features/admin/components/data-table";

export default function ConsoleLoading() {
  return (
    <div role="status" aria-label="Loading">
      <div className="mb-5 h-7 w-56 animate-pulse rounded-md bg-muted" />
      <TableSkeleton />
    </div>
  );
}
