import { defineConfig } from "@playwright/test";

/**
 * Two-browser tests against a running AcademiaSync with real Supabase and Liveblocks.
 * Set E2E_BASE_URL (a preview deployment, or http://localhost:3000), the public Supabase
 * settings and SUPABASE_SECRET_KEY; the tests create their own users and clean up after.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: "retain-on-failure",
  },
});
