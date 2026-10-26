import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { SignInForm } from "./sign-in-form";
import { OrbitPanel } from "./orbit-panel";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-7 w-7" />
          AcademiaSync
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <Suspense fallback={<SignInForm next="/projects" />}>
            <SignInFormWithParams searchParams={searchParams} />
          </Suspense>
        </div>
        <p className="text-xs text-faint">
          By continuing you agree to keep your co-authors&apos; drafts confidential.
        </p>
      </section>
      <OrbitPanel />
    </main>
  );
}

async function SignInFormWithParams({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/projects";
  const error = typeof params.error === "string" ? params.error : undefined;
  return <SignInForm next={next} initialError={error} />;
}
