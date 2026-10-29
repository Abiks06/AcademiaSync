import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/account/profile-editor";
import { AccountSection } from "@/components/account/account-section";
import { getUser } from "@/lib/supabase/server";
import { loadOwnProfile } from "@/lib/profile/load";
import { userColor } from "@/lib/liveblocks/rooms";

export const metadata: Metadata = { title: "Profile and account" };

export default function SettingsPage() {
  return (
    <div className="desk mx-auto max-w-3xl pb-24">
      <header className="mb-10">
        <p className="rise font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Settings</p>
        <h1 className="rise mt-2 font-serif text-4xl font-medium tracking-tight" style={{ "--i": 1 } as React.CSSProperties}>
          Profile and account
        </h1>
      </header>
      <Suspense fallback={<div className="shimmer h-[36rem] rounded-md bg-line/40" aria-busy="true" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/sign-in?next=/settings");
  const profile = await loadOwnProfile(supabase, user);
  const methods = Array.from(new Set((user.identities ?? []).map((i) => i.provider)));

  return (
    <div className="grid gap-16">
      <ProfileEditor
        userId={user.id}
        defaults={profile.defaults}
        email={user.email ?? ""}
        avatarUrl={profile.avatarUrl}
        color={userColor(user.id)}
        mode="settings"
      />
      <AccountSection email={user.email ?? ""} methods={methods.length ? methods : ["email"]} lastSignIn={user.last_sign_in_at ?? null} />
    </div>
  );
}
