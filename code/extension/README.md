# `extension/` — Slice 1 chat gate + Slice 2 file checking (L1 + L2)

Working Manifest V3 extension for the **team test**: ChatGPT + Claude, typing hints, send-time
review, on-device NER, and attach-time file checking. Load unpacked from committed `dist/`.

**Full runbook (backend + extension):** [repo README](../../README.md).  
Chat-only works without the API; **attachments need** the local backend on `http://localhost:8000`.

Acceptance checklist: [`ACCEPTANCE.md`](ACCEPTANCE.md). Technical choices: [ADR 0017](../../docs/adr/0017-slice-1-technical-choices.md). Typing hints: [ADR 0024](../../docs/adr/0024-slice-1-5-l1-composer-hints.md). Send review: [ADR 0025](../../docs/adr/0025-send-time-per-span-review.md). Files: [ADR 0027](../../docs/adr/0027-cleaned-extract-replaces-attachment.md) · [ADR 0028](../../docs/adr/0028-backend-parses-extension-detects.md).

## Load unpacked (no build)

```text
code/extension/dist/chrome-mv3
```

Options → **File checking API URL** defaults to `http://localhost:8000`.

## Develop

```bash
npm install
npm test
npm run build       # updates dist/ + drift stamp
npm run check:dist  # CI-style: dist must match a fresh build
```

## Layout

```
entrypoints/
  background.ts     SW · offscreen lifecycle · no webRequest in Slice 1 (ADR 0017)
  content.ts        ISOLATED · gate @ window · adapters · hints · modal
  offscreen/        L2 ONNX Runtime (Window context)
src/
  gate/             capture listeners · approval token · decideGate
  adapters/         ChatGPT + Claude composers / send controls
  detection/l1/     deterministic identifiers (NRIC, SSM, TIN, email, card)
  detection/l2/     stock multilingual NER (PERSON/ORG; LOC off)
  mask/             placeholders · SessionNumbering (ADR 0011)
  ui/               Send review modal · composer hints · mount / focus trap
  audit/            class + count + salted hash only (I3 / U26)
```

**No MAIN-world injection** in Phase 0 ([ADR 0012](../../docs/adr/0012-observer-uses-webrequest.md) — observer deferred for Slice 1).

## Invariants to keep

1. **Vault / numbering is forward-only** — no `PERSON_1 → John Tan` reverse path; no rehydration into the provider page (E2).
2. **Verdict cache is monotonic toward dirty** ([ADR 0013](../../docs/adr/0013-two-stage-verdict.md)) — L1 may write DIRTY; only completed L1+L2 may write CLEAN.
3. **L1 placeholder grammar is masked before L2** so the model does not tag our own `PERSON_1`.
4. **Dead engine → advisory**, never fail-closed ([ADR 0014](../../docs/adr/0014-degrade-to-advisory-never-closed.md)).
5. **User presses Send** after Proceed — no auto-submit (decision #8).
