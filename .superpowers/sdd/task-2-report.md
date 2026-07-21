# Task 2 Report: Zod `parseStrict` / `validationResponse` (I3 port)

## What I implemented

Two files, as scoped:

- `code/governance/lib/validate.ts` — implementation.
  - `export class ValidationError extends Error` — wraps a `z.ZodError`. `parseStrict` throws this
    (never a raw `ZodError`) so `validationResponse` has one narrow input type.
  - `export function parseStrict<T>(schema: z.ZodType<T>, body: unknown): T` — calls
    `schema.safeParse(body)`; returns `result.data` on success, throws `ValidationError` on failure.
    Does not force `.strict()` itself — the brief's example builds the schema with `.strict()` at
    the call site.
  - `export function validationResponse(err: ValidationError): Response` — maps
    `err.zodError.issues` through a private `formatIssue()` that **allowlists** exactly
    `{code, path, message}` (never spreads the raw issue object), and returns a standard web
    `Response` with `status: 422` and JSON body `{ detail: [...] }`.
  - `path` segments are mapped through `typeof segment === "symbol" ? segment.toString() : segment`
    because Zod v4's `issue.path` is typed `PropertyKey[]` (can include `symbol`), and
    `JSON.stringify` silently turns a bare `symbol` array element into `null` — stringifying it
    explicitly keeps the path legible instead of silently dropping information.

