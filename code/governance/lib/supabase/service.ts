import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses Row Level Security entirely —
 * server-only, privileged. Never import this into a Client Component or any
 * module that ends up in the browser bundle.
 *
 * The guard below is not cosmetic: Next.js only inlines NEXT_PUBLIC_-prefixed
 * env vars into client-side code, so SUPABASE_SERVICE_ROLE_KEY always reads
 * as undefined in real browser-executed JS, regardless of what's set in
 * .env.local. That means "the env var is absent" and "this got bundled into
 * the browser" collapse into the same observable condition, and checking for
 * the former at call time catches the latter for free.
 *
 * Deliberately a call-time check inside the function body, not a
 * module-top-level throw: a top-level throw fires the moment anything
 * imports this file, including during `next build`'s static module-graph
 * tracing, which could break a build in an environment where the var isn't
 * set yet even though the function itself is never called. A call-time
 * throw still guarantees failure on any real invocation without the key.
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "serviceClient(): SUPABASE_SERVICE_ROLE_KEY is not set. This is " +
        "either a missing server env var, or this module was evaluated in " +
        "browser-bundled code, where the key is never exposed.",
    );
  }
  if (!url) {
    throw new Error("serviceClient(): NEXT_PUBLIC_SUPABASE_URL is not set.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
