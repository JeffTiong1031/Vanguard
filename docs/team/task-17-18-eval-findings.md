# Tasks 17–18 — evaluation findings

**Branch:** `ml-sensitive-vs-not` · **Date:** 2026-07-19 · **Model under test:** `colab_v7`
**Exam:** `human_simulated`, 532 questions, SHA256 `26F0693E2A58AC4C98D8A41E600B88322735A01D62ACE290992F6DDA9B122DDA`

> **What this document is for.** Two findings here are not visible in any metric the plan asked
> for, and both were found by probes built after the metrics came back clean. Written down so the
> next session does not have to rediscover them.

---

## 1. Headline numbers

| Measurement | Value |
|---|---|
| Classifier, gold spans (Task 17) | precision **1.0000** · recall **0.9961** · 1 error in 500 |
| Classifier, NER-proposed spans (Task 18) | precision **1.0000** · recall **0.9960** |
| **MASK spans the NER covers in full** | **64.3%** |
| **Effective MASK miss rate** | **35.7%** |
| **Integrated MASK recall (estimate)** | **≈ 0.641** |
| `ship_status` | `SHIP_CANDIDATE` |

**None of these is evidence the model is accurate in the field.** The substrate is
`human_simulated`; ADR 0015's residual is undischarged.

> 🔴 **These figures were first published here as `ner_miss_rate 7.2%` and
> `integrated recall ≈ 0.924`. Both were wrong by about a factor of ten** — see §3.1. The
> corrected numbers are above. `ner_miss_rate` is retained in the report as a diagnostic but
> **must not be quoted as the product number**; `mask_effective_miss_rate` is the product number.

---

## 2. 🔴 The exam scored ~100% while the model was using a shortcut the rubric forbids

`label-schema.md` opens by saying the model must classify **by surrounding context, not by the
entity's fame**. The corpus taught it fame anyway, and the exam could not see it because the exam
carried the identical confound.

**The confound, as measured before the fix:**

| | generic-sounding ORG name | business honorific on a PER |
|---|---|---|
| Training set | MASK 46 / KEEP **0** → `P(MASK) = 1.000` | `P(MASK) = 0.988` |
| Exam | MASK 45 / KEEP **0** → `P(MASK) = 1.000` | `P(MASK) = 0.928` |

**A generic company name was never labelled KEEP anywhere — zero counterexamples in either file.**
So a model could reach ~100% by learning "unfamiliar name → MASK".

**The probe that caught it.** Substitute a span's surface with a different entity of the same type
and leave the sentence untouched. The gold label cannot change, so any flip is the model reading
the name rather than the relationship:

| Sentence (unchanged) | Substitution | Result |
|---|---|---|
| *What products does **X** offer to enterprise customers?* | `Google` → `Bestari Supplies Sdn Bhd` | KEEP → **MASK** (0.999) |
| ***X** menyalurkan bekalan elektrik ke seluruh Semenanjung.* | `Tenaga Nasional Berhad` → `Apex Medical Labs` | KEEP → **MASK** (0.987) |
| ***X** menyampaikan ucapan belanjawan.* | `Datuk Seri Anwar Ibrahim` → `Mr. Henry Vance` | KEEP → **MASK** (1.000) |

**The fix was data, not modelling.** 137 human-written counterexamples — generic names and business
honorifics in public/topical contexts, labelled KEEP:

| | before | after |
|---|---|---|
| Training `P(MASK \| generic ORG)` | 1.000 | **0.637** |
| Training `P(MASK \| biz honorific PER)` | 0.988 | **0.689** |
| **Substitution-probe flips** | **9 / 470** | **2 / 500** |
| Exam counterexample questions | — | **30 / 30 correct** |

### Why this matters beyond this corpus

The exam satisfied **every** coverage requirement — 16/16 strata, `COVERAGE COMPLETE`, 36 surfaces
carrying both labels, 22 titled-KEEP probes. **It was defeated in purpose while satisfied in
letter**, because the 36 dual-label surfaces were all *famous* entities and the generic names had
no counterexample at all. `check_eval_coverage` asks whether a surface appears with both labels; it
does not ask whether any *confound* is neutralised.

**A coverage check that passes is not an exam that discriminates.**

> ⚠️ **Open:** the exam's confound is reduced but not neutral — ORG `0.886`, PER `0.842`, on 8 and 12
> counterexamples. The exam still cannot fully judge on its own; the substitution probe is currently
> doing that work, and a probe is generated, so it is a diagnostic and never ship evidence.

---

## 3. 🔴 The bottleneck is NER, not the classifier

| | |
|---|---|
| Classifier recall on spans NER proposed | **0.9960** — ~0.4% headroom left |
| **MASK spans the NER does not cover in full** | **35.7%** |

