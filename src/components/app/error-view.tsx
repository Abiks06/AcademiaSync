"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Shared fallback for route error boundaries. Production builds replace server
 * error messages with a generic one, so this shows fixed copy plus the digest
 * that matches the server log.
 */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Something didn&apos;t load</h1>
      <p className="mt-3 text-muted">
        We couldn&apos;t reach the server just now. Nothing you saved is lost; try again in a moment.
      </p>
      {digest && <p className="mt-2 font-mono text-xs text-faint">Reference {digest}</p>}
      <button
        onClick={() => retry()}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg"
      >
        <RotateCcw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
