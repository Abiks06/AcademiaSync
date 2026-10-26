export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Loading your workspace">
      <div className="hidden w-64 shrink-0 border-r border-line p-4 lg:block">
        <div className="shimmer mb-8 h-7 w-40 rounded-lg bg-line" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shimmer mb-2 h-8 rounded-lg bg-line/60" />
        ))}
      </div>
      <div className="flex-1 px-4 py-8 sm:px-8 lg:px-12">
        <PageSkeleton />
      </div>
    </div>
  );
}

/** Placeholder for the page area while its data loads inside the app shell. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl" aria-busy="true" aria-label="Loading">
      <div className="shimmer h-12 w-56 rounded-xl bg-line" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="shimmer h-52 rounded-2xl border border-line bg-line/40" />
        ))}
      </div>
    </div>
  );
}
