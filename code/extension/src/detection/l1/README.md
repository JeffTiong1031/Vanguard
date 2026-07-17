# L1 — regex + structural validation + Aho-Corasick

**STUB.** Doc 03 §2, ADR 0004.

🔴 **L1 has no sequence limit, no chunking, and no model** (doc 06 §2.3). That is not a detail — it is
why **the chunk-boundary problem cannot touch either high-stakes class** (doc 07 §6.2). **512 is
`max_position_embeddings`, a property of L2 alone.** Both the bounded-harm identifiers **and** the
career-ending codename class (ADR 0004) live in a layer boundaries cannot reach.

🔴 **L1 IS WRITTEN, NOT TRAINED. It needs no corpus.** Its behaviour is fully determined by a
published grammar — which is why **C3-a is High confidence with near-zero blast radius**, why
synthetic NRICs are **fixtures rather than training data**, and why doc 02 §4.7's *"too-regular NRIC
formats"* was never a risk (doc 07 §2.3, §2.4).

---

## Do not implement

- ❌ **The NRIC checksum.** Doc 03 §2.1: a hobbyist repo claims ISO 7064 Mod 11,2, **fitted by trial
  and error.** **A phantom checksum silently rejects VALID ICs** — a **recall collapse**, invisible,
  in the layer whose entire value is being deterministic. **A checksum that might not exist is
  strictly worse than no checksum**: no checksum costs precision, which structure recovers and the
  modal surfaces. A phantom one costs recall, silently.
  **§2.3's SSM collision is the pressure that will make someone reach for it.** Naming both here is
  deliberate.
- ❌ **The gender digit rule.** Widely repeated, **unverified** (U2). Doc 03 §2.1: *do not gate on it.*
- ❌ **Old-format IC.** Unverified; **not shipping Phase 0.** A gap to state, not hide.
- ❌ **Bare 8-digit EPF/KWSP.** Not L1-detectable — `\d{8}` matches order numbers, timestamps, amounts
  in cents. **Context-only or not at all**, and **do not put EPF on a coverage slide** without that
  qualifier: a table listing EPF beside NRIC implies a parity that does not exist, and an advisor
  tests it in one prompt.
- ❌ **Fuzzy dictionary matching.** ADR 0004: **exact-match only in Phase 0.** Fuzzy *"reintroduces
  false positives into the one layer whose value IS its precision."*

## Verified and shipping (doc 03 §2.4 — individually, never as a block)

| Format | Status |
|---|---|
| **NRIC** `YYMMDD-PB-###G` | ✅ Verified. **14 of 100 PB codes unassigned** (`00`,`17`–`20`,`69`,`70`,`73`,`80`,`81`,`94`–`97`) |
| **SSM 12-digit** | ✅ Verified. `YYYY`+`XX`+`NNNNNN`, from **2019-10-11** |
| **LHDN TIN** | ✅ Verified. `IG` + 9–11 digits. **Legacy `SG`/`OG` must still match** — pre-2023 documents are what people paste |
| **Passport** | ⚠️ Medium. `[A-Z]\d{8}` is **very loose** — needs context tokens |

---

## The highest-value rule in the product

**Context tokens** (doc 03 §2.3): `Company No.` / `Reg. No.` / `No. Syarikat` vs `IC` / `NRIC` /
`No. KP` / `MyKad`.

> **~86% of SSM numbers for entities incorporated 2001–2012 parse as structurally valid NRICs** — and
> **the day filter rejects nothing here, by construction.** The NRIC's `DD` field lands exactly on
> SSM's entity-type code, enumerated `01`–`06`, **every one of which is a valid day in every month.**
> **Structure cannot fix this.**

- **Ambiguity is a POLICY question, not a user question** (doc 04 §5.2). **Mask, don't ask.** Default
  to the more restrictive class (NRIC); the **admin** configures whether company numbers are
  sensitive. Asking the user hands the hardest classification in the product to the person with the
  least incentive to get it right — doc 00 §1.6's *"active poisoning"* in a new costume.
- **The class cannot carry a precision target** (doc 07 §6.3): ambiguity is a property of **our
  information**, not of the string. **Score its OVER-FIRING RATE** — of all 12-digit findings, what
  fraction land in `AMBIGUOUS` **when a context token was present and we failed to use it.** That has
  ground truth and is a bug we can fix.
- 🟢 **Half this collision's ground truth is PUBLIC.** Real SSM numbers in real sentences measure the
  **false-positive direction — the quasi-contractual one (ADR 0001)** — **with no personal data in it
  at all** (a company number is not personal data, so doc 07 §5.4's entire legal section does not
  apply to this slice). **Cheapest real-data eval row in the package. Build it first.**

---

## The placeholder mask — a *detection* requirement (doc 05 §6.2, doc 07 §6.1)

```
\b(PERSON|IC|ORG|CODENAME|…)_\d+\b
```

🔴 **`\b`, not `^…$`.** The rewritten prompt is `"PERSON_1 owes RM5k"` — not a composer containing
only `PERSON_1`. *(Doc 05 §6.2 wrote the anchored form; it was writing a grammar, not a regex.)*

**Without it:** we write `PERSON_1` into the composer → that is an input event → the typing-time
scanner fires on our own output → **L2 is a NER model and `PERSON_1` is exactly the shape of a
person** → the modal offers to rewrite `PERSON_1` to `PERSON_2`. **The pipeline eats its own tail,
and the approval token hides it for its whole TTL, so testing misses it.**

**Generate the type list from doc 04's minter. Do not type it twice.** Add a placeholder type
elsewhere, forget this list, and the loop reopens **silently** — ADR 0011's lesson: the dangerous
version of a fix is the one a future engineer can undo without noticing.

🔴 **And it needs an eval row, not just a unit test** (doc 07 §5.5, §6.1). A unit test asserts the
regex matches `PERSON_1`. It cannot assert that **L2 does not tag `PERSON_11`, or `PERSON_1's`, or a
`PERSON_1` inside a code block** — those are model behaviours. **The defect doc 05 found was
invisible to testing by construction; testing the fix the same way inherits the blind spot.**
