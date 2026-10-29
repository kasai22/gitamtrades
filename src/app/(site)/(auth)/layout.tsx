export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 items-start justify-center bg-gradient-to-b from-secondary/50 to-background px-4 py-10 sm:py-16">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">{children}</div>
    </div>
  );
}
