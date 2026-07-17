# U21-a — stock-vocabulary fertility

> **Doc 07 §3.3.** The measurement the package spent two documents believing was blocked.
>
> **Run it in an afternoon, in week 1, before anything is built.**

```bash
pip install transformers sentencepiece      # tokenizer only — no torch, no model weights
python fertility.py --corpus ./corpus --json out.json
```

```
corpus/
  en/*.txt      ms/*.txt      zh/*.txt        # raw text. No labels. No PII. Nothing annotated.
```

---

## Why this is free, when three places said it wasn't

**Doc 06 §4.4, doc 06 §9 and `ASSUMPTIONS.md` U21 all said the fertility spike was *"blocked on the
corpus (U14/C2 → C3)."*** It isn't, and doc 07 §3.1 is the argument in one line:

> **U14 is a *PII* corpus. Token frequency and fertility are unsupervised** — they need no labels, no
> PII, and no annotation of any kind. **Only raw text.**

Doc 03 §4.2 blocked the **vocabulary pick**, correctly — a frequency table must be representative of
what users type. Doc 06 discovered fertility also governs **latency** (its best finding) and inherited
doc 03's blocker along with the metric, **without re-sizing it.** The three budgets need different
fidelity, and latency needs only a **ratio**.

**Doc 03 §3.3 cited the proof and nobody noticed what it proved:** mDeBERTa is *"trained on **CC100
Malay**."* Large public Malay and Chinese corpora demonstrably exist — the model we chose is evidence
of it.

---

## Why it goes first: the failure is final

**Doc 06 §4.4's own finding is that trimming can only *raise* fertility** — drop vocabulary rows BM/ZH
was using and those words fall back to shorter pieces or bytes. **So the stock vocabulary is the
floor.**

| Result | Meaning |
|---|---|
| 🔴 **ZH chunk count blows the paste budget** | **FINAL.** Trimming cannot rescue it. **Doc 06 §6.2's distillation trigger has fired — through its second entrance, with no memory decision ever made.** You learned this in week 1 from public text. |
| 🟢 **It passes** | **PROVISIONAL.** U21-b (trimmed vocabulary) is still owed and *is* corpus-blocked. |

**A cheap test that can only deliver bad news definitively is the best kind to run first.**

---

## What corpus

**Anything large and raw, in each language.** The script does not care what it is. Candidates worth
an hour: CC100, OSCAR, Wikipedia dumps, Malaysian news or forum text. **This document names no source
as verified** — doc 07 §3.4's search bar is declared there, and per doc 03 §4.1's lesson, naming
sources nobody opened is how the one fabrication in this package shipped.

> ⚠️ **The distribution caveat, and it is the whole point of doc 07 §3.2's split.** A ratio measured
> on Wikipedia/CC100 Malay is **not** a ratio measured on WhatsApp-register Bahasa Rojak.
>
> - **For a *ratio*, that is second-order.** Chinese has no whitespace in either register.
> - **For the *vocabulary pick*, it is first-order** — which is exactly why doc 03 §4.2 blocked that
>   and not this.
>
> **That distinction is the finding.** Do not let a good ratio be read as a licence to pick a
> vocabulary.

---

## What it also measures, free

**Doc 07 §6.2's chunk overlap**, because it is the same tokenizer pass:

- The **longest span we intend to detect** and the **longest context token** (doc 03 §2.3's
  `Company No.` / `No. KP` disambiguators). Their sum is the overlap's **floor**.
- **The window is *leading*, not symmetric** — §2.3's disambiguator *precedes* the digits.
- **This is the one number in doc 07 that is neither B3-blocked nor corpus-blocked**: the longest span
  is a property of **our own detector list**. We own both sides.

**It also prints the actual segmentation**, which resolved a doc 03 §3.1 claim tagged *"measure it
rather than argue"*: `890101-14-5555` → `['▁89', '0101', '-14-', '5555']`. **Four tokens, on near-
perfect semantic boundaries — not "digit soup."** It changes nothing, because doc 03 §3.2 already
routes around it (L1 masks the IC before L2 sees it). **That is the package working: §3.1 declined to
depend on a number it hadn't measured, and when the number arrived, nothing moved.**

---

## What it refuses to produce

**No tokens/sec.** Not printed, not derived, not implied. Docs 03, 05, 06 and 07 each held this line
and produced none.

> Fertility is tokens per **character** — a property of the tokenizer and the text.
> Latency is a property of **hardware nobody has measured** (U6-b).
> **Multiplying one by a guess at the other is the fabrication `ASSUMPTIONS.md` exists to prevent.**

The identifiers it tokenizes are **synthetic, generated from a published grammar** (doc 03 §2.1/§2.4).
That is **C3-a**: the grammar is published, **L1 is written rather than trained**, so they are
**fixtures, not training data**, and their realism trains nothing (doc 07 §2.3).
