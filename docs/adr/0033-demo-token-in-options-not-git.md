# ADR 0033 — Hosted demo token lives in Options, not git

**Status:** Accepted · **Date:** 2026-07-22 · **Decider:** the founder
**Related:** [hosted demo design](../superpowers/specs/2026-07-21-hosted-demo-file-backend-design.md)
(§5.2–5.3 amended) · Path A · public repo `JeffTiong1031/Vanguard`

## Context

Path A baked `DEMO_TOKEN` into `config.ts` and committed `dist/` so clone → Load unpacked needed
no paste step. That assumed a **private** repo. The repo is **public**. PR #20 would have published
the live Render gate token to anyone reading GitHub. `.gitignore` alone cannot fix a committed
`dist/` that teammates load without rebuilding.

## Options

1. **Merge baked token anyway** — casual deterrent only; key world-readable.
2. **Make the repo private** — keep Path A as designed; org/process change.
3. **Paste in Options** — `chrome.storage.local`; key out-of-band; no rebuild on rotate.

## Decision

**Option 3.** Extension reads `vg_demo_token` from Options. Hosted URL with empty key fails closed
with a message naming Options. Localhost with empty key omits `Authorization` (backend gate off when
`VANGUARD_DEMO_TOKEN` unset). PR #20 must **not** merge with the burned value; rotate Render env
after the old token is treated as public.

## Consequences

- Teammates: one extra Options paste for hosted demos.
- Rotate = Render dashboard + resend key; **no** `dist/` rebuild.
- Old committed/PR values are burned; do not reuse them.
