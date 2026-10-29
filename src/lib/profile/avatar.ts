/**
 * The picture to show for a profile: one the person uploaded (stored by its path in the
 * public avatars bucket), else the one their Google account came with, else none.
 */
export function avatarSrc(profile: { avatar_path?: string | null; avatar_url?: string | null } | null | undefined) {
  if (!profile) return null;
  if (profile.avatar_path) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    if (base) return `${base}/storage/v1/object/public/avatars/${profile.avatar_path}`;
  }
  return profile.avatar_url ?? null;
}
