import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components — runs in the browser, subject to
 * Row Level Security under the calling user's session (anon key + JWT).
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Both must
 * be NEXT_PUBLIC_-prefixed: Next.js only inlines env vars with that prefix
 * into the client bundle, so anything unprefixed would read as undefined
 * here regardless of what's set in .env.local.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
