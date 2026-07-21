import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

/**
 * Shared RLS-test plumbing, first used by rls_core.test.ts (Task 3) and
 * meant to be reused by later RLS tasks (4, 5, 6) -- keep this file small
 * and generic; don't grow table-specific assertions into it.
 *
 * Needs a real local Supabase stack (`npx supabase start` -- Postgres +
 * PostgREST + GoTrue via Docker) to actually run against. Every export here
 * talks to a real server over HTTP; nothing is mocked. See
 * task-governance-3-report.md for why this could only be self-reviewed,
 * not executed, in the environment this was written in (no Docker there).
 *
 * Why hand-signed JWTs instead of a real sign-in round trip: this app uses
 * Supabase Auth headlessly (no password UI to drive in a test), and a real
 * email/OTP sign-in per test is slow and flaky. Signing a JWT with the same
 * secret Supabase Auth uses locally produces a token PostgREST accepts
 * exactly as it would one GoTrue issued: `auth.uid()` reads the `sub`
 * claim, and PostgREST picks the Postgres role from the `role` claim. The
 * membership row a test relies on is still a real row inserted via the
 * service-role client -- only the token *minting* is faked, not the data
 * or the policy evaluation.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

// Fixed local-dev defaults that `supabase start` issues unless
// supabase/config.toml sets a custom `auth.jwt_secret` (this repo's
// config.toml doesn't -- see the commented-out "Path to JWT signing key"
// line there). These three values are the publicly documented Supabase
// local/self-hosting demo credentials, not a real secret; safe to commit.
// If a later task switches to a custom signing key, set the matching env
// var below rather than editing these fallbacks.
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";
const DEFAULT_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q";
const DEFAULT_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_ANON_KEY;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SERVICE_ROLE_KEY;

const JWT_SECRET = process.env.SUPABASE_AUTH_JWT_SECRET ?? DEFAULT_JWT_SECRET;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Signs a minimal HS256 JWT good enough for PostgREST/RLS: `role` and
 * `aud` = "authenticated" (the Postgres role every policy in
 * 0001_core.sql is written against), a 1-hour expiry, and the caller's
 * `sub` (an `auth.users.id`). No JWT library needed -- HS256 is a header +
 * payload + one HMAC-SHA256 over both, base64url-encoded.
 */
export function signTestJwt(claims: { sub: string }): string {
  const header = { alg: "HS256", typ: "JWT" };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    sub: claims.sub,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const signature = base64url(
    createHmac("sha256", JWT_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest(),
  );
  return `${headerPart}.${payloadPart}.${signature}`;
}

/**
 * Service-role client for test seeding/cleanup only. Bypasses RLS
 * entirely -- never use this to make the assertion a test is actually
 * checking, only to arrange/tear down fixture rows.
 */
export function serviceTestClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Anon-key client carrying a hand-signed JWT for `userId` -- this is the
 * client whose queries are actually subject to RLS, i.e. the one every
 * assertion should run through.
 */
export function clientAsUser(userId: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${signTestJwt({ sub: userId })}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
