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
