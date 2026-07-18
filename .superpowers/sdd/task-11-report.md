# Task 11 Report — Preact modal + closed shadow root + Ignore-with-reason

## Status

Complete. The modal component and mount helpers are implemented without content-script, gate, approval-store, or adapter wiring. No `dist/` files changed.

## What was implemented

- `Modal` accepts only rewritten text, class/count summaries, `onApprove()`, and `onIgnore(reason)`.
- The UI displays class/count findings and the placeholder-based rewrite preview. It has no prop for original sensitive values.
- Approve and Ignore buttons use `type="button"` and only invoke callbacks; neither dispatches Enter, click, or submit events.
- Ignore remains disabled until a reason is entered, then passes that reason to `onIgnore`.
- `showModal` creates a fixed overlay host, attaches a closed shadow root, retains the returned `ShadowRoot` in module state, and renders Preact into it.
- `hideModal` unmounts Preact, removes the host, and clears both module references.
- Vitest now discovers `.tsx` tests. TypeScript is configured for Preact JSX.
- Added `@testing-library/preact` and `jsdom` as development dependencies.

## TDD evidence

### RED

Focused command:

```text
npx vitest run tests/modal.test.tsx

FAIL tests/modal.test.tsx
Error: Failed to resolve import "../src/ui/modal"
Test Files 1 failed
```

This was the expected pre-implementation failure: the test imported the required component and mount API before either module existed.

### GREEN

Focused command after implementation and test-harness cleanup:

```text
npx vitest run tests/modal.test.tsx

✓ tests/modal.test.tsx (4 tests)
Test Files 1 passed (1)
Tests 4 passed (4)
```

The first post-implementation run exposed missing Testing Library cleanup between tests (2 passed, 2 failed due to duplicate rendered dialogs). Adding `cleanup()` to `afterEach` fixed the test isolation defect; production behavior did not change.

Full suite:

```text
npm exec -- vitest run

Test Files 16 passed (16)
Tests 81 passed (81)
```

IDE lint diagnostics: no errors in the changed source, test, or configuration files.

## Test coverage

1. Renders class/count summaries and the rewritten preview.
2. Approve is a non-submit button and invokes `onApprove` once.
3. Ignore is disabled without a reason and invokes `onIgnore` with the entered reason.
4. Mount uses `{ mode: 'closed' }`, renders through the retained returned root while `host.shadowRoot` remains `null`, and removes the host on hide.

## Files changed

- `code/extension/src/ui/modal.tsx` — new modal component and privacy-shaped props.
- `code/extension/src/ui/mount.ts` — new closed-shadow mount/unmount helpers.
- `code/extension/tests/modal.test.tsx` — new jsdom component and mount tests.
- `code/extension/vitest.config.ts` — includes `.test.tsx`.
- `code/extension/tsconfig.json` — Preact JSX configuration.
- `code/extension/package.json` / `package-lock.json` — test dependencies.

## Self-review

- Scope is isolated to UI, mount helpers, tests, and required tooling; no Task 12+ wiring was added.
- Closed-root handling follows the binding resolution: rendering uses the retained `attachShadow` return value, never `host.shadowRoot`.
- I3 holds at the component boundary: there is no original-value prop or rendering path.
- Decision #8 holds by construction: both actions are ordinary non-submit buttons and only call supplied callbacks.
- `showModal` re-renders into one retained host; `hideModal` unmounts before removal and allows a clean future remount.
- No committed `dist/` drift was introduced.

## Concerns

- `npx tsc --noEmit` still exits non-zero on pre-existing errors in `src/detection/l1/nric.ts` and the missing declaration for `scripts/check-dist-drift.mjs`; the Task 11 test typing error found during the same run was fixed.
- `npm install` reports 16 dependency vulnerabilities (5 moderate, 7 high, 4 critical). No automatic audit fix was run because that would be out of scope and may introduce breaking upgrades.
- Visual polish and live-site integration are intentionally deferred; this task verifies behavior and shadow isolation, not final product styling.

## Commit

```text
67cfa34485e26caff0602b1a48e7cb77622383ef feat(ext): Preact modal in a shadow root with Ignore-with-reason
```

The final commit message has no `Co-authored-by` trailer.

## Fix pass

Review findings addressed: whitespace-only Ignore reasons rejected (trim before enable/submit), reason reset on `showModal` remount via incrementing `key`, dialog `aria-labelledby` added.

### Focused tests

```text
cd code/extension && npx vitest run tests/modal.test.tsx

✓ tests/modal.test.tsx (7 tests) 238ms
Test Files  1 passed (1)
Tests  7 passed (7)
```

### Full suite

```text
cd code/extension && npx vitest run

Test Files  16 passed (16)
Tests  84 passed (84)
```

### Commit

```text
a2866822ac7034d531c84f9325953508ac4d1d34 fix(ext): reject whitespace-only Ignore reasons in modal
```
