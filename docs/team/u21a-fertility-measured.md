# U21-a — fertility, measured

**Date:** 2026-07-19 · **Corpus:** Wikipedia (`wikimedia/wikipedia`, CC BY-SA), 3M tokens per
language, counts only — no text retained · **Tokenizer:** `microsoft/mdeberta-v3-base`
**Script:** [`ml/scripts/measure_fertility.py`](../../ml/scripts/measure_fertility.py)

U21-a had been open across several documents, described in CLAUDE.md as *"the package's
highest-value measurement"* and *"a lower bound nobody took"*. It is closed. It took an
afternoon and needed no labels, no PII and no corpus we did not already have access to —
exactly as doc 07 §3 argued when it identified the blocker as a false dependency.

---

## 1. Fertility

| | tokens/char | relative to English |
|---|---|---|
| en | 0.2577 | 1.00× |
| **ms** | 0.2616 | **1.01×** |
| **zh** | 0.7173 | **2.78×** |

### 🔴 Malay carries no tokenizer penalty. Chinese carries all of it.

This corrects an assumption that has been implicit across the package, including in my own
reasoning earlier today: **BM and ZH are not one category.** Malay tokenizes at essentially the
same rate as English. The penalty is entirely Chinese.

**Consequence for doc 06 §4.3.** Its argument — *"the wedge's languages are the slowest on the
critical path"* — holds **for Chinese only**. A Malay paste is the same number of forward passes
as an English one of the same length. The section is right about the effect and wrong about its
scope, in a way that made the wedge look uniformly expensive when it is expensive in one
language.

**Consequence for doc 06 §4.2.** Chunk count is `ceil(tokens / 512)`, and users paste
*characters*. The same visual paste is **2.78× the chunks in Chinese** — measured, not estimated.

### doc 06 §4.3's estimate was close

It said *"roughly 3× the forward passes in Chinese (estimate)"*. Measured: **2.78×**. The
estimate was mildly pessimistic and directionally right. Replace the `(estimate)` tag.

---

## 2. Vocabulary coverage — trimming is viable, but only if done correctly

| coverage of the combined corpus | vocabulary entries needed |
|---|---|
| 99.0% | 44,981 |
| **99.9%** | **73,436** |
| 99.99% | 81,567 |

CLAUDE.md §6.2's *"~70K tokens for ~99.9% coverage"* is confirmed: **73,436 measured**.

### 🔴 But the METHOD decides whether the wedge survives

Two ways to keep 70,000 entries, and they are not close:

| keep 70,000 | en | ms | **zh** |
|---|---|---|---|
| **by frequency** (correct) | 0.9990 | 0.9979 | **0.9989** |
| by token id (naive) | 0.8957 | 0.8866 | **0.7541** |

**Same budget. Chinese coverage 99.89% or 75.41%, depending only on how the 70,000 are chosen.**

A token-id cut looks defensible — SentencePiece ids are roughly frequency-ordered — but that
ordering reflects **mDeBERTa's global training mix**, which is dominated by high-resource
languages. BM and ZH tokens sit at high ids because they are globally rare, not because they are
rare in the text we serve. The pieces a naive cut discards are core wedge vocabulary: `pasal`,
`Sila`, `hantar`, `semalam`, `经理`, `阿里巴巴`, and the `SSM` / `TIN` identifier fragments.

> **This is doc 06 §6.3's "the wedge is what trimming eats", located precisely.** It is not
> inherent to trimming. It is inherent to trimming *by the wrong ordering*, and the correct
> ordering costs one afternoon of counting.

---

## 3. What this unblocks and what it does not

🟢 **doc 06 §4.4's second entrance to the distillation trigger does NOT fire.** That section
warned that if fertility forced us to *keep* a larger vocabulary to protect BM/ZH, we would not
get the halving and would miss the target *"without ever having made a memory decision"*.
Measured, 70K serves all three languages at 99.8%+, so the halving is available:

```
86M backbone (irreducible) + 70K vocab = 139.8M params = ~533 MB fp32
D2 budget ~1-2 GB addressable  ->  ~0.8-1.1 GB resident. Fits.
```

⚠️ **Coverage is not accuracy.** 99.89% of *tokens* covered does not mean the model scores the
same after its embedding table is cut. Trimming must be followed by re-running the locked exam,
and Chinese must be checked separately — if it drops, the trim is reverted.

⚠️ **The corpus is Wikipedia, not Malaysian office chat.** Encyclopaedic register under-represents
the transactional language the product actually sees. The frequency table should be re-derived
against real traffic when there is any (which is also ADR 0015's problem, from a different angle).

⚠️ **U21-b remains open.** This measured the *stock* vocabulary's fertility. Fertility *after*
trimming — which only ever rises — is a separate measurement, and per CLAUDE.md a rise there
feeds straight back into the latency budget.
