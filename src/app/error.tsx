"use client";

import { ErrorView } from "@/components/app/error-view";

// Catches errors in nested layouts, such as the signed-in shell, which their own error.tsx can't.
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
