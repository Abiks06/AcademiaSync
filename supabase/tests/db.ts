import { randomUUID } from "node:crypto";
import { Client } from "pg";

/**
 * A connection for one test file. `as(user)` runs a query the way PostgREST would
 * for that signed-in user: as the `authenticated` role, with their id in the JWT claims,
 * so row-level security and column grants apply exactly as in production.
 */
export async function connect() {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();

  async function as<T extends Record<string, unknown> = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []) {
    await client.query("begin");
    try {
      await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
      ]);
      const result = await client.query<T>(sql, params);
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }

  /** Runs as the database owner, bypassing row-level security, for setup and checks. */
  const admin = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    client.query<T>(sql, params);

  /** A signed-up user with a profile (made by the signup trigger). */
  async function user(name: string) {
    const id = randomUUID();
    await admin("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [
      id,
      `${name.toLowerCase()}-${id.slice(0, 8)}@example.edu`,
      JSON.stringify({ full_name: name }),
    ]);
    return id;
  }

  /** A project owned by `owner`, with the given extra members. */
  async function project(owner: string, members: Record<string, string> = {}) {
    const { rows } = await as<{ id: string }>(owner, "insert into public.projects (name, created_by) values ('Test project', $1) returning id", [owner]);
    const id = rows[0].id;
    for (const [userId, role] of Object.entries(members)) {
      await admin("insert into public.project_members (project_id, user_id, role) values ($1, $2, $3)", [id, userId, role]);
    }
    return id;
  }

  async function document(projectId: string, owner: string) {
    const { rows } = await as<{ id: string }>(owner, "insert into public.documents (project_id, created_by) values ($1, $2) returning id", [projectId, owner]);
    return rows[0].id;
  }

  return { client, as, admin, user, project, document, end: () => client.end() };
}

/** Postgres error codes the tests expect. */
export const PG = {
  insufficientPrivilege: "42501",
  checkViolation: "23514",
  uniqueViolation: "23505",
  raiseException: "P0001",
};
