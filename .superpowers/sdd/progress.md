# Slice 1 SDD Progress Ledger

Plan: docs/superpowers/plans/2026-07-18-slice-1-chat-text-extension.md
Branch: slice-1-chat-text-extension
Base: 5dbfd8d

Task 1: complete (commits 5dbfd8d..0158ce4, review clean). Minors: Step6 deferred; README still says STUBS; jsx tsconfig deferred to modal task.
Task 2: complete (commits 0158ce4..6e6e0c6, review clean after 1 fix loop). Negative drift test added; drift build spreads wxt.config.ts. Minor: orphan .wxt-drift.config.mjs if killed mid-build.

## Task 3 pre-flight: L2 model download verification (2026-07-18)
Binding gate (founder): verify NER checkpoint + ONNX/int8 freely downloadable before Task 3.
- Model: Xenova/bert-base-multilingual-cased-ner-hrl (token-classification NER; PER/ORG/LOC/MISC)
- HF API: gated=False, disabled=False -> public, no auth
- Files HTTP 206 (exist, range-downloadable, no auth):
  onnx/model_int8.onnx, onnx/model_quantized.onnx, tokenizer.json, config.json
- License: derived from Davlan/bert-base-multilingual-cased-ner-hrl = AFL-3.0 (OSI-approved, free/OSS).
  Xenova repo = ONNX conversion for transformers.js; AFL-3.0 permits derivatives/redistribution.
- VERDICT: PASS. Free public OSS model, no paid API/weights. Plan's chosen checkpoint STANDS; no substitution needed.
Task 3: complete (commits 6e6e0c6..bbcc575, review clean after 1 fix loop).
  - L2 checkpoint verified free/OSS before build (AFL-3.0).
  - transformers.js v3: dtype:'q8' -> pins onnx/model_quantized.onnx (config/tokenizer/tokenizer_config pinned; vocab.txt not fetched).
  - FIX: pipeline call uses ignore_labels:[] so attachCharOffsets gets full ordered stream (recurring-substring offset bug).
  - Self-hosted ORT wasm (public/ort, +21.6MB dist) to avoid jsdelivr CDN vs MV3 CSP.
  RESIDUAL RISKS carried to Task 14 acceptance (live-browser):
    (R1) threaded-ORT wasm + numThreads=1 without COOP/COEP -> verify L2 actually initializes; fails safe to advisory.
    (R2) hash-pin cache-key + weights fetch works end-to-end in browser.
    (R3) minor: messages.ts comment overstates [CLS]/[SEP] reaching attachCharOffsets (filtered upstream) - cosmetic.
