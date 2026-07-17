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
