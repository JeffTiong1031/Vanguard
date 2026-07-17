# ADR 0017 — Slice 1's four technical choices: a stock L2, CDN weights, WXT with committed output, block+Ignore

**Status:** Accepted · **Date:** 2026-07-17 · **Decider:** the founder
**Context:** [ADR 0016](0016-mvp-first-sequencing.md) makes Slice 1 the next action. These are the four
questions that blocked its brief.

---

## 1. L2 = a stock public multilingual NER model

**Decision.** Slice 1's L2 is an **off-the-shelf public multilingual NER checkpoint**, int8, in the
offscreen document (ADR 0006). **Not a trained model.** No in-product placeholder banner — **the
founder tells the team verbally that L2 is a generic stand-in.**

**Why there was no other option in days.** There is no trained model and no corpus: **C3-b** is the
package's least-confident assumption, **U14-a** is an unrun search, and **U25** (lawful basis for the
eval corpus) is with counsel. Training first would put the team test behind a legal item.

🔴 **State this honestly and keep stating it — the founder said it first and it is the thing most
likely to be forgotten:** a stock NER model does **PERSON / ORG / LOC tagging. It is not a
sensitive-vs-not classifier.** *"Explain Einstein's theory"* contains a PERSON. *"Summarise Apple's
earnings"* contains an ORG. **Neither is a leak.** The gap between *"is an entity"* and *"is
sensitive"* is the product; Slice 1 does not have it.

✅ **What Slice 1's L2 nevertheless makes REAL, and this is why it is worth shipping:** the offscreen
lifecycle, the tokenizer, the chunking at 512, the int8 memory footprint, the cold-start path, the
L1→L2 ordering (ADR 0013), and **U6-b's curve** (doc 06 §3.3 — *"The curve is ours"*). **None of that
is simulated.**

**Explicitly rejected for Slice 1:** training a custom L2, or an LLM sensitive-classifier. **Later.**

## 2. Weights = first-run download from a public CDN

**Decision.** The repo stays small; the extension fetches weights on first run.

**This does not touch decision #2.** Decision #2 says **prompt text** never leaves the device.
**Fetching model weights is traffic in the opposite direction and carries no user data.** The
invariant is about what we *send*, not what we *download*.

🔴 **Two consequences that are not optional:**
1. **Pin the weights by hash and verify before load.** An unverified fetch of executable-adjacent
   bytes into every team machine is **doc 02 §6.4's un-N/A-able row** — the auto-update/RCE path — in
   a new place. *"You control when our code changes, not us"* (doc 05 §7) has to stay true of weights.
2. **It fails on a locked-down network**, which is *exactly the fleet B3 targets.* **For the team test
   this is fine. It is not the shipping answer**, and the shipping answer is a B3 question — parked.

## 3. Build = WXT, with the built output committed

**Decision.** Honours doc 01 §6's stack choice **and** keeps the acceptance test literal: the team
**clones → Developer mode → Load unpacked**, with no toolchain.

⚠️ **The cost is real and needs a guard: committed `dist/` drifts from `src/`.** A build artifact in
git is a second source of truth, and **the failure is silent** — the team tests a stale build and
reports on code that no longer exists. **Slice 1 needs a check that `dist/` matches `src/`**, or the
team's findings are about an artifact nobody can reproduce. *(This is the same shape as U26 and the
empty-capture defect: an artifact whose provenance nobody verifies.)*

**Doc 01 §6's eject rule still stands:** if WXT fights the offscreen-document or MAIN-world work,
**eject to CRXJS immediately.** Slice 1 has no MAIN-world work (ADR 0012) but it has **all** of the
offscreen work.

## 4. Gate mode = block + modal + Ignore-with-reason

