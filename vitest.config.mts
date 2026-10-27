import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // Tests run server modules directly; the marker package only matters to the Next.js bundler.
  "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        resolve: { alias },
        // Row-level security and grants, against a real Postgres with the migrations applied.
        // Needs DATABASE_URL (a superuser connection); `npm run test:db` and CI set it.
        test: {
          name: "db",
          include: ["supabase/tests/**/*.test.ts"],
          globalSetup: ["supabase/tests/global-setup.ts"],
          fileParallelism: false,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