**A span the NER does not cover can never be masked**, whatever the classifier does. Per doc 07
§1.4 recall is monotone on privacy: a miss hands the provider the raw value, with no partial
protection. ADR 0019 already said integrated recall is NER-bounded; this is that claim as a number.

### 3.1 🔴 The first version of this number was wrong by ten times, and the reason generalises

`align_spans` (Task 8b) counts **any overlap** as a match. For masking that is the wrong question.
Measured over the exam, **22.6% of gold spans are covered only in fragments**:

| gold | what the NER actually proposed |
|---|---|
| `Encik Rahman` | `En` · `Rahman` — the honorific is cut in half |
| `鲁迅先生` | `鲁` · `鲁迅` |
| `阿里巴巴` | `阿` · `阿里巴巴` |
| `孔夫子` | `孔` · `孔` |

Each of these **aligns**. None of them protects anything: masking `阿` and leaving `里巴巴` in the
prompt is a leak with a receipt, and splitting `Encik Rahman` violates doc 04 §4.3 directly.

So the reported `ner_miss_rate` of 7.2% — spans with *no* overlap at all — understated the product
failure by roughly ten times. The effective figure is **35.7%**.

**`run_composed_eval.py` now reports `mask_full_coverage_rate` and `fragment_rate` alongside it,
and `ner_miss_rate` carries an inline note that it must not be used as the product number.**

> **Same shape as every other defect in §5:** `align_spans` answered its own question correctly.
> Its question was narrower than the one it was trusted with. This one is in the *plan's spec*,
> not in an implementation.

### The wedge's language is worst, on both measures

| Language | MASK spans fully covered | (no-overlap misses) |
|---|---|---|
| en | **78.5%** | 1.5% |
| bm | 72.9% | 6.8% |
| mixed | 61.2% | 1.5% |
| **zh** | **45.3%** | **15.6%** |

**In Chinese, roughly one sensitive entity in two is not fully covered.** What gets missed
is not incidental — it is invoices and debts:

```
[zh] MASK  腾讯      财务部尚未结清我们公司欠腾讯的那两千块云服务费。
[zh] MASK  阿里巴巴   我们公司目前欠阿里巴巴一笔大型服务器租赁费。
[bm] MASK  TNB       Tolong bayar bil tertunggak TNB sebelum hujung minggu ini.
[bm] MASK  Proton    Invois untuk servis penyelenggaraan kenderaan Proton masih belum dibayar
```

> **This is the third time the beachhead has turned out to be the hard case**, after U12-b (the naive
> gate breaks Chinese input) and doc 06 §4.3 (the wedge's language is slowest on the critical path).
> Per CLAUDE.md §7.3 this belongs in doc 08's opening, priced rather than discovered.

### Consequence for effort allocation

Four training rounds (`v5`→`v8`) were spent on the classifier; the last two bought almost nothing.
**Tuning the classifier cannot move integrated recall past ~0.64**, because that ceiling is set by
NER coverage, not by the classifier. The lever is the NER.

### 3.2 Candidate NERs measured — and why swapping is NOT the answer

| | miss (no overlap) | **MASK fully covered** | licence |
|---|---|---|---|
| `Davlan/bert-base-multilingual-cased-ner-hrl` (current) | 7.2% | **64.3%** | AFL-3.0 — commercial OK |
| `Davlan/xlm-roberta-base-ner-hrl` | 3.8% | **66.7%** | AFL-3.0 — commercial OK |
| `Babelscape/wikineural-multilingual-ner` | 11.6% | — | 🔴 CC BY-NC-SA — **non-commercial, out** |

**AFL-3.0 permits commercial use** despite the name — OSI-approved, grants the right to "make, use,
**sell**", no field-of-use restriction, no copyleft. `[verify]` on the two Davlan models is closed.

🔴 **On `ner_miss_rate` the swap looked like a 3.4pp win (0.924 → 0.958). On full coverage it is
2.4pp (64.3% → 66.7%).** The first number was the inflated one. **A swap is not worth reopening
ADR 0017, and it would need ADR 0020's xlm-roberta prohibition explained** (that rule targets our
classifier backbone, not an NER component — different use, same family).

🔴 **Neither candidate was trained on Malay.** Both cover ar/de/en/es/fr/it/lv/nl/pt/zh. BM
performance is pure cross-lingual transfer, so the BM figures are the least stable here — they have
no training data behind them.

### 3.3 🟢 22 points recovered by deterministic post-processing — `sens.span_repair`

The gap is not mostly blindness. It is a **definition mismatch**: the NER proposes `Rahman`,
`鲁迅`, `Acme Corp`, while the rubric requires the honorific **inside** the masked span
(doc 04 §4.3), so gold is `Encik Rahman`, `鲁迅先生`. Merging fragmented proposals and pulling
the attached title into the span fixes most of it, with no model involved:

