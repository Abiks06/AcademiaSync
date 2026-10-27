# AcademiaSync

The research workspace where a team's manuscript, sources, data and collaborators stay in sync.

This is the v2 rebuild. v1 kept all data in server memory and faked authentication, so accounts and
documents disappeared on every restart. v2 is built on one rule: **one system per job, one source of
truth per piece of data, and nothing that fakes success.**

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Motion | [Motion](https://motion.dev) (`motion/react`), respecting reduced-motion settings |
| Auth | Supabase Auth: Google, Microsoft and email magic links |
| Database | Supabase Postgres with row-level security on every table |
| Live editing | Liveblocks + Yjs through Tiptap; access decided by the database |

## What's in this phase

- Animated landing page with a live preview of co-writing, citations and review flags
- Sign-in with Google, Microsoft or a magic link, with session refresh in `src/proxy.ts`
- Signed-in workspace: project list, create project, project overview, add manuscripts
- Database schema with row-level security (`supabase/migrations`)
- Live editor: real-time co-writing with cursors, presence, comments and version history
- Reference library per project: add sources by DOI (Crossref) or by hand, search, copy APA references, export BibTeX
- In-text citations from the editor (Ctrl/Cmd+Shift+K) and a live bibliography panel
- CI that lints, type-checks, tests and builds every pull request

## Set up

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations in `supabase/migrations/`, in filename order (SQL editor, or `npx supabase db push` once linked).
3. In **Authentication → URL configuration**, set the site URL and add
   `http://localhost:3000/auth/callback` (and your production URL) to the redirect URLs.
4. Optional: enable the **Google** and **Azure (Microsoft)** providers under
   **Authentication → Providers**. Email magic links work without this.
5. Before inviting real users, add your own email service under **Authentication → Emails → SMTP
   settings** (Resend, Postmark, SendGrid…). Supabase's built-in sender only delivers to members of
   your Supabase organization and is heavily rate-limited.
6. Create a free [Liveblocks](https://liveblocks.io) project and copy its **secret key**.
7. Copy `.env.example` to `.env.local` and fill in the project URL, publishable key and Liveblocks secret key. In production,
   also set `NEXT_PUBLIC_SITE_URL` to the public address so sign-in links point there.
8. Install and run:

```bash
npm install
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm test` | Unit tests (vitest) |

## Project layout

```
src/
  app/
    page.tsx                 landing page
    (auth)/sign-in/          sign-in screen and server actions
    auth/callback, sign-out  session routes
    (app)/projects/          signed-in workspace
  components/
    landing/                 landing page sections
    app/                     workspace UI
    motion/                  shared animation primitives
  lib/supabase/              browser, server and proxy clients, database types
  proxy.ts                   refreshes sessions, guards signed-in pages
supabase/migrations/         schema and row-level security
```
