import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers
 * — carries the calling user's session via cookies, subject to Row Level
 * Security under that session (anon key + JWT). This is the user-scoped
 * server client; for privileged, RLS-bypassing access use service.ts instead.
 *
 * Async because `cookies()` from `next/headers` is async in this Next
 * version. The `setAll` write is wrapped in try/catch because Server
 * Components are allowed to read cookies but not set them — that call is
 * expected to throw there, and is safe to ignore as long as session refresh
 * happens in middleware.
 */
export async function serverClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, which cannot set cookies.
            // Safe to ignore if session refresh happens in middleware.
          }
        },
      },
    },
  );
}
