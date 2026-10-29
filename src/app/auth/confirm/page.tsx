import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ConfirmCard } from "./confirm-card";

export const metadata: Metadata = { title: "Open your workspace", robots: { index: false } };

/** Where the sign-in email's button leads. One press breaks the seal and signs in. */
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <main className="desk grain relative grid min-h-dvh place-items-center overflow-hidden px-6 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,var(--lamp),transparent_72%)]" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-16 flex items-center justify-center gap-2 font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          AcademiaSync
        </Link>
        <Suspense fallback={<ConfirmCard tokenHash="" type="email" />}>
          <WithParams searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function WithParams({ searchParams }: Pick<PageProps<"/auth/confirm">, "searchParams">) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "email";
  return <ConfirmCard tokenHash={tokenHash} type={type} />;
}
