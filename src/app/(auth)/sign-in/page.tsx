import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { safeNext, signInErrorMessage } from "@/lib/auth-redirect";
import { SignInExperience } from "./sign-in-form";
import { providerSettings } from "./providers";

export const metadata: Metadata = { title: "Sign in" };

const header = (
  <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
    <Logo className="h-7 w-7" />
    AcademiaSync
  </Link>
);
const footer = <p className="text-xs text-faint">By continuing you agree to keep your co-authors&apos; drafts confidential.</p>;

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={<SignInExperience next="/projects" providers={{ google: true, azure: true }} header={header} footer={footer} />}>
      <SignInWithParams searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInWithParams({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const [params, providers] = await Promise.all([searchParams, providerSettings()]);
  return (
    <SignInExperience
      next={safeNext(params.next)}
      initialError={signInErrorMessage(params.error)}
      providers={providers}
      header={header}
      footer={footer}
    />
  );
}
