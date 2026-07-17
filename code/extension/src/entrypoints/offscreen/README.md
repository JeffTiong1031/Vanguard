# Offscreen document — the engine host

**STUB.** ADR 0006.

🔴 **ONE instance, all tabs.** Content scripts run **per tab**; the L2 model is **~140 MB trimmed**
(doc 03 §4.2, derived — `70,000 × 768 + 86M = 139.8M`). Five ChatGPT tabs would be five model
instances — **instantly fatal on D2** (8–16 GB, ~1–2 GB realistically addressable). Doc 03 §4.4:
*"ADR 0006 is what makes this budget survivable."*

**The service worker cannot host it either:** MV3 terminates it at **exactly 30 s idle** (U10 ✅
cited), and reloading the model on most wakes is absurd. **ADR 0006 rejected the SW on lifecycle, not
on GPU access** — which matters for the correction below.

## ⚠️ The correction that is easy to lose, and inverts a budget

> **An offscreen document is a Window context, so WebGPU IS available here** (doc 03 §5, doc 06 §6.4).
> **ADR 0006's choice PRESERVES GPU access rather than trading it away.**

A fresh reader can plausibly infer the opposite — *"they put the engine in a sandboxed doc, so no
GPU"* — and **a budget built on that inference is pessimistic in a way that changes conclusions.**

**D3 still stands, unchanged:** WebGPU is **opportunistic**, hardware- and policy-dependent, **never a
requirement.** CPU/WASM is the baseline.

**U15** (WebGPU under enterprise Chrome policy) is open, and **the pessimistic case is the likely
one** — it rides the **same machine-policy channel as B3**, so it may be disabled on exactly the fleet
we target.

**U22 — the lever that is OURS, not the fleet's.** The offscreen document is **our own page**, so we
may be able to set COOP/COEP via the manifest → `SharedArrayBuffer` → **multi-threaded WASM** in ONNX
Runtime Web. `[verify]` — both the manifest keys and ORT's threading requirements are **unverified**.
**Unlike WebGPU this does not depend on the customer's policy**, which makes it the more dependable
lever on exactly the managed fleet where U15 is most likely disabled. **Doc 06 §4.2's chunks are
embarrassingly parallel**, so the payoff lands on the paste path.

## The runtime, and why not a wrapper

**ONNX Runtime Web**, WASM baseline. Doc 01 §6 rejected `transformers.js` because **quantization
control *is* the memory budget** — *"a wrapper that abstracts that away abstracts away the thing we're
optimizing."*

## Blocked on

- **U6-b** — the number the gate lives on. **Its curve is ours** (week 1, no human needed); **its
  threshold is B3-blocked** (the user's measured `Ctrl+V` → `Enter` interval, which needs a design
  partner on real work).
- 🟢 **U21-a** — free and available now:
  [`../../../../spikes/u21a-fertility/`](../../../../spikes/u21a-fertility/).
- **The runtime multiple** — doc 03 §4.4 **refuses** to assert the ~1.5–2× rule of thumb and doc 06
  §6.1 accepts the assignment without discharging it by restating the range. **Measure it: resident
  set of this document, on D2, model warm, at P95 sequence length.**
  🔴 **And measure it in Chinese** — activation memory scales with sequence length, and doc 06 §4.3
  says the wedge's languages produce the longest sequences. **An English measurement flatters us.**

## The lifecycle bug that is a correctness bug, not a perf one

**Chrome may reclaim this document mid-thread** (ADR 0006), and the SW must recreate it — the first
scan after recreation pays the model-load cost.

🔴 **ADR 0011: a reclaim must NOT restart placeholder numbering.** See
[`../../vault/README.md`](../../vault/README.md). **The counter is a separate record and outlives the
mappings. Do not tidy them into one object.**
