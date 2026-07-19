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

## Results (live run 2026-07-18, founder)

**Network tab evidence wins over visual signals.** Scope: **two websites, one date, Windows** — moves on the D4 clock. Captures: `captures/chatgpt-2026-07-18.json`, `captures/claude-2026-07-18.json` (U28 dumps; U27-a/b evidence was founder Network observation + console `blocked:true`).

| Claim | ChatGPT | Claude | Network evidence |
|---|---|---|---|
| **U27-a** (file picker / `change`) | ✅ PASS | ✅ PASS | Console `blocked:true`; no file chip; Network only small telemetry (`library`/`prepare`/`t`) — no file upload |
| **U27-b** (drop + paste) | ✅ PASS (block) | ✅ PASS (block) | Console `blocked:true` for `drop` and `paste`; no provider upload. ⚠️ Spike UX: drop overlay can hang / paste shows nothing — **product Task 8 must own chip + overlay dismiss**; not a silent fail-open |
| **U28** (`__u27_reattach()`) | ✅ PASS | ✅ PASS | After harness passthrough fix: `ok:true`, chip for `vanguard-test.txt`. ChatGPT: `files` / `raw?…` **201** / `process_upload_stream`. Claude: `upload-file` **200** |

🔴 **U29** (providers upload on attach, not only on Send) is supported by U28’s immediate upload after reattach and by U27-a’s need to block at attach — recorded in `ASSUMPTIONS.md`.

## After the live run

Steps 4–5 done 2026-07-18: results table above; **U27 / U28 / U29** registered in `ASSUMPTIONS.md` §3.

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

🔴 **DevTools context:** helpers live in the content-script world. In Console, set the context dropdown to **U27 file-capture spike** (not `top`). On `top`, `typeof __u27_reattach` is `"undefined"` even when the spike is loaded.

🔴 **U28 passthrough (2026-07-18 harness fix):** `__u27_reattach` sets a one-shot `allowNextChange` flag so the capture listener does **not** block/clear our own synthetic `change`. Without that, U28 always self-fails (`blocked: true` then `ok: false`). After editing `capture.js`, click **Reload** on the extension at `chrome://extensions`, then refresh the ChatGPT/Claude tab.

## Stop condition

If **U27-a fails on either surface**, STOP. The plan's shape is wrong and remaining tasks are built on it. Do not narrow a timing window to make it pass — fix the attribution or fix the capture, never the tolerance.

## Files

| File | Role |
|---|---|
| `manifest.json` | MV3 content script on ChatGPT + Claude, `document_start`, isolated world, all frames. |
| `capture.js` | Window-capture listeners for `change`, `drop`, `dragover`, `paste`. Logs filenames and sizes only — never file content (U26). |
| `captures/` | Live-run JSON dumps. |