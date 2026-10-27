import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, PG } from "./db";

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

describe("server-side document state", () => {
  const save = (doc: string, citations: unknown[], version?: { content?: unknown; label?: string; by?: string; gap?: string }) =>
    db.asService<{ id: string | null }>(
      "select public.save_document_state($1, '\\x0102'::bytea, $2, $3, $4, $5, $6, $7::interval) as id",
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
    const state = await db.as<{ ydoc: string }>(dee, "select encode(public.member_document_state($1), 'hex') as ydoc", [doc]);
    expect(state.rows[0].ydoc).toBe("0a0b");
  });

  it("refuses commenters and outsiders", async () => {
    await expectCode(memberSave(dee, documentId), PG.insufficientPrivilege);
    await expectCode(memberSave(eve, documentId), PG.insufficientPrivilege);
    await expectCode(db.as(eve, "select public.member_document_state($1)", [documentId]), PG.insufficientPrivilege);
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
});
