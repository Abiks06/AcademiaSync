"use client";

import { RotateCcw } from "lucide-react";

export default function WorkspaceError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Something didn&apos;t load</h1>
      <p className="mt-3 text-muted">{error.message}</p>
      <button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg">
        <RotateCcw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
