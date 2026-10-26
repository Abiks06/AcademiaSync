"use client";

import "./globals.css";
import { ErrorView } from "@/components/app/error-view";

// Replaces the root layout when it fails, so it brings its own document.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-bg text-ink">
        <title>Something went wrong · AcademiaSync</title>
        <ErrorView error={error} retry={retry} />
      </body>
    </html>
  );
}