| exam, `bert-base-multilingual-cased-ner-hrl` | raw | **`--repair-spans`** |
|---|---|---|
| MASK fully covered | 65.3% | **87.5%** |
| Effective MASK miss | 34.7% | **12.5%** |
| Fragment rate | 22.5% | **6.0%** |
| **Integrated MASK recall** | **0.650** | **0.872** |
| en | 79.4% | **94.1%** |
| bm | 73.8% | **90.2%** |
| mixed | 62.3% | **91.3%** |
| **zh** | **46.3%** | **74.6%** |

**+22pp — a larger gain than every classifier training round in this track combined**, from
rules that are testable, explainable, and survive a change of NER.

**Cost, measured:** 3.5% of repaired spans over-extend by a role or department word
(`会计部的张先生` for `张先生`, `Vendor Acme Corp` for `Acme Corp`). That is a utility cost,
not a privacy failure — the wider span is still sensitive — and it is the right side to err on.
Gap-bridging is available (`--repair-gap`) but **off by default**: it bought +0.4pp and caused
most of the over-extension.

> ⚠️ **This also means the current pipeline violates doc 04 §4.3.** Masking `Rahman` and leaving
> `Encik` is a re-identification pointer — the section calls that a compliance failure, not a
> cosmetic one. Span repair is not only an accuracy improvement.

⚠️ The title lists are the instrument. An incomplete list understates the gain silently — this
session reported honorific counts of 5, 8 and 22 for one file before the list was completed.
They are maintained data, not finished constants.

### 3.4 The finding that actually matters

**It is not "which stock NER". It is that stock NER leaves ~1 in 3 sensitive entities not fully
masked, and ~1 in 2 in Chinese.** ADR 0017 selected stock NER for Slice 1; this measurement is
input to that decision and belongs to the founder.

**Checked against a second substrate**, because a 532-question exam from a small author pool is
exactly where a magnitude can be an artefact:

| substrate | MASK fully covered | fragment | no overlap | zh |
|---|---|---|---|---|
| Exam — 532 rows, `human_simulated` | **64.3%** | 29.4% | 6.3% | 45.3% |
| Training set — 677 rows, `llm_synthetic` + `human_simulated` | **67.1%** | 30.5% | 2.4% | 50.0% |

**Different provenance, different authors, same answer.** ~1 in 3 MASK spans not fully covered,
~1 in 2 in Chinese, ~30% fragments on both. This is a property of the NER, not of one corpus.

⚠️ Still not field evidence: both substrates are constructed, and neither NER was trained on Malay.
A composed eval on the live Slice 1 NER over real traffic remains the mandatory gate.

---

## 4. Caveats that travel with every number above

1. **Stand-in NER, not the shipped one.** `Davlan/bert-base-multilingual-cased-ner-hrl` — **its
   training languages do not include Malay**. A composed eval on the live Slice 1 NER remains a
   mandatory integration gate; this does not discharge it.
2. **NER licence is `[verify]`.** Confirm free/public/commercial-use before quoting the figure.
3. **`human_simulated` substrate.** ADR 0015's residual is undischarged for a production ship.
4. **Small author pool.** Register bias; a green score is not field proof.
5. **`SHIP_CANDIDATE` is structural.** It says no trivial-model or substrate rule was violated. The
   numeric threshold is human-gated and has not been set.

---

## 5. Bugs found in our own tooling

| | |
|---|---|
| `ship_status` passed an **always-MASK** model | Only `mask_recall <= 0` was checked, which catches always-KEEP. ADR 0021 assumed KEEP dominates; this corpus is MASK-majority, so the degenerate direction flipped. Fixed with a structural single-class check. |
| `validate_path` accepted **duplicate ids** | A file-level property a per-line validator cannot see. An exam amended from an already-taken id passed validate *and* coverage with two rows sharing an id. `merge_audit`/`disagreement` key by id, so one row silently shadows the other. |
| Two title lists disagreed | `titled-KEEP` was reported as 5, 8, then 22 for the same file — an incomplete honorific list (`Datuk`/`Tun`/`Sir` missing) produced honest verdicts on wrong input. Unified. |
| Training silently produced an untrainable model | `transformers` 5.x honours the checkpoint dtype; mdeberta-v3-base ships **fp16**, and AdamW's `eps=1e-8` rounds to 0 in fp16, so one step turned 201/202 parameters to inf. Fixed in `0d1794d` with an explicit fp32 load and a guard. |

**Common shape:** each returned a correct verdict about a proposition narrower than the one it was
trusted to answer.