Task 4: complete (commits bbcc575..2788d28, review clean, 0 Critical/Important). L1 detectors + 1+1 guardrail (16 clean cases -> []). Minors: dedupe test doesn't force SSM overlap; 'fully contained' comment imprecise.
Task 5: complete (commits 2788d28..93c26b4, VerdictCache monotonic-toward-dirty, 4 tests).
DIST-SYNC (commit 8e4a8d8): Task 3 fix's rebuilt dist was not staged into bbcc575 -> committed bundle lagged source.
  Rebuilt; committed offscreen chunk now contains ignore_labels fix; drift green. Team's dist is correct.
  FOLLOW-UP (Task 2 drift check): byte-hash is CRLF/LF sensitive on Windows -> check:dist may false-fail on a fresh CRLF clone vs LF build. Not blocking (team loads dist, doesn't run check). Flag for final review.
  PROCESS: every task touching bundled source (entrypoints/, imported src) MUST rebuild+stage dist. Pure-source tasks (L1, cache) do not change the bundle until wired in Task 12.
Task 5: review clean (Approved). Strategy: strip trailers for Tasks 6-14 in one final filter-branch pass before whole-branch review.
Task 6: complete+clean (commit b5cc31d, base 8e4a8d8). scanInto: L1 short-circuit + L2 completion + degraded (no fabricated CLEAN). 58/58. TRAILER present (strip at end).
Task 7: complete+clean (commit de092ec, base b5cc31d). window-capture gate; decideGate pure (cold->BLOCK fail-safe, hash-bound approval, isComposing pass-through, composedPath, stop+preventDefault). 65/65. TRAILER present.

Task 8: complete (commit 5998b13, base de092ec). ChatGPT+Claude adapters; writeText no auto-submit; registry 5/5. Selectors [verify] live at Task 14. TRAILER present. Controller lightweight Approved (session pause).
SESSION PAUSED 2026-07-18 after Task 8. Handoff: .superpowers/sdd/HANDOFF-2026-07-18-slice-1.md
NEXT: Task 9 (monotonic numbering + placeholder rewrite). HEAD=5998b13

Task 9: complete (commits 5998b13..a444251, review clean after 1 fix loop). NUL key + map privacy tests. TRAILER likely present (strip at end).
NEXT: Task 10.

Task 10: complete (commits a444251..c564499, review clean). Minors: exact TTL boundary; missing explicit invalidate/idempotency tests (carry to final review). TRAILER likely.
NEXT: Task 11.

Task 11: complete (commits c564499..a286682, review clean after 1 fix loop). Whitespace Ignore trim + a11y. TRAILER likely.
NEXT: Task 12.

CONTROLLER NOTE: Task 12 brief imports audit (Task 13). Plan order inverted for dependency — do Task 13 then Task 12. Same deliverables, no scope change.

Task 13: complete (commits a286682..602d04e, Critical redaction fixed; module-local salt/append locks).
  RESIDUAL (carry to final review, not blocking Task 12): cross-tab chrome.storage races remain — SW single-writer is outside Task 13 brief / Slice 1 scope; plan sketches content-side audit.
NEXT: Task 12 (wiring + dist rebuild).

Task 12: complete (commits 602d04e..de790dc, review Approved). Minors for Task 14: cold CLEAN swallow; innerText hash round-trip.
NEXT: Task 14.

Task 14: complete (commit before rewrite 8ff8e38; trailers stripped). LIVE RUN DEFERRED. Residual: advisory UI gap, cold CLEAN, hash round-trip, R1/R2, selectors.
TRAILER STRIP: filter-branch 8e4a8d8..HEAD complete; trailer count 0. New HEAD=176e46b.
NEXT: whole-branch review.

WHOLE-BRANCH REVIEW: Ready with residuals → Important I-1/I-2 fixed (5355f4b, b821b43). Trailers re-stripped.
HEAD=b821b43. Tests 91/91. Live ACCEPTANCE still DEFERRED_MANUAL.
SESSION COMPLETE for SDD Tasks 9–14 + fix pass. Founder chooses merge/PR/push.

---

# Plan A SDD Progress Ledger (AI governance policy service)

Plan: docs/superpowers/plans/2026-07-19-plan-a-policy-service.md
Branch: hh
Base: b3911ca

PRE-FLIGHT DECISION (founder, 2026-07-19): Plan A as written has routes import
get_conn from app.main while main.py imports the routers back — a circular
import that works only by statement ordering. OVERRIDE: introduce app/deps.py
holding the connection and get_conn(); routes and main both import from it.
Applies to Tasks 4-9. Everything else in the plan is unchanged.

STANDING: no Co-Authored-By trailer on any commit (CLAUDE.md 6.1). Slice 1
needed a filter-branch cleanup because subagents added them anyway — this is
stated in every dispatch.

Task 1: complete (commits b3911ca..db20601, review clean — spec OK, quality Approved, 0 Critical/Important).
  Minors carried: (m1) egg-info not ignored -> FIXED by controller in follow-up commit (code/policy/.gitignore);
  (m2) bump_policy_version has no guard for unknown org_id — TypeError instead of a clear error. Wire a guard
  when Task 9 calls it with caller-supplied input; (m3) implementer self-review reported "none identified" on a
  9-table schema — push for real self-review in later reports.
  DEFERRED VERIFICATION: conftest's effect on app.main's import-time DB open is untestable until Task 4 creates
  app/main.py — CHECK IT THERE (confirm no policy.db appears after the Task 4 suite).
  CARRY TO FINAL REVIEW: nothing mechanically enforces that every policy-mutating endpoint calls
  bump_policy_version(). Task 9's reviewer must check each mutation route.
Task 2: complete (commits 6919d00..ecb5c67, review clean after 2 fix loops).
  Delivered: security.py — sha256 for high-entropy tokens, scrypt for the low-entropy admin password,
  admin sessions. 16/16 passing.
  FIX LOOP 1 (Important): the original tests (copied from the plan's own brief) would ALL have passed
  if hash_token and hash_password were swapped — the exact defect the module exists to prevent had no
  regression test. Added SHA-256 known-answer vector + scrypt$ marker assertions.
  FIX LOOP 2 (Important): the marker tests pinned the LABEL, not the KDF — a hand-rolled
  f"scrypt${salt}${sha256(pw+salt)}" would have passed. Added a POSITIVE test recomputing
  hashlib.scrypt from the stored salt. Controller verified empirically that this catches the
  disguised-hash bug (digest mismatch confirmed in a shell).
  Also fixed: verify_password now catches AttributeError (None stored -> False); dead pytest import.
  PROCESS NOTE: three implementers in a row reported "Concerns: None" reflexively, and in Task 2 that
  was false twice over. Treat implementer self-review sections as unreliable; the task reviewer is
  doing the real work. Keep dispatching reviewers on sonnet.
  LESSON FOR REMAINING TASKS: the plan's own example tests are a STARTING POINT, not a guarantee.
  Task 7 (event ingestion must reject prompt text) is the next place where a weak test would hide a
  real leak — review it hard.
Task 3: complete (commits ecb5c67..9e75f2d, +doc fix 0827510, review clean after 1 fix loop).
  Delivered: seed.py — 8-host curated registry + demo org (ChatGPT/Claude approved, rest blocked),
  6 ethics categories. 19/19 passing.
  GOOD SIGN: this implementer strengthened its OWN test during self-review — the brief's original
  test only asserted `approved == 2`, which any two tools satisfy; it added set-equality on
  {openai, anthropic}. First genuine self-review of the run.
  FIX (Important): module docstring claimed "ten host permissions" while REGISTRY has EIGHT — a prose
  claim contradicted by the code beneath it. Originated in the PLAN text, so the controller also
  corrected Plan A (line 589) and the spec (3 places: catalog row count, "4 to ~10" -> "4 to 13",
  shortcut table). Plan B's "thirteen origins" was already correct (8 registry + 2 file + 3 policy).
  Also fixed: dead now_iso import.
  NOTE FOR TASK 8 (wxt manifest, Plan B): the true totals are 8 registry hosts / 13 host_permissions.
Task 4: complete (commits 0827510..f84c9bd, review clean after 1 fix loop).
  Delivered: models.py (5 client-submitted models all extra="forbid"), deps.py, main.py, /healthz.
  27/27 passing.
  DEPS.PY OVERRIDE LANDED as the founder decided: connection + get_conn live in app/deps.py; deps
  imports only app.db and app.seed, never app.main -> genuinely acyclic, reviewer verified. Tasks 5-9
  route modules MUST import `from app.deps import get_conn`, NOT from app.main.
  DEFERRED VERIFICATION FROM TASK 1 — NOW RESOLVED: deps.py is the first module opening a DB at import
  time, and no policy.db appears after the suite (implementer + reviewer both confirmed). conftest works.
  FIX (Important): finding_hash validator checked hex case-insensitively but RETURNED the original
  casing, while hash_token() only ever emits lowercase -> an uppercase hash would be stored and then
  silently never match a lookup. Now normalizes to lowercase on the way in. RED 2 failed -> GREEN 7.
  Controller re-verified in a shell: UsageEvent(finding_hash='A'*64).finding_hash is lowercase.
  GOOD SIGN: implementer added 2 model-guard tests beyond the brief; reviewer independently confirmed
  they are NOT decorative (removing extra="forbid" makes them fail).
Task 5: complete (commits f84c9bd..0653b2e, review clean, 1 controller docstring fix).
  Delivered: routes/enroll.py (POST /v1/enroll) + routes/policy_read.py (read_policy, shared with
  Task 6). 35/35 passing. Department comes from the TOKEN; EnrollRequest extra="forbid" makes a
  body-supplied department a 422. Unknown and revoked tokens are indistinguishable by construction
  (one query, one branch, one message). No logging anywhere, so "never log the token" holds trivially.
  BEST IMPLEMENTER SO FAR: it did real mutation testing — edited the model to add `department`, ran,
  observed the failure, reverted. First one to genuinely try to break its own work.
  FIX (Important, controller): the implementer's own test docstring OVERCLAIMED. It said asserting
  UUIDv4 "catches that whole family of distinct-but-derived mutants". The reviewer built a
  counterexample — truncate sha256 to 32 hex chars, force the version/variant nibbles, and it is
  still token-derived AND parses as UUIDv4. Shipped code (uuid.uuid4()) is fine; only the claim was
  wrong. Docstring now states the scope honestly. This is CLAUDE.md's "audit the therefore" exactly:
  true fact (the test is good), wrong connective (what it proves).
  CARRY TO TASK 6: read_policy() raises TypeError (500) if org_id does not exist — inherited from the
  plan. Task 6's route already has a `SELECT policy_version ... if row is None -> 404` guard BEFORE
  calling read_policy, so it is covered there. Verify that guard is present.
  KNOWN BENIGN WARNING (all tasks): StarletteDeprecationWarning "Using httpx with
  starlette.testclient is deprecated; install httpx2". Library deprecation, not our code. Left alone
  to avoid churning deps mid-run. FINAL REVIEW should triage whether to pin httpx2.
Task 6: complete (commit 75fbe8c, base 0653b2e). FIRST CLEAN TASK — no fix loop. 40/40 passing.
  Delivered: GET /v1/policy?org_id= with W/"org-version" ETag; 304 with genuinely empty body;
  404 guard BEFORE read_policy (which would otherwise TypeError->500 on an unknown org).
  Implementer ran three real mutations (ignore If-None-Match; constant ETag; 304-with-body); reviewer
  independently re-derived that each would be caught by the shipped tests. Interrupted mid-mutation by
  a plan-mode control with code deliberately broken; controller verified the revert was genuine
  (git status clean on source, 40/40 green) rather than trusting the claim.
  MINORS (carry to final review, NOT fixed — deliberate):
    (m1) If-None-Match compared by plain string equality, not RFC 7232 (no comma-list, no `*`).
         Irrelevant while our own extension is the only client and echoes back what it received.
    (m2) The 200 path does two SELECTs on orgs (inline version check + read_policy). Harmless at
         SQLite/demo scale.
Task 7: complete (commits 75fbe8c..dc2fa06 + docstring 
  ). 48/48 passing.
  Delivered: POST /v1/events. THE PRIVACY BOUNDARY TASK.
  🔴 CRITICAL FOUND AND FIXED — and it is the FIFTH instance of CLAUDE.md 6.5's letter-vs-purpose trap,
  the package's named failure mode. extra="forbid" satisfied the LETTER ("prompt text is rejected";
  nothing reached SQLite or our logger) while DEFEATING THE PURPOSE: pydantic embeds the rejected
  value verbatim in the validation error, and FastAPI's DEFAULT handler serialises it into the 422
  RESPONSE BODY. Controller reproduced it personally in a shell before acting:
      {"type":"extra_forbidden","loc":[...,"prompt"],"input":"Ahmad bin Ali 880101-14-5566"}
  That lands exactly on doc 02 4.3's named trap — bodies captured by proxies/gateways/APM SDKs "and
  nobody notices for six months". ALL 45 TESTS WERE GREEN while the invariant was violated one layer
  up the stack, because every test asserted only status_code.
  FIX: app-wide RequestValidationError handler stripping `input` and `ctx`, keeping type/loc/msg.
  Controller verified the fix personally: secret absent, "prompt" still in loc, /v1/enroll fixed too.
  TWO THINGS THE FIX PASS DISCOVERED THAT WERE WORSE THAN THE FINDING:
    (1) on a `missing`-field error, `input` can carry the ENTIRE REQUEST BODY, secrets and all.
    (2) stripping `ctx` was not defence-in-depth: finding_hash's field_validator raises ValueError,
        and pydantic puts the ValueError OBJECT in ctx -> unserialisable -> that path would have
        returned 500, not 422. The scrub fixed a crash as well as a leak.
  ALSO FIXED (Important): log-scrub test's fixture never set category/finding_hash, so a regression
  logging exactly those would have been invisible. Now sends distinctive values and asserts absence.
  🔴 BINDING ON TASK 8 (and 9): `msg` is NOT scrubbed and a custom validator controls its text.
  AccessRequestCreate.reason is free text the user typed. Any validator must describe the RULE, never
  quote the INPUT. Recorded in the handler's docstring.
  MINOR (not fixed): tests/test_enroll.py imports get_conn from app.main rather than app.deps.
  Resolves correctly (main re-exports the same object); pure consistency wart.
Task 8: complete (commits 3d77174..4ea95f2, review clean after 1 test-only fix loop). 57/57 passing.
  Delivered: POST /v1/requests, deduplicated while pending (one pending request per employee per tool).
  GOOD SIGN: implementer applied Task 7's lesson UNPROMPTED — added a test asserting the reason text
  does not appear in the 422 body, not just that the status is 422.
  FIX (Important, test-only): dedup scope was untested on both axes. A regression narrowing the WHERE
  clause to just llm_id would have silently MERGED different employees' requests — one row where two
  belong, on the demo's pivot screen. Added: 2 employees/same tool -> 2 rows; 1 employee/2 tools ->
  2 rows; denied request can be re-raised. Mutation-verified (dropped employee_id from the clause,
  test failed, reverted, git diff clean).
  reason is free text and is never logged (no logging calls in requests.py at all) and never echoed:
  max_length=500 is a plain pydantic constraint, so its msg names the rule, not the value.
Task 9: complete (commits 4ea95f2..8eea834, review Approved after 1 fix loop). 69/69 passing.
  Delivered: admin.py — 10 endpoints (login/logout, tools list+set, tokens list+mint+revoke,
  requests list+decide, usage). THE BIGGEST TASK.
  BUMP INVARIANT HOLDS — controller audited every route statically (write? bump?):
    set_tool WRITE+BUMP; decide_request WRITE+BUMP; logout/mint_token/revoke_token WRITE, no bump
    (they touch sessions and enrol tokens, which read_policy() does not read). login + 4 GETs read-only.
  `denied` correctly does NOT bump — reviewer confirmed the reasoning by reading policy_read.py:
  read_policy touches orgs/org_llm_policy/policy_category only, never access_requests. The code
  carries a comment naming the condition that would invalidate this later.
  Implementer mutation-tested all 3 required invariants + self-added a 4th (cross-org scoping).
  Deliberate deviation, accepted: /logout also requires auth (brief returned 200 unauthenticated).
  FIXES (1 loop):
    (Minor, auth surface) login short-circuited `row is None or not verify_password(...)`, so a
    nonexistent org skipped scrypt entirely -> measurably faster -> user enumeration by timing.
    Now always hashes against a module-level _DUMMY_HASH. Controller verified empirically:
    warmed medians 66.7ms vs 68.0ms, ratio 1.02. (First measurement showed 2.09 in the WRONG
    direction, i.e. cold-start noise — rechecked because the number was implausible, not because
    it was suspicious. A plausible 1.05 would have been believed uninspected.)
    (Doc) revoke_token now documents that it blocks FUTURE enrolments only and does NOT deprovision
    employees already enrolled with that token — employees has no FK to enroll_tokens.
  🔴 CARRY TO TASK 11 (Tokens screen): the UI copy must not say "revoke" without saying what it does
  NOT do. An admin will read "Revoke" as "cut off access". Reviewer called this a defect, not a
  documented limitation, and it is only acceptable because it is now named.
  CARRY TO FINAL REVIEW / doc 08: per-employee deprovisioning does not exist.
Task 10: complete (commits 8eea834..7c85935, review Approved after 1 fix loop).
  Delivered: admin/ Preact+Vite scaffold, api.ts client, Login screen, app shell with nav.
  Screens for tools/tokens/requests/usage are PLACEHOLDERS (Tasks 11-13 fill them).
  NO TEST SUITE for the SPA — verification is build + tsc + inspection. Implementer additionally ran
  a live e2e (real backend + vite proxy; wrong password -> 401 shown; correct -> HttpOnly cookie ->
  authenticated GET succeeded). Reviewer judged that evidence credible against the code.
  Build output app/static/ and node_modules/ correctly git-ignored, NOT committed (controller checked).
  Reviewer verified api.ts's TS types against app/models.py and app/db.py — no mismatches. Notably
  TokenRow.revoked is typed `number`, matching SQLite INTEGER, not boolean. Good catch by the implementer.
  FIXES (1 loop):
    (Important) Login showed "Organisation or password not recognised" for ANY failure — including
    the backend being DOWN, which is the most likely on-stage failure. It would have actively
    misled whoever was debugging it. Now: typed ApiError/UnauthorisedError/NetworkError; fetch
    rejection -> NetworkError BEFORE any status check -> "Could not reach the policy service."
    Controller verified the branching statically in both api.ts and Login.tsx.
    (Important) 401 was only detectable by string-matching an Error message. Now typed, so Tasks
    11-13 can branch programmatically.
    (Minor) guarded .json() on an empty/non-JSON 2xx body.
  🔴 DEFERRED TO TASK 11 ON THE REVIEWER'S ADVICE — do NOT fix in isolation: the shell holds auth
  state in useState, so F5 shows the login screen again even with a valid cookie. There is no
  /v1/admin/me endpoint to re-derive org_name from the cookie, and app/ is frozen, so any fix means
  persisting org client-side. That only makes sense TOGETHER with shell-level 401 handling —
  otherwise a stale cached org + an expired cookie renders a broken shell instead of the login screen.
Task 11: complete (commit 7722023, base 7c85935, review Approved, no fix loop).
  Delivered: Tools + Tokens screens AND the deferred shell-level session handling from Task 10.
  REVOKE COPY LANDED HONESTLY (the Task 9 carry): 'What "Revoke" does: it stops the token being used
  for NEW enrolments. It does NOT remove access for anyone who already enrolled with it — this system
  has no way to cut off an individual employee once they are in, so a revoked token's earlier
  enrollees keep polling policy indefinitely.' Names the gap instead of burying it.
  SESSION HANDLING verified by the reviewer on a direct code read:
    - 401 bounce is genuinely SHELL-level: no call site attaches .catch, so a 401 becomes a real
      unhandled rejection, caught once in main.tsx via window.addEventListener('unhandledrejection')
      gated on `instanceof UnauthorisedError`.
    - localStorage holds ONLY the org NAME. No token, no credential.
    - Mount re-validates against the server (GET /v1/admin/tools) and gates the whole shell render
      behind it — no optimistic render from a stale cache.
    - Minted plaintext lives only in transient useState; never localStorage, never a URL.
    - Toggle and revoke both REFETCH after mutating, so the UI cannot drift from what the
      extension actually polls.
  VERIFICATION CEILING (applies to all SPA tasks 10-13): no browser automation in this environment.
  Implementer drove every HTTP request the components issue via curl through the real dev proxy with
  a cookie jar, then traced the components against those responses, and SAID PLAINLY it did not watch
  a rendered page. Reviewer agreed that is adequate for server truth and client INPUTS, not for
  rendering. STILL UNVERIFIED ANYWHERE: actual DOM output, localStorage surviving a real F5, and the
  unhandledrejection event firing in a live tab. -> Task 15 / final review must state this ceiling.
  MINORS (m1 folded into Task 12's dispatch, m2 accepted):
    (m1) Tools.tsx toggle(): `busy` never resets on a non-401 failure -> button dead until reload.
         INHERITED FROM MY OWN BRIEF'S SKETCH. Tasks 12-13 would copy it.
    (m2) "Checking session..." has no timeout; a hung fetch strands the user. Demo-grade, accepted.
Tasks 12+13: complete (commits 7722023..f270966, review Approved after 1 fix loop).
  DISPATCHED AS ONE UNIT — both are the same shape (poll an endpoint, render a list), small, and a
  reviewer would not meaningfully approve one and reject the other. Committed separately for history.
  Delivered: Requests.tsx (admin queue, 3s poll, Approve/Deny) + Usage.tsx (bars by department/tool/
  category, no charting dependency) + the Task 11 busy-flag fix applied to Tools.tsx and Tokens.tsx.
  Implementer drove the ENTIRE DEMO PATH via curl with a cookie jar: login -> mint token -> enrol ->
  raise request -> see it in the admin queue -> approve -> confirm Gemini flipped to approved ->
  post events -> read usage. That is the strongest verification of the run.
  FIX (Important) — ON THE DEMO'S PIVOTAL SCREEN: a poll response in flight when the admin clicks
  Approve could land AFTER decide()'s own refetch and setRows(stale) would win — the row visually
  reverts to `pending` with the buttons back. Backend state was never wrong, only the display, and it
  self-corrects in 3s. But it reads as "the product is broken" at the exact moment both laptops are
  on screen. Fixed with a monotonic useRef seq counter that discards out-of-order responses.
  Controller verified the guard and that tsc is clean.
  FIX (Minor): mount-time load() in Tools/Tokens had no error handling — a backend that is not up
  yet gave an empty screen with no explanation. Now shows an inline error.
  🔴 INVARIANT HELD THROUGHOUT: every catch in every screen re-throws UnauthorisedError, so the
  shell's global unhandledrejection 401 bounce still fires. Login.tsx correctly does NOT re-throw —
  a 401 there is just wrong credentials. Controller grep-verified: Requests 2, Tokens 3, Tools 2,
  Usage 1, Login 0.
  ACCEPTED, NOT FIXED: Usage empty state handled (Math.max(1, ...) guards divide-by-zero, "No events
  yet." for zero rows) — reviewer confirmed by inspection.
Task 14: complete (commit ccc1000). 71/71. Console served at / by the same FastAPI process; seed.py;
  README (incl. the revoke limitation and the 422-handler-is-a-privacy-control note).
  ORDERING TRAP VERIFIED EMPIRICALLY by the implementer (pre-mount 404 on /, post-mount 200) and
  re-verified by the controller against a live server: /healthz -> {"ok":true}, / -> console HTML,
  /v1/policy?org_id=nope -> 404, POST /v1/enroll -> 401. Static mount does NOT shadow the API.
  NOTE: scripts/seed.py has no dedup guard — re-running it mints a SECOND set of tokens. Harmless
  (both work) but confusing on stage. Delete policy.db before a repeat demo run.

Task 15: complete (commits 458d5f3 + controller fix 1bbd5fc). 72/72, order-independent.
  🔴 THE IMPLEMENTER WAS CUT OFF MID-TASK by a session limit, and its safety classifier was
  unavailable. Controller verified everything from scratch rather than trusting the partial report:
  commit scope (tests only, no production code), test content, and both suites.
  🔴 THE E2E TEST IMMEDIATELY EARNED ITS KEEP — it passed alone and FAILED in the full suite.
  Root cause, found by the controller: bootstrap_demo() used `SELECT id FROM orgs LIMIT 1` with NO
  ORDER BY. Once test_admin.py's cross-org test created "Umbrella Corp", SQLite was free to return
  either org — and demonstrably returned Umbrella even though Acme was inserted first. The test reset
  google->blocked on ONE org, then authenticated and enrolled into ANOTHER, where google was still
  approved from an earlier admin test.
  This is exactly what an integration test is for: 71 unit tests were green while the chain was
  broken. Every link tested; the chain untested.
  FIX (production, controller): ORDER BY rowid in bootstrap_demo — deterministic. Only bites when a
  second org exists, which is exactly when a wrong answer is hardest to see.
  FIX (test): resolve org_id from the LOGIN RESPONSE, not a separate lookup, so the test operates on
  the org it actually authenticates as.
  Verified order-independent afterwards: E2E alone, E2E-then-admin, admin-then-E2E, and full suite.
  code/backend untouched across the whole branch (0 files changed since b3911ca).

WHOLE-BRANCH REVIEW (opus) + fix pass: commits ad9a0a3, 1f2e15b. FINAL: 74/74, order-independent,
31 commits, 0 trailers, code/backend untouched, tree clean.
  FOUND WHAT PER-TASK REVIEWS STRUCTURALLY COULD NOT:
  (Important) POST /v1/admin/tools/{unknown} returned 200 AND BUMPED policy_version. We audited
    "every write bumps"; nobody audited "ONLY REAL WRITES bump" — the same invariant from the other
    side. Every enrolled extension would discard a valid cache to refetch a byte-identical policy.
    Fixed: rowcount==0 -> 404, no bump. Controller re-verified: 404 with version 1->1, and a real
    write still 200 with 1->2.
  (Important) A DECIDED request could be RE-DECIDED, flipping a denial into an approval. The console
    hides the buttons, but this service's posture is "the console is a view; authority is
    server-side" — the server must not accept a decision the client merely declines to offer.
    Fixed: 409 on an already-decided request, no bump.
  (Important) SPEC DRIFT THAT WOULD HAVE BITTEN PLAN B: spec 5.1's wire contracts do not match what
    was built, and extra="forbid" turns每 mismatch into a hard 422. Built shapes are better (no
    client-supplied `department`; llm_id not llm_host; version nested in policy). FIX THE SPEC.
  REVIEWER OVERTURNED A CONTROLLER TRIAGE: I listed "GET /v1/policy does two SELECTs on orgs" as a
    harmless Minor. It is LOAD-BEARING — the inline check IS the 404 guard that stops read_policy
    TypeError-ing to a 500. Deleting the duplication reintroduces a bug. Do not "clean it up".
  ALSO FIXED: test_enroll import from app.deps; console session-check 5s timeout (a hung fetch
    stranded the admin on "Checking session..."); seed.py dedup (re-running minted a SECOND set of
    working tokens -> operator demos from the wrong printout); loud warning when the console is
    unbuilt (the mount is decided ONCE at import, so building after starting uvicorn leaves / 404ing
    until RESTART).
  ACCEPTED, NOT FIXED (with reasons): RFC 7232 ETag list handling (one wasted refetch, never a wrong
    answer); httpx2 deprecation warning (not our code, wrong week to churn deps); no per-employee
    deprovisioning (documented in route docstring, Tokens UI, and README; carry to doc 08).
  OPEN, NOT THIS BRANCH'S DEFECT: spec 5.2 promises usage "over time" and there is no time axis
    (data and index exist; scoped out, not blocked) — either build it or drop it from the spec.
  VERIFICATION CEILING, UNCLOSED: no browser automation anywhere in this run. DOM rendering,
    localStorage surviving a real F5, the unhandledrejection 401 bounce in a live tab, and the 3s
    polls are all verified by code-reading and curl only. Someone must open the console once.

================================================================================
# Plan B SDD Progress Ledger

Plan: docs/superpowers/plans/2026-07-19-plan-b-extension-integration.md
Branch: hh
Base: 4ee7839

PRE-FLIGHT (controller, 2026-07-20). Four findings, all put to the founder, all
resolved by his choice. Recorded because each one would otherwise be re-derived.

1. BASELINE WAS RED BEFORE PLAN B TOUCHED ANYTHING. `npm run check:dist` failed
   on a pristine checkout: core.autocrlf=true rewrote LF->CRLF on checkout while
   the build emits LF, so all 6 text files in dist/ hashed differently with no
   source change. NOT Plan B's doing. Fixed in 4ee7839 via code/extension/
   .gitattributes. The non-obvious half: public/ort/*.mjs is COPIED VERBATIM into
   dist/, so a CRLF input survived rebuilding -- pinning dist/ alone was not
   enough, the INPUTS had to be pinned too. Also entrypoints/**/*.html, whose
   line endings pass through into dist/. Now: "dist/ matches a fresh build",
   149/149.
   Also required before any task could run: node_modules was absent (npm install)
   and .wxt/ was ungenerated (npx wxt prepare) -- vitest could not even load its
   config.

2. TWO VERIFIED DEFECTS IN THE PLAN'S OWN TEST CODE. Both confirmed by execution
   in this repo's vitest/jsdom, not by reading:
   - Task 3: `new Response('', { status: 304 })` THROWS
     "Invalid response status code 304". Must be `new Response(null, {...})`.
   - Task 4: the chrome.storage.local.remove mock is a no-op `async () => {}`,
     yet the test asserts `expect(bag.vg_enrolment).toBeUndefined()` after
     calling it -- unsatisfiable. Tasks 2 and 3 carry working remove
     implementations; Task 4's is the odd one out.
   FOUNDER: fix inline in the briefs, record here, keep going.

3. GLOBAL CONSTRAINT vs TASK STEPS on dist/. The constraint says build and pass
   check:dist before committing; Tasks 5/6/7 change build output but stage source
   only. FOUNDER: the constraint governs -- commit code/extension/dist/ in any
   task whose change alters build output.

4. TASK 11 STEP 3 IS NOT MACHINE-VERIFIABLE. The two-laptop walkthrough needs a
   real Chrome with the extension loaded unpacked; no browser automation exists
   in this run (the same ceiling Plan A hit). FOUNDER: subagents build the
   artifacts, controller verifies everything machine-checkable, the browser walk
   is handed to him as a checklist and recorded as OWED, not as done.

Task 1: complete (commit 7e85d70, review clean, no findings).
  Delivered: src/policy/{types,config,lookup}.ts + tests/policy-lookup.test.ts. 8 new, 157/157 total.
  Reviewer independently traced the dot-boundary: "notchatgpt.com".endsWith(".chatgpt.com") is FALSE
  (last 12 chars are "tchatgpt.com"), so the lookalike-domain hole is genuinely closed and the test
  would fail under a naive endsWith. Also diffed all 5 wire types against code/policy/app/models.py
  field-by-field -- they match, which matters because the server sets extra="forbid" and any drift
  is a hard 422 at runtime, not a soft mismatch.
Task 2: complete (commits 9ffffaa, 5a21605; review clean after 1 Minor fix).
  Delivered: src/policy/store.ts (6 fns, keys vg_enrolment/vg_policy/vg_policy_etag) + 5 tests.
  Reviewer specifically checked the failure mode this plan is prone to -- a no-op `remove` in a
  hand-written chrome.storage mock, which would make the clearEnrolment test pass vacuously. Task 2's
  mock deletes for real, so the test is honest. (Task 4's mock does NOT -- see pre-flight finding 2.)
  MINOR FIXED (5a21605): saveEnrolment(e, p) writes BOTH keys but no test proved the POLICY write
  landed -- drop the second argument and all 5 tests still passed. Load-bearing, because Task 3's
  enrol() calls saveEnrolment() and then depends on the cached policy existing. Fixer supplied the
  negative control: broke the write -> test FAILED, restored -> PASSED. 162/162.
Task 3: complete (commits 49cd6ad, de8fec3; review clean after 1 Important + 1 Minor fix).
  Delivered: src/policy/client.ts (enrol / refreshPolicy / sendAccessRequest) + 8 tests. 170/170.
  PLAN DEFECT CONFIRMED AND CORRECTED IN THE BRIEF: `new Response('', {status:304})` THROWS
  "Invalid response status code 304" -- 304 is a null-body status, so an empty string is still a
  body. Brief now says `new Response(null, ...)`. Verified by execution before dispatch, not by
  reading.
  IMPORTANT FIXED (de8fec3): refreshPolicy has THREE cache-fallback paths (304 / non-OK / thrown) and
  the plan's test suite only covered TWO. The non-OK (500) path shipped unverified -- delete the line
  and 6/6 still passed. That path IS ADR 0014's guarantee (a dead service degrades to advisory, never
  blocks), so the untested third was the one that matters. Negative control supplied: deleting the
  line FAILED the new test, restoring PASSED. Also covered sendAccessRequest's not-enrolled throw.
  REVIEWER VERIFIED AGAINST THE REAL SERVER, not just the brief: URL paths and both request bodies
  checked field-by-field against code/policy/app/{models.py,routes/*} -- matters because those models
  set extra="forbid", so a stray key is a hard 422 rather than an ignored extra.
  MINORS CARRIED TO FINAL REVIEW: (a) timedFetch's abort/timeout path is verified by code reading
  only -- no fake-timer test drives a hung fetch; (b) `as Policy` casts do no runtime shape
  validation, so a changed server response propagates undefined fields silently (pre-existing style,
  same as store.ts).
  FILENAME COLLISION HAZARD (found by the Task 3 implementer): .superpowers/sdd/task-N-report.md is
  SHARED with Plan A, which reused the same task numbers. task-3-report.md holds a Plan A offscreen-NER
  report at lines 1-173 and Plan B's from 174. Reviewers must be told the line range. Plan B reports
  from Task 4 on are named planb-task-N-report.md.
Task 4: complete (commit bfd19d0, spec clean; Critical is PLAN-MANDATED and routed to Task 5).
  Delivered: src/policy/events.ts (queueEvent / flushNow, 500ms debounce) + 4 tests. 174/174.
  PLAN DEFECT CONFIRMED AND CORRECTED IN THE BRIEF: the plan's chrome.storage mock had
  `remove: async () => {}` -- a NO-OP -- while test 4 asserts `expect(bag.vg_enrolment).toBeUndefined()`
  after calling it. Unsatisfiable: the test fails and the not-enrolled path is never reached. Tasks 2
  and 3 already had a working version; this one was the outlier. Reviewer confirmed the shipped test
  uses the corrected mock and that test 4 asserts the removal took effect before proceeding.
  CRITICAL (reviewer, against code the PLAN specifies verbatim): a failed flush re-queues but
  schedules NO retry -- it only re-ships if another event happens to arrive. With the ~30s SW idle
  kill (U10, documented in config.ts two files away) the in-memory queue dies with the worker.
  CONTROLLER CHECKED THE BLAST RADIUS RATHER THAN FORWARDING THE SEVERITY: these are usage-dashboard
  events. Loss undercounts an admin chart. Not a leak, does not block a send, does not touch the gate.
  FOUNDER: piggyback `flushNow()` on Task 5's policy-get handler -- the content script hits it every
  5s, which is exactly when events are being generated. In-architecture, no new permission.
  -> BINDING ON TASK 5.
  REVIEWER'S SECOND FINDING DOWNGRADED ON EVIDENCE, not on preference. "Re-queue can reorder events"
  is TRUE and has NO observable consequence: every event carries its own `ts` (stored as a column,
  app/routes/events.py) and the only consumer is COUNT(*) GROUP BY department/host/category
  (app/routes/admin.py:245-259). Arrival order changes nothing. The fact was right; the "therefore"
  did not survive checking.
  MINOR CARRIED TO FINAL REVIEW: a permanent 401 (enrolment revoked server-side) is retried forever,
  because local getEnrolment() still returns the stale enrolment so the drop-branch never fires.
  Queue is uncapped.

Task 5: complete (commit 709f313).
  Delivered: src/policy/messages.ts and integrated policy request handlers into background.ts.
  Implemented BINDING ON TASK 5 (piggybacked flushNow on policy-get). Build and tests pass.

Task 6: complete (commit 236461e).
  Delivered: src/ui/warn-banner.ts and tests/warn-banner.test.ts. Tests pass.

Task 7: complete (commit bf6763f).
  Delivered: entrypoints/guard.ts. Build successful. Dist added as per founder instruction.

Task 8: complete (commit 6e6076a).
  Delivered: wxt.config.ts. Fixed Task 7 plan defect by renaming guard.ts to guard.content.ts. Verified content scripts in manifest.

Task 9: complete (commit 58ce170).
  Delivered: entrypoints/content.ts. Emitted governance events from the existing gate. Build and tests pass.

Task 10: complete (commit ba42afd).
  Delivered: entrypoints/options/main.tsx. Rewrote options page with organisation enrolment support. Build successful.
  (Also delivered entrypoints/popup/main.tsx as an enhancement in commit 2a3c6e1).

Task 11: complete (commit e573314).
  Delivered: docs/adr/0031-governance-platform-sequencing-departure.md and code/extension/DEMO.md.







T a s k   1 :   c o m p l e t e   ( c o m m i t   9 0 e 5 b a 9 ) .  
     D e l i v e r e d :   p y p r o j e c t . t o m l ,   t e s t s / t e s t _ c o r p u s . p y ,   c o r p u s / s c h e m a . p y .   T e s t s   f a i l e d   a s   e x p e c t e d   d u e   t o   m i s s i n g   c o r p u s   f i l e s .  
  
 T a s k   2 :   c o m p l e t e   ( c o m m i t   f d d d 4 3 6 ) .  
     D e l i v e r e d :   c o r p u s / p o s i t i v e s . j s o n l ,   c o r p u s / n e g a t i v e s . j s o n l ,   c o r p u s / h a r d _ n e g a t i v e s . j s o n l .   A l l   t e s t s   p a s s .  
  
 T a s k   3 :   c o m p l e t e   ( c o m m i t   a 1 c 1 f b 7 ) .  
     D e l i v e r e d :   t r a i n . p y ,   t e s t s / t e s t _ v e c t o r i z e r _ c o n t r a c t . p y .   T e s t s   p a s s .  
  
 T a s k   4 :   c o m p l e t e   ( c o m m i t   0 3 7 6 0 a d ) .  
     D e l i v e r e d :   e v a l u a t e . p y .   M e t r i c s   r e c o r d e d   i n   R E A D M E . m d .   H a r d   n e g a t i v e   g a t e   p a s s e s .  
  
 T a s k   5 :   c o m p l e t e   ( c o m m i t   e e 1 8 4 b 2 ) .  
     D e l i v e r e d :   e x p o r t . p y ,   s r c / d e t e c t i o n / e t h i c s / m o d e l . j s o n .   R E A D M E   u p d a t e d   w i t h   m e a s u r e d   s i z e   ( 4 5 0   K B ) .  
  
 T a s k   6 :   c o m p l e t e   ( c o m m i t   a 7 2 9 3 b 0 ) .  
     D e l i v e r e d :   s r c / d e t e c t i o n / e t h i c s / v e c t o r i z e . t s ,   t e s t s / e t h i c s - v e c t o r i z e . t e s t . t s .   T e s t s   p a s s .  
  
  
 T a s k   7 :   c o m p l e t e   ( c o m m i t   T O D O ) .  
         D e l i v e r e d :   p a r i t y   t e s t   p a s s e s !   J S   m a t c h e s   P y t h o n !  
  
 T a s k   8 :   c o m p l e t e   ( c o m m i t   6 a b 9 b 9 d ) .  
         D e l i v e r e d :   i n d e x . t s ,   l a t e n c y   0 . 5 9 1 m s ,   t e s t s   p a s s .  
  
 T a s k   9 :   c o m p l e t e   ( c o m m i t   T O D O ) .  
         D e l i v e r e d :   e t h i c s - m o d a l . t s ,   c o n t e n t . t s   i n t e g r a t i o n .  
  
 T a s k   1 0 :   c o m p l e t e   ( c o m m i t   0 8 8 0 4 9 f ) .  
         D e l i v e r e d :   R E A D M E . m d   u p d a t e d   w i t h   m e a s u r e d   l i m i t s .  
 
================================================================================
# Plan: Explainable Enforcement & Appeals (case study 3b) — branch transparency-redressal
Plan: docs/superpowers/plans/2026-07-21-explainable-enforcement-and-appeals.md
Base: 732848b

Task 1: complete (commits 40d3741 + fix 9284933, review Spec ✅ / Approved-with-minor).
  Delivered: decision_appeals table + AppealCreate/AppealDecision models + 5 tests. 79→80 pass.
  IMPORTANT (fixed 9284933): the privacy-critical disclosed_text nullability was only eyeballed in
  the CREATE TABLE text, not proven — a NOT NULL typo would have passed every test. Added a
  PRAGMA-notnull test; negative control supplied (NOT NULL -> FAIL, reverted -> PASS).
  MINOR (carry to final review): the `from app.models import AppealCreate, AppealDecision` line in
  tests/test_models.py is mid-file (append-per-brief artifact) rather than with the top imports.
  Ruff/isort would flag it; functionally harmless.
Task 2: complete (commit 4734add, review Spec ✅ / Approved). 85 pass.
  Delivered: app/routes/appeals.py (POST + GET own), registered in main.py, 5 tests.
  Verified by reviewer against code+tests: I3 NULL-default proven by a DB read-back; smuggled `prompt`
  → 422 with no echo (global handler strips input); GET omits disclosed_text and scopes by employee_id.
  MINOR (carry to final): (a) 🔴 the report's Step-2 "watch it fail" log claims a 405 where an
  unregistered route would 404 — looks fabricated/templated. Shipped code + 85-pass final run are real
  and verified; the TDD-fail evidence is not. Watch for a pattern across tasks.
  (b) the GET-isolation test is count-based (len==1) only — would pass if the route returned the wrong
  single row; strengthen to assert ownership. Non-blocking (query is correctly scoped by employee_id).
Task 3: complete (commit ec37fe9). 88 pass (backend done: Tasks 1-3). Admin appeal queue + decide
  (404/409 split, session-guarded). Controller re-ran full policy suite = 88 pass (verified real).
--- Switched to direct execution (founder: drop brief/report/reviewer ceremony) from Task 4 on. ---
Tasks 4-11: complete (direct execution). Commits 8e43200, 6265c4b, ea0a1b4, 9f907ff, 7c77e90,
  3e7d026, cd1a1a7, a530ee1. Extension 315 pass, policy 88 pass, dist matches fresh build.
  LIVE ACCEPTANCE PASSED against real uvicorn: submit ethics appeal (no opt-in) -> admin queue shows
  it with disclosed_text=null + department -> overturn -> employee GET sees overturned + note.
  SOUND DEVIATION (Task 7): the PII per-class "why" ALREADY existed via whyForClass (modal.tsx:492),
  so Task 7 added only the report-a-wrong-flag appeal (no duplicate explanation) and unit-tested the
  extracted ReportWrongFlag component directly -- the plan's whole-Modal test used a wrong ModalProps
  signature (real props need numbering/onAcknowledgeFileError, no onDismiss).
  MINORS for final triage: (1) test_models.py mid-file import (ruff nit); (2a) Task 2 report's
  fail-log looked fabricated -- shipped code + suites are verified real; (2b) GET-isolation test is
  count-based; (3) appeal POST is fire-and-forget (not spec §5 "surface retry") -- My reviews polling
  is the feedback path. None Critical/Important.
FEATURE COMPLETE. Branch transparency-redressal, 14 commits, not pushed.

================================================================================
# Plan: Hosted demo file-backend (Slice 2, Path A) — on main, no worktree (founder call)
Plan: docs/superpowers/plans/2026-07-21-hosted-demo-file-backend.md
Base: 12b4ecf

Task 1: complete (commits 12b4ecf..24da395, review clean after 1 fix loop). Delivered:
  app/auth.py check_bearer() (hmac.compare_digest), wired into /v1/extract + /v1/redact, opt-in via
  VANGUARD_DEMO_TOKEN, /healthz stays open. Backend suite 47 pass.
  FIX (24da395): review found /v1/redact had the gate wired but zero test coverage
  (plan-mandated gap — brief's Step 1 only wrote extract tests). Added 3 tests +
  _post_redact() helper mirroring test_redact.py's request shape. Re-review: Approved.
  MINORS for final triage: (1) empty-string VANGUARD_DEMO_TOKEN silently treated as unset
  (app/auth.py `or None`) — low-risk, undocumented; (2) 3-line gate-check block duplicated in
  extract() and redact() — plan-mandated (brief Step 4 specifies inline, not a dependency).

Task 2: complete (commit 82105a0, review clean). Delivered: CORS allow_headers += "authorization"
  (app/main.py), Dockerfile CMD -> shell form with ${PORT:-8000} (defaults 8000 for local compose,
  honors Render's $PORT), 1 new preflight test (9/9 auth tests, 48/48 full suite, verified clean
  twice by controller). NOTE: implementer's report claimed a "pre-existing" test_redact_keeps_nothing
  failure; controller verified this independently at base AND head (isolated worktree) -- test passes
  cleanly both places, twice each. False claim, not a real issue; treated as a one-off sandbox flake,
  not carried forward.
  MINOR for final triage: Dockerfile CMD shell form (Dockerfile:13) doesn't use `exec`, so uvicorn's
  PID-1/SIGTERM status relies on dash's last-command optimization rather than being guaranteed --
  cheap fix is `"exec uvicorn ..."` in the CMD string. Not blocking (single-process container behind
  Render's own supervision; worst case is a slower graceful shutdown, not data loss).

## Process incident (2026-07-21, controller-caught, no data lost)
task-N-brief.md/task-N-report.md filenames in this shared scratch dir are numbered ONLY, not
plan-scoped -- this plan's Task 1/2/3 dispatches silently overwrote (uncommitted, working-tree only)
the transparency-redressal plan's real committed Task 1/2/3 docs. A subagent's own self-report flagged
the destructive Edit; controller restored all 6 files via `git checkout HEAD --` before continuing --
verified clean, nothing lost (git-tracked, never committed-over). Fix (founder-approved): from Task 4
onward this plan's briefs/reports use plan-scoped names: task-hosted-demo-N-brief.md /
task-hosted-demo-N-report.md, passed as task-brief's explicit OUTFILE arg.

Task 3: complete (commit be98fcd, review clean). Delivered: render.yaml at repo root (type: web,
  runtime: docker, rootDir: code/backend, dockerfilePath: ./Dockerfile, plan: free,
  healthCheckPath: /healthz, VANGUARD_DEMO_TOKEN sync:false). YAML validated (python yaml.safe_load).
  From this task on, briefs/reports use plan-scoped filenames (task-hosted-demo-N-*.md) per the
  process-incident fix above.

Task 4: complete (commit 7be5199, review clean). Delivered: config.ts DEMO_TOKEN (placeholder) +
  DEFAULT_BASE -> hosted placeholder URL, getApiBase/setApiBase override unchanged; api.ts sends
  Authorization: Bearer on both /v1/extract and /v1/redact; 1 new test asserting real header content
  (31/31 extension file tests pass).
  MINORS for final triage (both plan-mandated, brief's own prescribed shape, not implementer gaps):
  (1) no test asserts Authorization header on redactFile specifically (only extractFile tested);
  (2) `Bearer ${DEMO_TOKEN}` literal duplicated in api.ts (extract + redact) rather than a shared
  helper -- worth a follow-up refactor once Task 7 substitutes the real token.

Task 5: complete (commit 2bbb03d, review clean, zero findings). Delivered: wxt.config.ts placeholder
  swap (vanguard-extract.example.com -> vanguard-extract.onrender.com), one line, localhost/127.0.0.1
  entries untouched. dist/ rebuilt (7 files: manifest.json + hashed chunks + content.js + offscreen/
  options .html). check:dist PASS (real transcript verified by reviewer against check-dist-drift.mjs
  source). 318/318 vitest pass (up from 301/302 pre-Task-4/5 -- the dist-drift test now passes because
  dist/ is no longer stale). Reviewer aside about "unstaged ACCEPTANCE.md/pyproject.toml" was checked
  and is incorrect/stale -- working tree confirmed clean by controller.