**Decision.** The real product: block → modal → rewrite → **the user presses Send** (decision #8).
**Ignore requires a reason.**

**Why Ignore is in rather than out.** Per doc 00 §1.6 the Ignore+reason loop is **a compliance
artifact, not a label**, and per doc 07 the **Ignore rate *per class*** is a
**detector-prioritization signal** — *"it ranks our bugs; it does not label them."*

🟢 **And that turns Slice 1's biggest weakness into its most valuable output.** A stock NER model will
over-fire on public people and companies (§1). **The Ignore rate per class, measured on the team's
real work, is exactly the instrument that quantifies it** — and doc 07 designed that instrument
before there was anything to point it at. **The team test's most useful deliverable may be the Ignore
rate per class, not the pass/fail.**

⚠️ **Honour doc 02 §4.6: local labelling only**, and **I3**: the reason is a **class + count + salted
hash**, never the typed value (**U26** is the review gate).

## 5. Masking and modal policy for Slice 1 — the hanging question, resolved

**Decision (founder, 2026-07-17).** In Slice 1, **three detector outputs may mask a span AND open the
modal**: **L1 structured numerics · stock-NER PERSON · stock-NER ORG.** **LOC is off** (§8.1 of
CLAUDE.md). There is **no sensitive-vs-not layer** — that is deliberately deferred past Slice 2.

**This is the pipeline, not the wedge, and the noise is accepted on purpose.** A stock model tags
*"explain Einstein's theory"* (PERSON) and *"summarise Apple's earnings"* (ORG). **Slice 1 will open
the modal on both.** That is a false positive, and **Ignore-with-reason is the accepted escape** — the
team test measures whether the *pipeline* works, and per §4 the **Ignore rate per class is the
instrument** that prices this exact noise for the trained model that replaces the stand-in.

🔴 **The one hard guardrail on L1, stated because a naive implementation violates it: ordinary
arithmetic is not sensitive.** *"1+1"*, a lone number, a year, a quantity — **none of these may fire
L1.** L1's numeric detectors match **structured identifiers** — the NRIC `YYMMDD-PB-###G` shape, the
12-digit SSM, the TIN prefixes, card PANs — **not the presence of digits.** This falls out of the
detector *specification* correctly (a bare `2` matches no identifier grammar), but it is a **review
gate on Slice 1**, not an assumption: *"detect numbers"* is the wrong implementation and it is the
easy one to reach for. **A tool that flags `1+1` as a leak is uninstalled by lunchtime** (ADR 0001's
ticket economics; doc 07 §1.2).

**Why PERSON and ORG mask AND open the modal, rather than mask silently:** decision #8 forbids
auto-submit and the whole product is *"the user presses Send."* A silent mask would rewrite the user's
text without telling them — **that is the surprise-edit failure the modal exists to prevent.** The
modal is how the user *sees* the rewrite and consents to it. So "may mask" and "opens the modal" are
one action, not two.

---

## Consequences

- **Slice 1 is not days.** See CLAUDE.md §8's timeline block: **~3–5 weeks for one engineer**, and the
  founder invited that pushback explicitly rather than accepting a quiet descope.
- **U22 moves onto the critical path** (COOP/COEP → `SharedArrayBuffer` → ORT threads). **It is ours,
  not the fleet's** — unlike U15/WebGPU — and it is now the difference between a usable and an
  unusable L2 in the offscreen document.
- **The stock model's FP behaviour is a FINDING, not a bug.** If the team hits Ignore constantly on
  public entities, **that is the measurement**, and it is the argument for the trained L2 that C3-b
  and U25 gate. **Do not "fix" it with an invented sensitivity heuristic** — that would be a number
  nobody checked, in the layer whose precision is quasi-contractual (ADR 0001).

## 6. Slice 1 build decisions (2026-07-18, from the `/grill-me` pass)

Four `how` choices, resolving the forks a no-placeholder implementation plan forced. Plan:
[`docs/superpowers/plans/2026-07-18-slice-1-chat-text-extension.md`](../superpowers/plans/2026-07-18-slice-1-chat-text-extension.md).

1. 🔴 **L2 runtime = transformers.js, not raw onnxruntime-web — for Slice 1 only.** transformers.js
   **is** ORT-web underneath (so §1's "ONNX Runtime Web in the offscreen doc" holds), but ships the
   tokenizer + model + token-classification pipeline as one library, collapsing ~4–8 engineer-days of
   ORT wiring + a hand-rolled browser tokenizer. **Accepted tradeoffs:** heavier download, and
   chunking/quantization control through a wrapper rather than direct. 🔴 **Recorded so nobody reads
   doc 01 §6 / doc 03's raw-ORT preference as a Slice 1 blocker: it is not.** **Raw ORT-web + a
   hand-rolled tokenizer is the LIKELY later engine shape** if/when shipping needs vocabulary trimming,
   int8 control, or the size budget the wrapper cannot give (doc 06 §6.2) — **a deliberate rework
   AFTER the team test, not Slice 1 scope.**
2. **The log-only send observer is DEFERRED past Slice 1** — not built, and the "local reconciliation,
   no webRequest" middle path is rejected too (a partial control that reads as a full one). Slice 1 is
   the felt UX: gate, modal, rewrite, Ignore. The observer returns as a follow-on aligned with doc 05
   §6.4 / ADR 0012 **after** the team accepts Slice 1. **Still "in for Phase 0" — Phase 0 ⊃ Slice 1.**
3. **Storage/crypto = scaffold the seam + a clearly-labelled STAGED demo; real ADR 0009 is post-MVP.**
   The boss POC walks a chronology (MVP → coworker isolation → org dictionary → encrypted vault →
   audit). **Chapters 1–4 are REAL; chapters 5–7 are STAGED theatre**, and the split is load-bearing —
   see §7. **No production claim that a per-tenant DEK protects customer data ships in Slice 1.**
4. **L1 detector set = NRIC + SSM (+`NRIC_OR_SSM_AMBIGUOUS`) + LHDN TIN + email + credit-card (Luhn).**
   The Malaysian identifier core plus two universal low-FP patterns. Each is a structured grammar, so
   §5's `1+1` guardrail holds by construction.

## 7. The REAL / STAGED split — the "second product inside Slice 1" guardrail

The founder asked for a chronology demo **and** flagged its risk in the same breath: *"so we don't
accidentally build a second product inside Slice 1."* This split is that guardrail, and it is binding.

| # | Chapter | REAL / STAGED | Rule |
|---|---|---|---|
| 1 | Type *"Please call Ahmad about the deal."* → rewrite to `PERSON_1` → modal → **user presses Send** | 🟢 **REAL** | The Slice 1 acceptance flow. Must actually work on ChatGPT + Claude. |
| 2 | Session mapping is **in-memory only**; no rehydration; no readable `Ahmad` persisted as a product vault | 🟢 **REAL** | E2. The map dies with the session. |
| 3 | Local audit line: **class + count + salted-hash fingerprint** (never the raw name) | 🟢 **REAL** | I3 / decision #5. Feeds Ignore-rate-per-class. |
| 4 | Rachel on another machine gets **her own** `PERSON_1`; no shared live mask list | 🟢 **REAL** | Trivially true with no backend — but **assert it** (no network call carries prompt content). |
| 5 | Org-dictionary panel: admin-uploaded terms "unlocked" by a local demo tenant key | 🟠 **STAGED** | A demo panel. **No real dictionary distribution, key custody, or admin console.** |
| 6 | Encrypted-vault panel: shows a locked/unlocked `PERSON_1 → Ahmad` mapping under a hardcoded demo key | 🟠 **STAGED** | Theatre for the chronology. **Not production at-rest protection.** |
| 7 | Audit panel: redacted findings list (classes / counts / fingerprints / Ignore reasons) | 🟠 **STAGED** | Reads the REAL local audit for shape, but **no raw-name admin feed.** |

🔴 **Binding rules on the STAGED chapters, because staging that reads as real is exactly the E2 failure
(*"the audit trail says it worked"*):**

- **Every staged panel carries an unmistakable `DEMO · NOT REAL PROTECTION` marker** in its own UI.
- **Staged panels never write to the real audit store** and never touch the real gate/verdict path —
  they are a separate, inert surface, so nothing downstream can mistake theatre for a finding.
- **The demo key is hardcoded and named `DEMO_KEY`** in code; it is never presented as custody.
- **If the staged chapters threaten the real path's critical path, they stay a thin panel/script** and
  do not grow (founder, explicit). They are a **follow-on plan**, not part of the real-path plan.
