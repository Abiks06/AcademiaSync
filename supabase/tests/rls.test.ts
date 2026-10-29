import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, PG } from "./db";
import { randomUUID } from "node:crypto";

let db: Awaited<ReturnType<typeof connect>>;
let ada: string, ben: string, cy: string, dee: string, eve: string;
let projectId: string, otherProject: string, documentId: string;

beforeAll(async () => {
  db = await connect();
  ada = await db.user("Ada");
  ben = await db.user("Ben");
  cy = await db.user("Cy");
  dee = await db.user("Dee");
  eve = await db.user("Eve");
  // Ada owns the project; Ben is an author, Cy a contributor, Dee a commenter. Eve is an outsider.
  projectId = await db.project(ada, { [ben]: "author", [cy]: "contributor", [dee]: "commenter" });
  otherProject = await db.project(eve);
  documentId = await db.document(projectId, ada);
});
afterAll(() => db.end());

const expectCode = async (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

describe("projects and membership", () => {
  it("hides other people's projects", async () => {
    const { rows } = await db.as(eve, "select id from public.projects where id = $1", [projectId]);
    expect(rows).toHaveLength(0);
  });

  it("makes the creator the owner", async () => {
    const { rows } = await db.as(ada, "select role from public.project_members where project_id = $1 and user_id = $2", [projectId, ada]);
    expect(rows[0].role).toBe("owner");
  });

  it("refuses to let a removed creator keep reading the project", async () => {
    const solo = await db.user("Solo");
    const p = await db.project(solo, { [ada]: "owner" });
    await db.as(ada, "delete from public.project_members where project_id = $1 and user_id = $2", [p, solo]);
    const { rows } = await db.as(solo, "select id from public.projects where id = $1", [p]);
    expect(rows).toHaveLength(0);
  });

  it("doesn't let members add themselves to a project", async () => {
    await expectCode(
      db.as(eve, "insert into public.project_members (project_id, user_id, role) values ($1, $2, 'owner')", [projectId, eve]),
      PG.insufficientPrivilege,
    );
  });

  it("keeps at least one owner", async () => {
    await expectCode(
      db.as(ada, "update public.project_members set role = 'author' where project_id = $1 and user_id = $2", [projectId, ada]),
      PG.raiseException,
    );
  });

  it("doesn't let clients backdate a project", async () => {
    await expectCode(
      db.as(ada, "insert into public.projects (name, created_by, created_at) values ('Old', $1, '2001-01-01')", [ada]),
      PG.insufficientPrivilege,
    );
  });
});

describe("invites", () => {
  it("lets owners and authors invite", async () => {
    const { rows } = await db.as(ben, "insert into public.project_invites (project_id, email, role) values ($1, 'new@example.edu', 'contributor') returning id", [projectId]);
    expect(rows).toHaveLength(1);
  });

  it("refuses invites from contributors", async () => {
    await expectCode(
      db.as(cy, "insert into public.project_invites (project_id, email, role) values ($1, 'x@example.edu', 'commenter')", [projectId]),
      PG.insufficientPrivilege,
    );
  });

  it("refuses a chosen token or expiry", async () => {
    await expectCode(
      db.as(ben, "insert into public.project_invites (project_id, email, role, expires_at) values ($1, 'forever@example.edu', 'author', '9999-01-01')", [projectId]),
      PG.insufficientPrivilege,
    );
    await expectCode(
      db.as(ben, "insert into public.project_invites (project_id, email, role, token) values ($1, 'guess@example.edu', 'author', 'abc')", [projectId]),
      PG.insufficientPrivilege,
    );
  });

  it("never invites an owner", async () => {
    await expectCode(
      db.as(ada, "insert into public.project_invites (project_id, email, role) values ($1, 'boss@example.edu', 'owner')", [projectId]),
      PG.checkViolation,
    );
  });
});

describe("document versions", () => {
  it("lets members read history", async () => {
    await db.admin("insert into public.document_versions (document_id, content, plain_text) values ($1, '{}', 'hello')", [documentId]);
    const { rows } = await db.as(dee, "select plain_text from public.document_versions where document_id = $1", [documentId]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses history written by clients, even editors", async () => {
    await expectCode(
      db.as(ada, "insert into public.document_versions (document_id, content, plain_text) values ($1, '{}', 'forged')", [documentId]),
      PG.insufficientPrivilege,
    );
  });

  it("hides history from outsiders", async () => {
    const { rows } = await db.as(eve, "select id from public.document_versions where document_id = $1", [documentId]);
    expect(rows).toHaveLength(0);
  });
});

describe("sources", () => {
  const add = (userId: string, project: string, extra = "") =>
    db.as<{ id: string }>(
      userId,
      `insert into public.sources (project_id, title, authors, created_by${extra ? ", " + extra.split("=")[0] : ""})
       values ($1, 'A paper', '[{"family":"Lusher","given":"Amy"}]', $2${extra ? ", " + extra.split("=")[1] : ""}) returning id`,
      [project, userId],
    );

  it("lets editors add sources", async () => {
    const { rows } = await add(cy, projectId);
    expect(rows).toHaveLength(1);
  });

  it("refuses commenters and outsiders", async () => {
    await expectCode(add(dee, projectId), PG.insufficientPrivilege);
    await expectCode(add(eve, projectId), PG.insufficientPrivilege);
  });

  it("refuses malformed author lists", async () => {
    await expectCode(
      db.as(cy, `insert into public.sources (project_id, title, authors, created_by) values ($1, 'Bad', '[null]', $2)`, [projectId, cy]),
      PG.checkViolation,
    );
    await expectCode(
      db.as(cy, `insert into public.sources (project_id, title, authors, created_by) values ($1, 'Bad', '[{"family":5}]', $2)`, [projectId, cy]),
      PG.checkViolation,
    );
  });

  it("refuses a chosen created_at", async () => {
    await expectCode(add(cy, projectId, "created_at='2001-01-01'"), PG.insufficientPrivilege);
  });

  it("can't move a source to another project", async () => {
    const { rows } = await add(cy, projectId);
    await expectCode(
      db.as(cy, "update public.sources set project_id = $1 where id = $2", [otherProject, rows[0].id]),
      PG.insufficientPrivilege,
    );
  });

  it("accepts links in any letter case", async () => {
    const { rows } = await db.as(cy, `insert into public.sources (project_id, title, url, created_by) values ($1, 'Site', 'HTTPS://Example.org', $2) returning id`, [projectId, cy]);
    expect(rows).toHaveLength(1);
  });

  it("hides a deleted source and lets it be put back", async () => {
    const { rows } = await add(cy, projectId);
    const id = rows[0].id;
    await expectCode(db.as(cy, "delete from public.sources where id = $1", [id]), PG.insufficientPrivilege);
    // A commenter can't delete it; the person who added it can.
    await expectCode(db.as(dee, "select public.set_source_deleted($1, true)", [id]), PG.insufficientPrivilege);
    await db.as(cy, "select public.set_source_deleted($1, true)", [id]);
    const deleted = await db.as<{ deleted_at: string | null }>(ada, "select deleted_at from public.sources where id = $1", [id]);
    expect(deleted.rows[0].deleted_at).not.toBeNull();
    await db.as(ada, "select public.set_source_deleted($1, false)", [id]);
    const back = await db.as<{ deleted_at: string | null }>(ada, "select deleted_at from public.sources where id = $1", [id]);
    expect(back.rows[0].deleted_at).toBeNull();
  });

  it("lets a deleted DOI be added again", async () => {
    const first = await db.as<{ id: string }>(cy, "insert into public.sources (project_id, title, doi, created_by) values ($1, 'D', '10.1000/dup', $2) returning id", [projectId, cy]);
    await expectCode(db.as(cy, "insert into public.sources (project_id, title, doi, created_by) values ($1, 'D', '10.1000/DUP', $2)", [projectId, cy]), PG.uniqueViolation);
    await db.as(cy, "select public.set_source_deleted($1, true)", [first.rows[0].id]);
    const again = await db.as(cy, "insert into public.sources (project_id, title, doi, created_by) values ($1, 'D', '10.1000/dup', $2) returning id", [projectId, cy]);
    expect(again.rows).toHaveLength(1);
  });

  it("hides sources from outsiders", async () => {
    const { rows } = await db.as(eve, "select id from public.sources where project_id = $1", [projectId]);
    expect(rows).toHaveLength(0);
  });
});

describe("profiles", () => {
  it("refuses an over-long name", async () => {
    await expectCode(
      db.as(ada, "update public.profiles set full_name = repeat('x', 500) where id = $1", [ada]),
      PG.checkViolation,
    );
  });

  it("doesn't let people claim an ORCID iD by typing it", async () => {
    await expectCode(
      db.as(ada, "update public.profiles set orcid = '0000-0002-1825-0097' where id = $1", [ada]),
      PG.insufficientPrivilege,
    );
  });
});

describe("profile details and pictures", () => {
  it("lets people describe themselves and finish the welcome", async () => {
    await db.as(ada, "update public.profiles set position = 'PhD candidate', field = 'Marine ecology', onboarded_at = now() where id = $1", [ada]);
    const { rows } = await db.as(ada, "select position, field, onboarded_at from public.profiles where id = $1", [ada]);
    expect(rows[0]).toMatchObject({ position: "PhD candidate", field: "Marine ecology" });
    expect(rows[0].onboarded_at).not.toBeNull();
  });

  it("refuses an over-long position", async () => {
    await expectCode(db.as(ada, "update public.profiles set position = repeat('x', 200) where id = $1", [ada]), PG.checkViolation);
  });

  it("doesn't let anyone edit someone else's profile", async () => {
    await db.as(eve, "update public.profiles set full_name = 'Hacked' where id = $1", [ada]);
    const { rows } = await db.admin("select full_name from public.profiles where id = $1", [ada]);
    expect(rows[0].full_name).not.toBe("Hacked");
  });

  it("keeps picture links out of clients' hands", async () => {
    await expectCode(db.as(ada, "update public.profiles set avatar_url = 'https://tracker.example/p.gif' where id = $1", [ada]), PG.insufficientPrivilege);
    await expectCode(db.as(ada, "update public.profiles set avatar_path = 'x' where id = $1", [ada]), PG.insufficientPrivilege);
  });

  it("uploads pictures only into one's own folder", async () => {
    await db.as(ada, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ada}/me-1.webp`]);
    await expectCode(db.as(ada, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ben}/me-1.webp`]), PG.insufficientPrivilege);
    await expectCode(db.as(ada, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${ada}/../x.svg`]), PG.insufficientPrivilege);
  });

  it("sets a picture only from one's own finished upload", async () => {
    await db.as(ada, "select public.set_my_avatar($1)", [`${ada}/me-1.webp`]);
    const { rows } = await db.as(ben, "select avatar_path from public.profiles where id = $1", [ada]);
    expect(rows[0].avatar_path).toBe(`${ada}/me-1.webp`);
    // Someone else's picture, and one that was never uploaded.
    await expectCode(db.as(ben, "select public.set_my_avatar($1)", [`${ada}/me-1.webp`]), "22023");
    await expectCode(db.as(ada, "select public.set_my_avatar($1)", [`${ada}/missing.webp`]), "22023");
    await expectCode(db.as(null, "select public.set_my_avatar(null)"), PG.insufficientPrivilege);
  });

  it("removes both pictures when cleared", async () => {
    await db.admin("update public.profiles set avatar_url = 'https://lh3.googleusercontent.com/a/x' where id = $1", [ada]);
    await db.as(ada, "select public.set_my_avatar(null)");
    const { rows } = await db.admin("select avatar_path, avatar_url from public.profiles where id = $1", [ada]);
    expect(rows[0]).toEqual({ avatar_path: null, avatar_url: null });
  });
});

describe("deleting an account", () => {
  it("says what would happen to each project", async () => {
    const fay = await db.user("Fay");
    const solo = await db.project(fay);
    const shared = await db.project(fay, { [ben]: "author" });
    const coOwned = await db.project(fay, { [ben]: "owner" });
    const { rows } = await db.as<{ project_id: string; outcome: string }>(fay, "select project_id, outcome from public.account_deletion_preview()");
    const outcome = Object.fromEntries(rows.map((r) => [r.project_id, r.outcome]));
    expect(outcome).toEqual({ [solo]: "deleted", [shared]: "blocks", [coOwned]: "leaves" });
  });

  it("refuses while others depend on them as the only owner", async () => {
    const gil = await db.user("Gil");
    await db.project(gil, { [ben]: "author" });
    const { rows } = await db.admin<{ email: string }>("select email from auth.users where id = $1", [gil]);
    await expectCode(db.as(gil, "select public.delete_my_account($1)", [rows[0].email]), PG.raiseException);
  });

  it("needs the email address typed to confirm", async () => {
    const hal = await db.user("Hal");
    await expectCode(db.as(hal, "select public.delete_my_account('yes')"), "22023");
  });

  it("deletes the account, its solo projects, and leaves shared ones intact", async () => {
    const ivy = await db.user("Ivy");
    const solo = await db.project(ivy);
    const shared = await db.project(ben, { [ivy]: "author" });
    const doc = await db.document(shared, ivy);
    const { rows } = await db.admin<{ email: string }>("select email from auth.users where id = $1", [ivy]);
    await db.as(ivy, "select public.delete_my_account($1)", [` ${rows[0].email.toUpperCase()} `]);

    const left = await db.admin("select (select count(*) from auth.users where id = $1)::int as users, (select count(*) from public.profiles where id = $1)::int as profiles, (select count(*) from public.projects where id = $2)::int as solo, (select count(*) from public.project_members where user_id = $1)::int as memberships", [ivy, solo]);
    expect(left.rows[0]).toEqual({ users: 0, profiles: 0, solo: 0, memberships: 0 });
    const kept = await db.admin("select created_by from public.documents where id = $1", [doc]);
    expect(kept.rows[0].created_by).toBeNull();
  });

  it("can't be called signed out", async () => {
    await expectCode(db.as(null, "select public.delete_my_account('x')"), PG.insufficientPrivilege);
  });
});

describe("server-side document state", () => {
  const save = (doc: string, citations: unknown[], version?: { content?: unknown; label?: string; by?: string; gap?: string }) =>
    db.asService<{ id: string | null }>(
      "select public.save_document_state($1, '\\x0102'::bytea, $2, $3, $4, $5, $6, $7::interval, (select revision from public.document_state where document_id = $1)) as id",
      [doc, version?.label ?? "text", JSON.stringify(citations), version?.content === undefined ? null : JSON.stringify(version.content), version?.label ?? null, version?.by ?? null, version?.gap ?? null],
    );

  it("keeps the live document away from browsers", async () => {
    await save(documentId, []);
    const { rows } = await db.admin("select 1 from public.document_state where document_id = $1", [documentId]);
    expect(rows).toHaveLength(1);
    await expectCode(db.as(ada, "select ydoc from public.document_state"), PG.insufficientPrivilege);
    await expectCode(
      db.as(ada, "select public.save_document_state($1, '\\x00'::bytea, '', '[]'::jsonb)", [documentId]),
      PG.insufficientPrivilege,
    );
  });

  it("indexes citations of the project's own sources only", async () => {
    const own = await db.as<{ id: string }>(ada, "insert into public.sources (project_id, title, created_by) values ($1, 'Own', $2) returning id", [projectId, ada]);
    const foreign = await db.as<{ id: string }>(eve, "insert into public.sources (project_id, title, created_by) values ($1, 'Foreign', $2) returning id", [otherProject, eve]);
    await save(documentId, [
      { sourceId: own.rows[0].id, count: 3 },
      { sourceId: foreign.rows[0].id, count: 1 },
    ]);
    const { rows } = await db.as<{ source_id: string; citations: number }>(dee, "select source_id, citations from public.document_citations where document_id = $1", [documentId]);
    expect(rows).toEqual([{ source_id: own.rows[0].id, citations: 3 }]);
    const outsider = await db.as(eve, "select 1 from public.document_citations where document_id = $1", [documentId]);
    expect(outsider.rows).toHaveLength(0);
  });

  it("adds named versions, and automatic ones only when due", async () => {
    const doc = await db.document(projectId, ada);
    const named = await save(doc, [], { content: { type: "doc" }, label: "Draft 1", by: ben });
    expect(named.rows[0].id).toBeTruthy();
    // Within the gap: skipped.
    const early = await save(doc, [], { content: { type: "doc" }, label: "changed", gap: "10 minutes" });
    expect(early.rows[0].id).toBeNull();
    // No gap needed for a manual version, and the author is recorded.
    const { rows } = await db.as<{ label: string; created_by: string }>(dee, "select label, created_by from public.document_versions where document_id = $1", [doc]);
    expect(rows).toEqual([{ label: "Draft 1", created_by: ben }]);
  });

  it("skips malformed citation ids instead of failing the save", async () => {
    const doc = await db.document(projectId, ada);
    await save(doc, [{ sourceId: "deadbeef", count: 1 }, { sourceId: "--------", count: "x" }, "junk"]);
    const { rows } = await db.admin("select 1 from public.document_state where document_id = $1", [doc]);
    expect(rows).toHaveLength(1);
  });

  it("refuses a save based on an older revision", async () => {
    const doc = await db.document(projectId, ada);
    const write = (base: number | null) =>
      db.asService("select public.save_document_state($1, '\\x01'::bytea, '', '[]'::jsonb, null, null, null, null, $2::bigint)", [doc, base]);
    await write(null);
    await write(1);
    await expectCode(write(1), "40001");
    await expectCode(write(null), "40001");
    const { rows } = await db.admin<{ revision: string }>("select revision from public.document_state where document_id = $1", [doc]);
    expect(Number(rows[0].revision)).toBe(2);
  });

  it("refuses versions written by browsers", async () => {
    await expectCode(
      db.as(ada, "insert into public.document_versions (document_id, content, plain_text) values ($1, '{}', 'forged')", [documentId]),
      PG.insufficientPrivilege,
    );
  });
});

describe("saving as the signed-in person", () => {
  const memberSave = (as: string, doc: string, version?: { content: unknown; label: string }) =>
    db.as<{ id: string | null }>(
      as,
      "select public.member_save_document_state($1, '\\x0a0b'::bytea, 'member text', '[]'::jsonb, $2, $3) as id",
      [doc, version ? JSON.stringify(version.content) : null, version?.label ?? null],
    );

  it("lets people who can edit save, always in their own name", async () => {
    const doc = await db.document(projectId, ada);
    const saved = await memberSave(cy, doc, { content: { type: "doc" }, label: "By Cy" });
    expect(saved.rows[0].id).toBeTruthy();
    const { rows } = await db.as<{ label: string; created_by: string }>(dee, "select label, created_by from public.document_versions where document_id = $1", [doc]);
    expect(rows).toEqual([{ label: "By Cy", created_by: cy }]);
    const state = await db.as<{ ydoc: string }>(dee, "select encode(ydoc, 'hex') as ydoc from public.member_document_state($1)", [doc]);
    expect(state.rows[0].ydoc).toBe("0a0b");
  });

  it("refuses commenters and outsiders", async () => {
    await expectCode(memberSave(dee, documentId), PG.insufficientPrivilege);
    await expectCode(memberSave(eve, documentId), PG.insufficientPrivilege);
    await expectCode(db.as(eve, "select * from public.member_document_state($1)", [documentId]), PG.insufficientPrivilege);
  });

  it("refuses an unknown document", async () => {
    await expectCode(memberSave(ada, "00000000-0000-0000-0000-000000000000"), PG.insufficientPrivilege);
  });
});

describe("invite links", () => {
  it("shows a preview for the right token only, without the full address", async () => {
    const { rows } = await db.as<{ token: string }>(ben, "insert into public.project_invites (project_id, email, role) values ($1, 'zoe@uni.edu', 'contributor') returning token", [projectId]);
    const preview = await db.as(null, "select * from public.invite_preview($1)", [rows[0].token]);
    expect(preview.rows).toEqual([{ project_name: "Test project", inviter_name: "Ben", role: "contributor", email_hint: "z•••@uni.edu", state: "open" }]);
    const wrong = await db.as(null, "select * from public.invite_preview($1)", ["0".repeat(48)]);
    expect(wrong.rows).toHaveLength(0);
  });

  it("lets only the invited address accept, once", async () => {
    const zoe = await db.user("Zoe");
    await db.admin("update auth.users set email = 'zoe2@uni.edu' where id = $1", [zoe]);
    const { rows } = await db.as<{ token: string }>(ada, "insert into public.project_invites (project_id, email, role) values ($1, 'zoe2@uni.edu', 'commenter') returning token", [projectId]);
    await expectCode(db.as(eve, "select public.accept_project_invite($1)", [rows[0].token]), PG.raiseException);
    await db.as(zoe, "select public.accept_project_invite($1)", [rows[0].token]);
    const member = await db.as(zoe, "select role from public.project_members where project_id = $1 and user_id = $2", [projectId, zoe]);
    expect(member.rows).toEqual([{ role: "commenter" }]);
    const again = await db.as(null, "select state from public.invite_preview($1)", [rows[0].token]);
    expect(again.rows).toEqual([{ state: "used" }]);
  });

  it("withdraws invites from someone who can no longer invite", async () => {
    const fay = await db.user("Fay");
    const gus = await db.user("Gus");
    await db.admin("update auth.users set email = 'gus@uni.edu' where id = $1", [gus]);
    const project = await db.project(ada, { [fay]: "author" });
    const { rows } = await db.as<{ token: string }>(fay, "insert into public.project_invites (project_id, email, role) values ($1, 'gus@uni.edu', 'author') returning token", [project]);
    await db.as(ada, "delete from public.project_members where project_id = $1 and user_id = $2", [project, fay]);
    await expectCode(db.as(gus, "select public.accept_project_invite($1)", [rows[0].token]), PG.raiseException);
    const left = await db.admin("select 1 from public.project_invites where project_id = $1", [project]);
    expect(left.rows).toHaveLength(0);
  });
});

describe("project files", () => {
  const upload = (user: string, project: string, fileId: string, name = "paper.pdf", size = 1000) =>
    db.as(user, "insert into storage.objects (bucket_id, name, metadata) values ('project-files', $1, $2)", [
      `${project}/${fileId}/${name}`,
      JSON.stringify({ size, mimetype: "application/pdf" }),
    ]);
  const addRow = (user: string, project: string, fileId: string, name = "paper.pdf", extra: { client?: string } = {}) =>
    db.as(user, "insert into public.project_files (id, project_id, name, storage_path, uploaded_by) values ($1, $2, $3, $4, $5) returning size_bytes, mime_type", [
      fileId,
      project,
      name,
      `${project}/${fileId}/${name}`,
      extra.client ?? user,
    ]);

  it("lets editors upload into their project's folder and records Storage's size and type", async () => {
    const id = randomUUID();
    await upload(cy, projectId, id);
    const { rows } = await addRow(cy, projectId, id);
    expect(rows[0]).toMatchObject({ size_bytes: "1000", mime_type: "application/pdf" });
  });

  it("refuses uploads from commenters and outsiders, or outside a project folder", async () => {
    await expectCode(upload(dee, projectId, randomUUID()), PG.insufficientPrivilege);
    await expectCode(upload(eve, projectId, randomUUID()), PG.insufficientPrivilege);
    await expectCode(
      db.as(ada, "insert into storage.objects (bucket_id, name, metadata) values ('project-files', $1, '{}')", [`not-a-project/${randomUUID()}/x.pdf`]),
      PG.insufficientPrivilege,
    );
  });

  it("only lists files that were really uploaded", async () => {
    await expectCode(addRow(ada, projectId, randomUUID()), PG.checkViolation);
  });

  it("doesn't let a row point into another project's folder", async () => {
    const id = randomUUID();
    await upload(eve, otherProject, id);
    await expectCode(
      db.as(ada, "insert into public.project_files (id, project_id, name, storage_path, uploaded_by) values ($1, $2, 'x', $3, $4)", [id, projectId, `${otherProject}/${id}/paper.pdf`, ada]),
      PG.checkViolation,
    );
  });

  it("hides files and their contents from outsiders", async () => {
    const id = randomUUID();
    await upload(ada, projectId, id);
    await addRow(ada, projectId, id);
    expect((await db.as(eve, "select id from public.project_files where id = $1", [id])).rows).toHaveLength(0);
    expect((await db.as(eve, "select id from storage.objects where name like $1", [`${projectId}/%`])).rows).toHaveLength(0);
    expect((await db.as(dee, "select id from public.project_files where id = $1", [id])).rows).toHaveLength(1);
  });

  it("attaches files only to sources in the same project", async () => {
    const id = randomUUID();
    await upload(ada, projectId, id);
    await addRow(ada, projectId, id);
    const { rows: theirs } = await db.as<{ id: string }>(eve, "insert into public.sources (project_id, title, created_by) values ($1, 'Theirs', $2) returning id", [otherProject, eve]);
    await expectCode(db.as(ada, "update public.project_files set source_id = $1 where id = $2", [theirs[0].id, id]), PG.checkViolation);
    const { rows: ours } = await db.as<{ id: string }>(ada, "insert into public.sources (project_id, title, created_by) values ($1, 'Ours', $2) returning id", [projectId, ada]);
    await db.as(ada, "update public.project_files set source_id = $1 where id = $2", [ours[0].id, id]);
  });

  it("doesn't let clients change a file's recorded size", async () => {
    const id = randomUUID();
    await upload(ada, projectId, id);
    await addRow(ada, projectId, id);
    await expectCode(db.as(ada, "update public.project_files set size_bytes = 1 where id = $1", [id]), PG.insufficientPrivilege);
  });

  it("lets owners and the uploader delete files, but not other contributors", async () => {
    const id = randomUUID();
    await upload(ben, projectId, id);
    await addRow(ben, projectId, id);
    const c = await db.as(cy, "delete from public.project_files where id = $1", [id]);
    expect(c.rowCount).toBe(0);
    const owner = await db.as(ada, "delete from public.project_files where id = $1", [id]);
    expect(owner.rowCount).toBe(1);
  });
});
