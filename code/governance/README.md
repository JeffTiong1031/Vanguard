# code/governance

Governance/policy platform, ported from the FastAPI + SQLite demo in `code/policy/` (kept as
read-only reference, not modified by this app) to Next.js 15 (App Router, TypeScript) on Vercel +
Supabase (Postgres, RLS, Auth). This directory is the app skeleton only — no product/domain logic
yet; that lands in later tasks on top of the client factories below.

Plain CSS, no Tailwind — matches `code/extension`'s no-Tailwind convention. No `src/` directory.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in real values, see below
npm run dev                  # http://localhost:3000
```

Local Supabase (`supabase/config.toml` is already committed, from `supabase init`) requires **Docker
Desktop** to run:

```bash
npx supabase start           # requires Docker; prints local URL + anon/service-role keys
npx supabase status          # re-print those values later
```

Copy the printed `API URL` into `NEXT_PUBLIC_SUPABASE_URL`, `anon key` into
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `service_role key` into `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local`. For a hosted/deployed environment, use the equivalent values from the Supabase project
dashboard instead.

## Environment variables

`.env.example` documents three, and the naming is intentionally not a literal match to the
originating task brief's wording — worth stating plainly so it isn't mistaken for drift later:

| Var | Prefix | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_` | Read by `browserClient()`, which runs in the browser. Next.js only inlines `NEXT_PUBLIC_`-prefixed vars into the client bundle — an unprefixed name would read as `undefined` there regardless of `.env.local`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_` | Same reason. Still safe to ship to the browser — it's the anon key, subject to Row Level Security. |
| `SUPABASE_SERVICE_ROLE_KEY` | *(none — server-only)* | Bypasses RLS. Never prefix this. `lib/supabase/service.ts` throws at call time if it's absent, which — because Next.js never exposes unprefixed vars client-side — doubles as a guard against the key silently shipping into a browser bundle. |

## The three Supabase clients (`lib/supabase/`)

- **`browserClient()`** (`browser.ts`) — Client Components. Anon key + the user's session, subject to
  RLS.
- **`serverClient()`** (`server.ts`) — Server Components, Server Actions, Route Handlers. Async
  (`next/headers`'s `cookies()` is async in this Next version). Anon key + the user's session via
  cookies, subject to RLS. The `setAll` cookie write is wrapped in try/catch: Server Components can
  read cookies but not set them, and that call is expected to throw there — safe to ignore as long as
  session refresh happens in middleware.
- **`serviceClient()`** (`service.ts`) — server-only, privileged, bypasses RLS entirely. Only call
  this from server-only code paths. Throws immediately if `SUPABASE_SERVICE_ROLE_KEY` is unset.

## Known gap

`supabase start` needs Docker Desktop, which was not available in the environment this scaffold was
built in. Everything that doesn't depend on a running local Postgres — the Next app itself, the three
client factories, `supabase init`'s config — was built and verified (`npm run build` passes cleanly).
Whoever picks this up with Docker available should run `supabase start` once to confirm the local
stack actually comes up end-to-end before building on top of it.
