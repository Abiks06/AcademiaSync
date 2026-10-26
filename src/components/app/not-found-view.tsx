import Link from "next/link";
import { Compass } from "lucide-react";

/** Shown when a page doesn't exist or row-level security hides it from this user. */
export function NotFoundView({ href, label }: { href: string; label: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-iris-soft text-iris">
        <Compass className="h-5 w-5" />
      </span>
      <h1 className="mt-6 font-serif text-3xl">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-muted">
        It may have been moved or deleted, or it belongs to a project you haven&apos;t been invited to.
      </p>
      <Link
        href={href}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-bg"
      >
        {label}
      </Link>
    </div>
  );
}
