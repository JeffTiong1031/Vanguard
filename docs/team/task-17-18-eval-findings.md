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
| **NER miss rate, all spans** | **7.2%** |
| **NER miss rate, MASK spans only** | **6.3%** |
| **Integrated MASK recall (estimate)** | **≈ 0.924** |
| `ship_status` | `SHIP_CANDIDATE` |

**None of these is evidence the model is accurate in the field.** The substrate is
`human_simulated`; ADR 0015's residual is undischarged.

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
| MASK spans NER never proposed | **6.3%** |

**A span the NER does not propose can never be masked**, whatever the classifier does. Per doc 07
§1.4 recall is monotone on privacy: a miss hands the provider the raw value, with no partial
protection. ADR 0019 already said integrated recall is NER-bounded; this is that claim as a number.

### The wedge's language is ten times worse

| Language | MASK spans missed by NER |
|---|---|
| en | **1.5%** |
| mixed | 1.5% |
| bm | 6.8% |
| **zh** | **15.6%** |

**In Chinese, roughly one sensitive entity in six is never seen by the pipeline.** What gets missed
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
**Tuning the classifier further cannot move integrated recall past ~0.928.** The lever is the NER.

⚠️ **But the NER is Slice 1's choice under ADR 0017, not this track's.** The measurement belongs to
the founder as input to a product decision; it is not a decision this track can take.

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
