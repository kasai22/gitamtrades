export default function AdminLoading() {
  return (
    <div className="flex min-h-svh w-full" role="status" aria-label="Loading admin console">
      <div className="hidden w-60 shrink-0 border-r bg-sidebar lg:block" />
      <div className="flex-1 p-6">
        <div className="mb-6 h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
