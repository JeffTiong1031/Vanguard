# U27 file-capture spike

> **Slice 2's rework trigger.** Raw MV3, zero dependencies — same rationale as the U12 harness:
> a build step between the claim and the browser makes a rework-trigger test ambiguous.

**Load unpacked:** `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
**No `npm install`. No build step.**

## What this tests

Three claims, reported separately (doc 05 §1: never test or report as one claim):

| Claim | Question |
|---|---|
| **U27-a** | A `window` capture listener on `change`, registered at `document_start`, fires before the page's handler, and `stopImmediatePropagation()` prevents the provider from uploading. |
| **U27-b** | The same for drag-and-drop (`dragover` + `drop`) and for clipboard paste of a file. |
| **U28** | Setting `input.files` from a synthesized `DataTransfer` and dispatching `change` causes the provider to accept and upload *our* file. |

## Results (awaiting live run)

🔴 **All verdicts PENDING.** Fill this table after Step 3 on real ChatGPT and Claude sessions.
**Network tab evidence wins over visual signals** — if a log row says `blocked: true` but Network shows an upload, the Network tab wins (CLAUDE.md §2 ledger #11).

| Claim | ChatGPT | Claude | Network evidence |
|---|---|---|---|
| **U27-a** (file picker / `change`) | PENDING | PENDING | — |
| **U27-b** (drop + paste) | PENDING | PENDING | — |
| **U28** (`__u27_reattach()`) | PENDING | PENDING | — |

## Step 3 protocol — run by hand on both surfaces

Load unpacked. On **chatgpt.com** and then on **claude.ai**, in this order:

1. Click the attach button, pick a small `.txt`. **Record: does a file chip / upload progress bar appear?** Expected on PASS: **no chip, no progress bar, no network upload.**
2. Open DevTools → Network, filter by the file's size. **Record whether any request carries the file.** This is the actual verdict — the absence of a chip is a visual proxy, and doc 05 §1.2's visual criterion is a *supporting* signal, not the measurement.
3. Drag the same file onto the composer. Repeat 1–2.
4. Copy an image to the clipboard, paste into the composer. Repeat 1–2.
5. In the console, run `__u27_reattach()`. **Record: does the provider show a chip for `vanguard-test.txt`, and does it upload?**
6. `copy(__u27_dump())` and save to `captures/<surface>-<date>.json`.

## Console helpers

| Function | Purpose |
|---|---|
| `__u27_reattach()` | U28 probe — synthesize `vanguard-test.txt` on the first `input[type=file]` and dispatch `change`. |
| `__u27_dump()` | Return the full event log as JSON. |

## Stop condition

If **U27-a fails on either surface**, STOP. The plan's shape is wrong and remaining tasks are built on it. Do not narrow a timing window to make it pass — fix the attribution or fix the capture, never the tolerance.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 content script on ChatGPT + Claude, `document_start`, isolated world, all frames. |
| `capture.js` | Window-capture listeners for `change`, `drop`, `dragover`, `paste`. Logs filenames and sizes only — never file content (U26). |
| `captures/` | Save live-run JSON dumps here. |

## After the live run (Steps 4–5 — not done yet)

1. Read the raw capture before writing verdicts.
2. Update the results table above with PASS/FAIL and network evidence.
3. Register **U27** and **U28** in `ASSUMPTIONS.md` §3 with verdicts and scope (two websites on one date — moves on the D4 clock).
