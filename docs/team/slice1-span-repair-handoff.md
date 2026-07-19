# Slice 1 — span repair for stock NER output

**For:** whoever owns Slice 1's L2 path · **From:** the sensitive-vs-not ML track · **Date:** 2026-07-19
**Status:** measured in `ml/`, ported by Slice 1. This document is the spec; the reference
implementation is [`ml/src/sens/span_repair.py`](../../ml/src/sens/span_repair.py) with 29 tests.

> **This is not the sensitivity classifier.** ADR 0018 puts that after Slice 2 and nothing here
> changes it. Span repair is **deterministic post-processing on the stock NER's output** — no model,
> no new dependency — and it applies to Slice 1 exactly as it is today.

---

## 1. Why this is not optional

**Slice 1 currently violates doc 04 §4.3.**

The stock NER proposes `Rahman`. The rubric requires the honorific **inside** the masked span, so
the correct span is `Encik Rahman`. Masking the bare name leaves:

```
Tolong ingatkan Encik ███████ pasal mesyuarat.
```

`Encik ____` is a re-identification pointer, and doc 04 §4.3 calls that **a compliance failure, not
a cosmetic one**. The same applies to `鲁迅先生` proposed as `鲁迅`, and to `Dato' Seri Anwar`
proposed as `Anwar`.

It also fragments. Measured on a 562-question exam, the stock NER proposes `阿里巴巴` as **two**
spans — `阿` and `阿里巴巴` — and `Encik Rahman` as `En` + `Rahman`. Masking `阿` and leaving
`里巴巴` in the prompt is a leak with a receipt.

---

## 2. Measured impact

Exam of 562 questions, `Davlan/bert-base-multilingual-cased-ner-hrl`, MASK spans covered **in full**:

| | raw NER | + span repair | + repair & org dictionary |
|---|---|---|---|
| **All** | 65.3% | **88.7%** | **93.2%** |
| en | 79.4% | 94.1% | 94.1% |
| bm | 73.8% | 90.2% | **96.7%** |
| mixed | 62.3% | 91.3% | 92.8% |
| **zh** | **46.3%** | 79.1% | **89.6%** |
| Fragment rate | 22.5% | 6.0% | 4.9% |

**+23pp from span repair alone.** For scale: four rounds of classifier training in this track moved
the integrated number by under half a point.

**Cost, measured:** 3.5% of repaired spans over-extend by a role or department word
(`会计部的张先生` for `张先生`, `Vendor Acme Corp` for `Acme Corp`). That is a utility cost, not a
privacy failure — the wider span is still sensitive — and it is the right side to err on.

---

## 3. The algorithm

Three passes over the NER's proposed `[start, end)` character offsets, in this order.

### 3.1 Merge

Union spans that overlap or touch. `(0,1)` and `(0,4)` become `(0,4)`.

**Do not bridge gaps by default.** Joining spans separated by a character or two bought +0.4pp and
caused most of the over-extension — it welds a department ORG onto an adjacent PER. Make it an
option, default off.

### 3.2 Expand titles

For each span:
- **Leading** (Latin/BM): if the text immediately before the span ends with a known title, move
  `start` back to include it. Match **longest first** so `Dato' Seri` wins over `Dato`. The title
  must sit on a word boundary — `Sir` must not be pulled out of `Kasir`.
- **Trailing** (CJK): if the text immediately after the span begins with a known suffix, extend
  `end` over it.

### 3.3 Expand ORG tails

If a known organisation tail appears within **12 characters** after the span, extend to include it —
`Unilever` → `Unilever Malaysia`, `华为` → `华为供应链伙伴`.

**Guard:** if any sentence punctuation (`.,;!?，。；！？、\n`) sits between the span and the tail,
do not extend. Without this, a tail belonging to a *different* organisation later in the sentence
gets absorbed.

Then **merge again** — expansion can create new overlaps.

---

## 4. The lists

Copy from [`span_repair.py`](../../ml/src/sens/span_repair.py); they are maintained there.

🔴 **Provenance rule, and please keep it.** Entries are attested in the training set's gold spans
(≥2 distinct spans) or are general linguistic knowledge. They are **not** mined from the exam's
failures. `律师`, `主管`, `Chef`, `Uncle`, `Laksamana` were all seen failing on the exam and are
**deliberately absent** — adding them would tune the ruler against the thing it measures. A test
asserts their absence with the reason.

⚠️ **The lists are the instrument.** An incomplete list silently understates everything: this track
reported honorific counts of 5, 8 and 22 for one file before the list was complete. Treat them as
maintained data, not finished constants — and when you add one, note where the evidence came from.

---

## 5. Test cases worth porting

Every one of these is a real stock-NER output, not an invented case:

| input | NER proposes | must become |
|---|---|---|
| `Tolong ingatkan Encik Rahman pasal mesyuarat.` | `Rahman` | `Encik Rahman` |
| `鲁迅先生在《朝花夕拾》中…` | `鲁迅` | `鲁迅先生` |
| `Ucapan Dato' Seri Anwar disiarkan langsung.` | `Anwar` | `Dato' Seri Anwar` |
| `我们公司目前欠阿里巴巴一笔…` | `阿` + `阿里巴巴` | `阿里巴巴` (one span) |
| `请联系林女士确认订单。` | `林` | `林女士` |
| `Invois daripada Maju Trading Sdn Bhd…` | `Maju Trading` | `Maju Trading Sdn Bhd` |
| `请跟进华为供应链伙伴的月度采购…` | `华为` | `华为供应链伙伴` |
| **`Kasir Rahman sudah balik.`** | `Rahman` | **`Rahman`** — `Sir` is inside `Kasir` |
| **`Ask Acme. Then call Beta Holdings…`** | `Acme` | **`Acme`** — punctuation blocks the tail |
| `Ask Alice about the report.` | `Alice` | `Alice` — no title, unchanged |

Repair must also be **idempotent**: running it on its own output changes nothing.

---

## 6. Also worth knowing: the org dictionary closes what remains

After repair, the residual misses are the NER simply not proposing recognisable companies —
`Proton`, `TNB`, `腾讯`, `阿里巴巴`, `字节跳动`, and `Boeing` in an English sentence. The same entity
is tagged in one sentence and missed in another, so it is instability, not a fixed gap.

An **exact-match** dictionary (ADR 0004) closes most of it: +4.5pp overall, **+10.5pp on Chinese**,
complete blind spots 6.4% → 2.3% — using a dictionary that covered only half the exam's
organisations. Reference implementation:
[`ml/src/sens/org_dictionary.py`](../../ml/src/sens/org_dictionary.py), 16 tests.

⚠️ **Exact match only, case-sensitive, word boundaries on Latin terms.** ADR 0004 forbids fuzzy
matching in Phase 0: this layer's whole value is precision, precision is quasi-contractual under
ADR 0001, and `Apple` must not fire on "an apple a day" nor `Grab` inside "grabbed".

---

## 7. What this does not fix

- **~2.3% of sensitive entities remain invisible** — neither the NER nor a dictionary proposes them.
- All figures come from a **`human_simulated`** exam, not production traffic. ADR 0015's residual
  stands.
- The NER measured here is a **stand-in**. Re-measure on the NER Slice 1 actually ships — that
  remains a mandatory integration gate, and these numbers do not discharge it.
