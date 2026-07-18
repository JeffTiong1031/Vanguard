# Task 7 Report — window-capture gate

## Status
**COMPLETE** — RED → GREEN → full suite green → committed.

## TDD record
| Phase | Result |
|---|---|
| **RED** | `tests/gate.test.ts` failed: `Failed to load url ../src/gate/gate` (module missing) |
| **GREEN** | 7/7 gate tests pass after `gate.ts` transcribed verbatim from brief |

## Files
- `code/extension/src/gate/gate.ts` — `decideGate` (pure) + `installGate` (window capture listeners)
- `code/extension/tests/gate.test.ts` — 6 `decideGate` tests (4 brief + 2 controller) + 1 `installGate` registration sanity test

## Tests (7)
1. **DIRTY unapproved → BLOCK**
2. **DIRTY with matching approval → PASS**
3. **CLEAN → PASS** (approvedHash null)
4. **Cold cache (UNKNOWN) → BLOCK** (fail-safe, modal resolves)
5. **DIRTY with mismatched approvedHash → BLOCK** (hash-bound approval)
6. **CLEAN regardless of approvedHash** (null or mismatched both PASS)
7. **installGate registers keydown + click with `{ capture: true }`**

## Full suite
65/65 pass (12 files). No regression. `dist/` unchanged.

## Commit
`de092ec` — `feat(ext): window-capture gate with sync verdict read and IME pass-through`

## Self-review
| Check | Verified |
|---|---|
| `isComposing` early-return (U12-b) | `if (e instanceof KeyboardEvent && e.isComposing) return` before send-intent check |
| `composedPath()` not `event.target` | `const path = e.composedPath()` passed to deps |
| BLOCK calls both `stopImmediatePropagation` and `preventDefault` | Both called before `onBlocked` |
| Capture-phase guard | `if (e.eventPhase !== Event.CAPTURING_PHASE) return` |
| Window capture registration | `window.addEventListener(..., { capture: true })` for keydown and click |
| Cold cache fail-safe (not fail-closed) | `!v` → BLOCK; modal/onBlocked path forward per brief |
| Sync verdict read (decision #8) | `decideGate` uses `cache.getSync` only; no await |

## Concerns
- **None blocking.** `installGate` not wired to content-script entrypoint yet (by design).
- `hashOf` must stay synchronous when wired — scanner must warm text→hash map alongside verdict cache.