- `code/governance/lib/validate.test.ts` — tests (5 total; brief specified 2, I added 3 more
  covering the "never spread the issue" contract and `parseStrict`'s own success/failure behavior,
  since this is the privacy-critical file the brief singles out).
  - The brief's exact test (verbatim from the brief, using a local `catchParse` test helper — see
    below).
  - A second test: a **missing**-field error (`pseudo_id` omitted) where a *different*, present,
    allowed field (`note`) carries the sensitive string — reproducing the FastAPI bug's actual shape
    (a `missing` error's `input` can be the *whole body*, not just the missing field). Asserts the
    sensitive string never appears in the response.
  - A structural test asserting every issue in the response body has *exactly* the keys
    `code`/`message`/`path` — nothing else, and explicitly not `received` or `input`.
  - Two `parseStrict`-only tests: returns parsed data on success; throws `ValidationError` (not a
    bare `ZodError`) on failure.

`catchParse` (from the brief's example) is **not** a produced interface — it's test-local plumbing
that calls `parseStrict`, catches the thrown `ValidationError`, and returns it, exactly as the task
instructions describe it ("however you get from a failed parse to what `validationResponse`
consumes").

## TDD Evidence

### RED

Command: `cd code/governance && npx vitest run lib/validate.test.ts`

Output (before `lib/validate.ts` existed):

```
 RUN  v4.1.10 C:/Jeff/UM AI/Y1 Sem break/HackAttack/code/governance

 ❯ lib/validate.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  lib/validate.test.ts [ lib/validate.test.ts ]
Error: Cannot find module './validate' imported from C:/Jeff/UM AI/Y1 Sem break/HackAttack/code/governance/lib/validate.test.ts
 ❯ lib/validate.test.ts:3:1
      1| import { describe, expect, test } from "vitest";
      2| import { z } from "zod";
      3| import { parseStrict, ValidationError, validationResponse } from "./va…
       | ^

 Test Files  1 failed (1)
      Tests  no tests
```

This is the expected failure: the module doesn't exist yet, not an unrelated error (no assertion
failures, no syntax errors in the test file itself — the test file's own logic was never reached).

### GREEN

Command: `cd code/governance && npx vitest run lib/validate.test.ts --reporter=verbose`

Output (after implementing `lib/validate.ts`, including the `PropertyKey`/`symbol` typing fix):

```
 RUN  v4.1.10 C:/Jeff/UM AI/Y1 Sem break/HackAttack/code/governance

 ✓ lib/validate.test.ts > validationResponse > 422 body never echoes the rejected value 21ms
 ✓ lib/validate.test.ts > validationResponse > missing-field error does not echo the request body 1ms
 ✓ lib/validate.test.ts > validationResponse > response body never includes a received/input field from the issue 1ms
 ✓ lib/validate.test.ts > parseStrict > returns the parsed value on success 0ms
 ✓ lib/validate.test.ts > parseStrict > throws ValidationError (not a raw ZodError) on failure 0ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  04:12:32
   Duration  364ms (transform 41ms, setup 0ms, import 135ms, tests 26ms, environment 0ms)
```

Also ran the whole project's test suite (`npx vitest run`, no path filter) — same 1 file / 5 tests,
confirming nothing else in `code/governance` was affected. `npx tsc --noEmit -p tsconfig.json`
exits 0. `npx eslint lib/validate.ts lib/validate.test.ts` produces no output (clean).

## Files changed

- `code/governance/lib/validate.ts` (new)
- `code/governance/lib/validate.test.ts` (new)

## Self-review findings

- **Actual RED before GREEN, evidence above** — yes, shown above verbatim.
- **Does the 422 body literally contain zero characters of `900101` / `my NRIC`?** Verified by
  direct inspection, not by trusting the test: ran a throwaway script (created and deleted within
  this session, never committed) that called `validationResponse` on the brief's exact failing
  input and printed the raw response body to the terminal:
  ```
  STATUS:422
  BODY:{"detail":[{"code":"invalid_type","path":["pseudo_id"],"message":"Invalid input: expected string, received number"},{"code":"unrecognized_keys","path":[],"message":"Unrecognized key: \"prompt\""}]}
  ```
  Confirmed by eye: no `900101`, no `my NRIC`, anywhere in that string.
- **Note on this Zod version specifically:** for `zod@4.4.3`, `ZodIssue` objects for `invalid_type`
  and `unrecognized_keys` do not actually carry a literal `received`/`input` field holding the raw
  value (unlike the Pydantic case this ports from) — `message` interpolates a *type name*
  ("received number"), never the value itself, and `unrecognized_keys` only carries the offending
  *key names*, not their values. So for this Zod version, even a naive `{...issue}` spread would not
  have leaked the two specific strings the brief's test checks for. **I did not rely on that** —
  `formatIssue()` still allowlists exactly `{code, path, message}` rather than spreading, both
  because the brief explicitly asks for it and because other issue codes (e.g. `invalid_union`,
  which carries nested `unionErrors`) or a future Zod version could reintroduce a raw-value field,
  and an allowlist doesn't care which fields exist upstream.
- **Is `message` free of interpolated values in every code path, not just the tested one?** Audited:
  `formatIssue()` copies `issue.message` verbatim in all cases — this file never constructs a
  message itself, so the "no interpolation" guarantee is inherited entirely from Zod's built-in
  messages (which use type names, confirmed above) plus whatever message a caller's own
  `.refine()`/`.superRefine()` supplies. That last case is **outside this file's control** — a
  future caller could write `.refine(v => ..., { message: `bad value: ${v}` })` and leak through
  `message` regardless of what `validate.ts` does. Documented this boundary explicitly in the
  `formatIssue` JSDoc (mirrors `finding_hash`'s validator convention in
  `code/policy/app/models.py`, which names the format rather than quoting the rejected value) so a
  future caller writing a schema with a custom refinement message is warned at the point they'd
  introduce the leak, not silently trusted.
- **`path` typing:** `tsc --noEmit` caught a real type mismatch — Zod v4's `issue.path` is
  `PropertyKey[]` (includes `symbol`), not `(string | number)[]`. Fixed by mapping any `symbol`
  segment through `.toString()` rather than widening the output type or ignoring the error, because
  `JSON.stringify` on a raw `symbol` array element silently produces `null` in the response body —
  a silent information-loss bug, not a privacy leak, but still worth closing rather than leaving in
  place.
- **Test output pristine:** confirmed — no warnings in the vitest run for `validate.test.ts` or the
  full suite. (An unrelated `node --input-type=module` CLI probe I ran manually during
  investigation printed a `MODULE_TYPELESS_PACKAGE_JSON` warning to *my own terminal* — that was not
  from vitest, not from a committed file, and is not part of the test output.)
- Temporary inspection script (`lib/_tmp_print.test.ts`) was created and deleted within this
  session; `git status` confirms only the two intended files are new/untracked in `lib/`.
- **Stale prior report file:** `.superpowers/sdd/task-2-report.md` already existed on disk before
  this task started, containing a report for an unrelated, earlier "Task 2" (Python/FastAPI
  `decision_appeals` employee-appeal routes, commit `4734add`) — the repo's task numbering was
  evidently reshuffled at some point (the working tree also shows uncommitted edits to
  `task-1-brief.md` and `task-2-brief.md` predating this session, replacing the appeals-table task
  with the current scaffold/Zod tasks). That stale report has been overwritten with this one, per
  the current brief's instruction to write the report to this exact path. Flagging in case the old
  content (or the commit it describes) matters to the founder's tracking — I have not touched
  `code/policy/` in this task.

## Issues or concerns

None on the implementation itself. Scope stayed to exactly the two files requested; no
routes/schemas/Supabase code touched. See the stale-report note above — surfacing it rather than
silently discarding history, since CLAUDE.md's standing rule is to distrust and flag exactly this
kind of internal-reference drift.

---

## Addendum: I3 review finding fixed — `strictObject` helper (2026-07-22)

### The finding (Important, from task review)

> `parseStrict` doesn't enforce `.strict()` itself (`validate.ts:128-134`) — strictness is entirely
> the calling schema's responsibility. Since this is "the foundational privacy control... used
> everywhere it's used later," a future call site that builds a schema without `.strict()` silently
> reintroduces the extra-field leak with no signal from this utility. The JSDoc discloses this
> honestly, but the function name invites the opposite assumption.

### What I changed

Kept `parseStrict`'s signature and behavior unchanged — it still accepts any `z.ZodType<T>` (not just
object schemas, e.g. `z.string()` is a legitimate caller), so it structurally cannot assert "the
schema must be strict" itself: that concept only applies to object schemas, and a runtime
introspection check would be fragile across Zod versions and would wrongly constrain non-object
callers. Confirmed this reasoning by reading the current file rather than assuming it — took the
scoped fix as given since it matched what the code actually allows.

Two additions, both in `code/governance/lib/validate.ts`:

1. **New exported helper**: `export function strictObject<T extends z.ZodRawShape>(shape: T)` —
   returns `z.object(shape).strict()`. Left the return type to inference (no explicit
   `z.ZodObject<T, "strict">` annotation) because this repo pins `zod@4.4.3`, and Zod v4's
   `ZodObject` generic parameters differ from v3's `(Shape, UnknownKeys, Catchall)` triple that an
   explicit annotation would assume — inference avoids hard-coding a v3-shaped type signature against
   a v4 library. Verified with `npx tsc --noEmit -p .` (clean, no errors).
2. **JSDoc update on `parseStrict`**: added a paragraph explaining why `parseStrict` can't enforce
   strictness itself, and pointing callers at `strictObject` for the common object-schema case instead
   of `z.object(shape).strict()`. Also added a short JSDoc block on `strictObject` itself.

No changes to `parseStrict`'s signature, its runtime behavior, or the existing tests' assertions —
purely additive.

### New test

Added to `code/governance/lib/validate.test.ts`, a new `describe("strictObject", ...)` block:

```ts
test("rejects unknown keys the same way a manually-.strict()'d schema does", () => {
  const schema = strictObject({ pseudo_id: z.string() });
  const err = catchParse(schema, { pseudo_id: "abc", prompt: "extra field" });
  expect(err.zodError.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(
    true,
  );
});
```

Reuses the existing `catchParse` test helper already in the file rather than duplicating it.

### Test run — full suite, `code/governance`

Command: `npm run test` (equivalently `npx vitest run lib/validate.test.ts`)

```
> governance@0.1.0 test
> vitest run


 RUN  v4.1.10 C:/Jeff/UM AI/Y1 Sem break/HackAttack/code/governance


 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  04:24:24
   Duration  306ms (transform 35ms, setup 0ms, import 106ms, tests 22ms, environment 0ms)
```

6/6 passing (the original 5 plus the new `strictObject` test), output pristine. `npx tsc --noEmit -p .`
also exits clean with no errors.

### Commit

New commit on `code/governance-scaffold-task-1-2` (not an amend of `d841b9f`), sole author, no
`Co-Authored-By` trailer: `fix(governance): add strictObject helper so callers can't skip .strict() (I3)`.
