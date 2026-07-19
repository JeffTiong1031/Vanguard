# Classifier integration — measured, and NOT integrated

**Date:** 2026-07-19 · **Decision: do not integrate yet** (founder, 2026-07-19)
**Model:** `sens-v0.2.0-trim70k` — 140.0M params, 534 MB fp32 ONNX, round-trip verified

The sensitivity classifier now fits the device budget and scores 1.000 precision / 0.996 recall
on the locked exam. It is still not wired into the extension, and this records why in numbers so
the decision can be revisited against evidence rather than re-argued.

---

## 1. What the classifier would fix

The complaint that started this: **`Explain Einstein's theory` gets blocked.** That is ADR 0017's
documented limitation — Slice 1's L2 is PERSON/ORG tagging with no notion of sensitivity, so
every entity is masked regardless of context.

Run through the trained classifier:

| prompt | verdict |
|---|---|
| `Explain Einstein's theory` | **KEEP** (1.000) |
| `Einstein from accounting has not sent the invoice.` | MASK (1.000) |
| `Summarise Apple's latest quarterly earnings.` | **KEEP** (1.000) |
| `Chase payment from Apple; they owe us RM50,000.` | MASK (1.000) |
| `李白的诗歌流传千古。` | **KEEP** (1.000) |
| `李白先生，您的退款已经处理完毕。` | MASK (1.000) |
| `Siapakah Tun Dr. Mahathir Mohamad?` | **KEEP** (1.000) |

Same name, opposite verdicts by context. **The gap ADR 0017 named is closed in the model.**

> ⚠️ One error worth carrying: on `Chase payment from Apple`, the NER tags the verb **`Chase`**
> as an entity and the classifier then masks it. The classifier is not wrong — it was handed a
> bad span. This is Task 18's finding in miniature: integrated quality is NER-bound.

---

## 2. Why it is not integrated: the paste path

Measured with `onnxruntime-web`, **single-thread WASM** — what ADR 0017 actually ships (no
COOP/COEP, no SharedArrayBuffer, U22). Harness:
[`code/extension/scripts/measure-wasm-latency.mjs`](../../code/extension/scripts/measure-wasm-latency.mjs).

| tokens | WASM p50 | native CPU p50 | multiplier |
|---|---|---|---|
| 21 | **174 ms** | 67 ms | 2.6× |
| 44 | **342 ms** | 113 ms | 3.0× |
| 128 | **989 ms** | — | — |
| 242 | **2,000 ms** | 598 ms | 3.3× |
| **512** | **4,758 ms** | — | — |

**The runtime multiple is ~3×**, measured rather than inherited — doc 06 §6.1's rule applied to
inference instead of memory.

### Typing is fine. Paste is not.

The classifier runs **once per span**. On the exam a prompt carries p50=1, p95=1, max=2 spans, so
a typed prompt costs **174–342 ms** — inside the gate's budget.

But doc 06 §3 established that **paste is the critical path**, not typing: it is one event
followed by Enter, the cache is cold by construction, and doc 00 §6 calls accidental paste the
dominant real-world leak. A pasted paragraph is both *longer* and carries *more entities*:

```
242 tokens x 1 span   =  2.0 s
242 tokens x 5 spans  = 10.0 s
512 tokens x 1 span   =  4.8 s
```

⚠️ **Chinese lands further down that table for the same visual paste** — U21-a measured 2.78×
the tokens per character. Third time the wedge's language is the expensive case.

---

## 3. 🔴 The design problem this exposes, which ADR 0013 does not cover

ADR 0013's two-stage verdict says L1 may declare DIRTY alone in sub-ms, so **the L2 wait is only
ever paid to say "clean"**. That still holds. But the sensitivity classifier inverts the role:

```
NER says PERSON  ->  today: mask
                 ->  with classifier: possibly UN-mask
```

**The classifier runs on the already-masking path, and its job is to cancel a mask.** So:

- A classifier timeout must **keep** the mask. Fail-safe is to mask, not to release — consistent
  with ADR 0013's monotonic-toward-dirty rule.
- But the user-visible behaviour becomes *"blocked, then possibly released seconds later"*,
  which no ADR has specified and which is a product decision, not an engineering one.

---

## 4. Why the decision is to wait

🔴 **This machine is not D2.** `ASSUMPTIONS.md` defines D2 as a mid-range corporate laptop —
~4-core x86, 8–16 GB RAM, integrated graphics, **no discrete GPU** — and rates it **Medium**
confidence with **HIGH** blast radius, noting it *"should be replaced with a real device survey
from the first design partner"*. Every number above is a **floor** for the fleet the product
targets.

Designing the un-mask UX on top of a floor measured on the wrong hardware would be inventing a
product behaviour to fit a number we do not have. The options were:

| | |
|---|---|
| **A** | Run the classifier only on short prompts | Leaves the dominant leak path unimproved |
| **B** | Run it asynchronously, mask-then-release | Long pastes benefit; the UI jumps |
| **C** | **Measure, report, wait for D2 data** ← chosen | Nothing ships on a guess |

---

## 5. What is ready when the decision unblocks

- `sens-v0.2.0-trim70k` — 534 MB fp32 ONNX, ORT round-trip verified (`9.06e-06`, argmax agrees),
  tokenizer rebuilt to 70,226 entries, `SHA256SUMS` present.
- Exam: precision 1.000, recall 0.996, **zero regression** against the untrimmed model on every
  language.
- Fits D2's stated ~1–2 GB envelope at ~0.8–1.1 GB resident. **Distillation is not required.**
- int8 remains **BLOCKED** — it produces a degenerate always-KEEP model — and no longer matters.

## 6. What is still owed

1. **A real D2 device survey.** Every latency and memory figure is gated on it.
2. **doc 06 §6.1's memory measurement** — resident set on D2, warm, at P95 sequence length, in
   Chinese. Not taken.
3. **The un-mask UX decision** (§3) — product, not engineering.
4. **534 MB delivery.** Hash-pinned first-run download works for the NER at ~180 MB; three times
   that on a locked-down corporate network is a different question, and ADR 0017 already flags
   the CDN fetch as "fine for the team; not the shipping answer".
5. **ADR 0015's real substrate.** Unchanged, and still the thing no engineering step discharges.
