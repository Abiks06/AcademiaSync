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
