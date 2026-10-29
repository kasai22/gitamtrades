export default function Loading() {
  return (
    <div className="grid gap-4" role="status" aria-label="Loading">
      <div className="h-7 w-40 animate-pulse rounded bg-muted" />
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      <div className="h-11 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
