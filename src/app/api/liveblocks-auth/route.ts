import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AuthUnavailableError, isSignedOutError } from "@/lib/supabase/auth-errors";
import { getLiveblocks, isLiveblocksConfigured } from "@/lib/liveblocks/server";
import { canEditRole, documentIdFromRoom, userColor } from "@/lib/liveblocks/rooms";
import { MIN_SCHEMA_VERSION, requestSchema } from "@/lib/editor/schema-version";
import { restoreLostRoom } from "@/lib/documents/live-document";

/**
 * Hands out a short-lived Liveblocks token for one document room. The database
 * decides who gets in: if row-level security hides the document from this user,
 * no token is issued. Read-only roles get a read-only token. Editors older than the
 * document schema are turned away, since they would delete content they don't understand.
 */
export async function POST(request: NextRequest) {
  if (!isLiveblocksConfigured()) {
    return NextResponse.json({ error: "Live editing isn't set up on this server yet." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { room?: unknown } | null;
  const documentId = documentIdFromRoom(body?.room);
  if (!documentId) return NextResponse.json({ error: "Unknown room." }, { status: 400 });
  if (requestSchema(body) < MIN_SCHEMA_VERSION) {
    return NextResponse.json({ error: "AcademiaSync has been updated. Reload this page to keep editing." }, { status: 409 });
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) {
    if (isSignedOutError(authError)) return NextResponse.json({ error: "Sign in to edit." }, { status: 401 });
    return NextResponse.json({ error: new AuthUnavailableError(authError).message }, { status: 503 });
  }
  const user = data.user;

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, project_id")
    .eq("id", documentId)
    .maybeSingle();
  if (documentError) return NextResponse.json({ error: "Couldn't check your access. Try again." }, { status: 503 });
  // Row-level security returns nothing for projects the user isn't in.
  if (!document) return NextResponse.json({ error: "You don't have access to this document." }, { status: 403 });

  const [{ data: membership, error: membershipError }, { data: profile }] = await Promise.all([
    supabase.from("project_members").select("role").eq("project_id", document.project_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  // A failed lookup is not the same as "not a member": let the client retry instead of locking them out.
  if (membershipError) return NextResponse.json({ error: "Couldn't check your access. Try again." }, { status: 503 });
  if (!membership) return NextResponse.json({ error: "You don't have access to this document." }, { status: 403 });

  // If the room lost its text (a new Liveblocks project, say), put the saved copy back
  // before this editor connects to an empty document.
  await restoreLostRoom(documentId, supabase);

  const session = getLiveblocks().prepareSession(user.id, {
    userInfo: {
      // Never the email address: everyone in the room would see it.
      name: profile?.full_name ?? "Collaborator",
      avatar: profile?.avatar_url ?? undefined,
      color: userColor(user.id),
    },
  });
  const room = body!.room as string;
  // Commenters and reviewers can read the text and leave comments, but not change it.
  session.allow(room, canEditRole(membership.role) ? ["*:write"] : ["*:read", "comments:write"]);

  const { status, body: token } = await session.authorize();
  return new NextResponse(token, { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
