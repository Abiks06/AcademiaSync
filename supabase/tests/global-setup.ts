import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const TEST_DB = "academiasync_test";

/** Builds a fresh database: the Supabase shim, then every migration in order. */
export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to a Postgres superuser connection to run the database tests.");

  const admin = new Client({ connectionString: url });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const testUrl = new URL(url);
  testUrl.pathname = `/${TEST_DB}`;
  process.env.TEST_DATABASE_URL = testUrl.toString();

  const db = new Client({ connectionString: testUrl.toString() });
  await db.connect();
  // Roles are cluster-wide, so a second run finds them already there.
  const { rowCount } = await db.query("select 1 from pg_roles where rolname = 'authenticated'");
  const shim = readFileSync(join(__dirname, "supabase-shim.sql"), "utf8");
  await db.query(rowCount ? shim.replace(/^create role .*$/gm, "") : shim);

  const dir = join(__dirname, "..", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.query(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  await db.end();
}
