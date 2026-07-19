# Trying the sensitivity classifier

**Status: OFF by default.** With no model URL configured, nothing below runs and the extension
behaves exactly as it did. This is how to turn it on locally to see whether it fixes the
false positives you are hitting.

---

## What it changes

| prompt | today | with the classifier |
|---|---|---|
| `Explain Einstein's theory` | 🔴 blocked | **not blocked** |
| `Summarise Apple's quarterly earnings` | 🔴 blocked | **not blocked** |
| `李白的诗歌流传千古。` | 🔴 blocked | **not blocked** |
| `Einstein from accounting hasn't sent the invoice` | blocked | blocked |
| `Tolong ingatkan Encik Rahman pasal mesyuarat` | blocked | blocked |

The model scored **precision 1.000 / recall 0.996** on the locked 562-question exam.

---

## Setup

### 1. Serve the model

The artifact is **534 MB** and is not published anywhere, so serve it from disk. From the repo
root, in its own terminal:

```powershell
cd ml\artifacts\export\sens-v0.2.0-trim70k
python -m http.server 8765 --bind 127.0.0.1
```

Leave it running. Check it: <http://127.0.0.1:8765/model.onnx> should start downloading.

### 2. Point the extension at it

Open the extension's service worker console (`chrome://extensions` → **Inspect views: service
worker**) and run:

```javascript
chrome.storage.local.set({ vg_sensitivity_model_url: 'http://127.0.0.1:8765' })
```

Reload the extension. First use loads 534 MB from localhost — a few seconds.

### 3. Turn it back off

```javascript
chrome.storage.local.remove('vg_sensitivity_model_url')
```

---

## 🔴 Short prompts only, and why

The classifier runs **once per span**, and one forward pass costs (measured 2026-07-19,
single-thread WASM — what the extension actually gets):

| tokens | per span |
|---|---|
| 21 | 174 ms |
| 44 | 342 ms |
| 242 | **2,000 ms** |
| 512 | **4,758 ms** |

A pasted paragraph is longer *and* carries more entities: 242 tokens × 5 spans is **ten
seconds**. So anything above ~96 tokens skips the classifier and keeps today's behaviour.

**Skipping means over-masking, not under-masking.** A long paste stays fully masked, exactly as
it is now. The cutoff's failure mode is friction, never leakage.

Chinese hits the cutoff sooner for the same visual length — U21-a measured **2.78× the tokens per
character** — and the eligibility check uses the Chinese ratio whenever it sees CJK, so a Chinese
paste cannot slip through at three times the intended budget.

Adjust it if you want:

```javascript
chrome.storage.local.set({ vg_sensitivity_max_tokens: 150 })
```

⚠️ **96 is `(estimate)`.** It comes from a floor measured on a machine that is not D2 —
`ASSUMPTIONS.md` rates D2 Medium confidence with HIGH blast radius and asks for a real device
survey. Corporate laptops will be slower. This is a knob, and the team test is what replaces it.

---

## What to watch

Open the **offscreen document** console (`chrome://extensions` → Inspect views → `offscreen.html`):

```
[sensitivity] 1 spans in 210 ms — 1 released, 0 masked, 0 unjudged (kept)
```

- **released** — the classifier said this is not sensitive, so it is no longer masked
- **masked** — judged sensitive
- **unjudged (kept)** — could not be judged, so it stays masked. **Fail-safe is to mask.**

If the model is unreachable the console says so once and everything stays masked — ADR 0014's
degrade-not-decide rule.

---

## What this is not

- **Not shipping.** 534 MB from localhost is a test rig. ADR 0017 already flags the hash-pinned
  CDN fetch as *"fine for the team; not the shipping answer"*, and this is three times the size
  of the model that comment was about.
- **Not integrated per ADR 0018.** Sequencing is Slice 1 → team test → Slice 2 → then sensitivity.
  This is a switch you turn on to evaluate, not a decision that it ships.
- **Not the un-mask UX.** Above the cutoff nothing changes, so the "blocked then released
  seconds later" behaviour never appears. That design question is still open and is a product
  decision.
- **Not validated on real traffic.** Every figure comes from a `human_simulated` exam. ADR 0015's
  real-substrate requirement is undischarged.
