# ADR 0015 — The eval corpus's text substrate is real; the training corpus may be synthetic

**Status:** Accepted (2026-07-17) · **Deciders:** founder + CTO · **Resolves:** doc 06 §6.3's handoff
(*"doc 07 owns the eval that would catch it"*) · **Depends on:** C3-b, doc 02 §4.7, ADR 0001 ·
**Does NOT reopen:** doc 02 §4.5 (DP-SGD)

## Context

**Doc 06 §6.3 handed doc 07 a specific assignment**, not a general one:

> *"every lever in this document — trimming (§4.4), quantization (§6.3), distillation (§6.2) —
> **degrades BM/ZH first.** They are not independent knobs; **they are three taxes on the same asset.**
> A budget that spends all three lands a model that is small, fast, and **bad at the languages the
> company exists to be good at.** **Doc 07 owns the eval that would catch it.**"*

**Doc 02 §4.7 keeps synthetic data and states its risk precisely:** an LLM generating Malay produces
the **stereotypical** distribution — *"name distributions skewed to whatever its training data
over-represented, and code-switching patterns that read like a textbook rather than like a WhatsApp
message from a KL office. **Train on that and you build a model that is excellent on synthetic Malay
and mediocre on Malaysia.**"* It also says, explicitly, that it must not be cited as evidence synthetic
data is *good* — only that it is privacy-clean.

**The natural reading of those two sections together is: train synthetic, eval synthetic, ship.**
Designing the eval shows that this cannot work, and the reason is arithmetic rather than caution.

**The collision, in two lines:**

1. **The trim's rule** (doc 03 §4.2) is *"keep tokens covering **~99.9% of occurrences**"* — so it
   removes **low-frequency** tokens, and the damage lands on text that **used** them.
2. **Synthetic text is, almost definitionally, made of high-frequency forms** — that is what "the
   stereotypical distribution" means.

> **So synthetic Malay is made of exactly the tokens the trim keeps. A model degraded on real Malay
> scores fine on synthetic Malay, because the synthetic text never reaches for the rows we dropped.**
> **A synthetic eval is not optimistic. It is blind — specifically and only to the three taxes it
> exists to detect.**

**And C3-b becomes unfalsifiable.** C3-b claims *synthetic BM/ZH text is good enough*. Testing a
synthetic-trained model on a synthetic eval **tests that claim against itself.** The package's
least-confident, highest-blast-radius assumption would carry **no experiment** — and per ADR 0009's
standard (*"one customer saying it is worth more than our entire estimate of whether they will"*), a
risk with no experiment is not being managed.

## Options

| | Approach | Sees the three taxes? | Legal surface | Blocked on |
|---|---|---|---|---|
| 1 | **Fully synthetic eval** | ❌ **No — by construction** | 🟢 None | Nothing |
| 2 | **Real public text as substrate; synthetic identifiers injected** | ✅ **Yes** | 🔴 **Real personal data, pre-product** | Nothing |
| 3 | **Design-partner prompts** | ✅ **Yes, and it is the true distribution** | 🔴 **A DPA before we have a product** | 🔴 **B3** |
| 4 | Real substrate for BM/ZH only; synthetic for EN | ✅ Partially | 🟠 Same as 2, smaller | Nothing |

## Decision

**Option 2. The eval corpus's text substrate is real. The training corpus may be synthetic.**

**They have opposite requirements, and that is the whole argument:**

> **The training set's job is to teach the distribution. The eval set's job is to measure the gap
> between what we taught and what is real. A synthetic eval measures the gap between the synthetic
> distribution and itself — which is zero, by construction, regardless of the truth.**

**Shape:** real Malaysian code-switched text as the substrate; **identifiers synthesized from the
published grammar** (doc 03 §2.1/§2.4) and **injected at positions we control**, so their labels are
**free and exact — we placed them.**

**This follows doc 07 §2.3's rule, which is the general form of this decision:**

> **Synthesize what has a specification. Sample what you can only observe.**

The NRIC's digits have a published grammar and are consumed by **L1, which is written, not trained** —
so their synthetic realism trains nothing (doc 07 §2.3, and doc 03 §3.2 masks them before L2 in any
case). **The sentence around them has no specification**, and per doc 03 §2.3 that sentence is where
*"the highest-value L1 rule in the product"* lives. **The line falls through the NRIC, not around it.**

### Why the others lost

**Option 1 — rejected on the argument above.** It is free, ships this week, and has zero legal surface.
**It also cannot do the one thing an eval is for here.** Keeping it would leave doc 08 ranking C3-b as a
top risk with no detector attached.

**Option 3 — correct as the Phase 1 upgrade, wrong as the Phase 0 plan.** It is `ASSUMPTIONS.md`'s **C1
trap in its own words**: *"you inherit a **DPA obligation before you have a product to sell**, which is
a real trap, not a gift."* It is also **B3-blocked** — C3-b would be untestable until someone deploys,
so the beachhead's load-bearing assumption would wait on the beachhead.

**Option 4 — rejected as false economy.** The EN half is where labels are cheapest and the taxes bite
least; it is the BM/ZH half that costs and the BM/ZH half that must be real. Splitting the substrate
saves the easy money and adds a second pipeline **plus a distribution seam through the middle of the
code-switched sentences that are the wedge.** Per doc 03 §3.3 the code-switched mixture *is* the
artifact — **you cannot source half of a mixed sentence.**

## Consequences

**Accepted:**

- 🔴 **This puts real personal data into the company for the first time, before there is a product.**
  **PDPA applies**: per doc 02 §6.1 processors are **directly liable** under the Security Principle
  since **2025-04-01** (RM1m and/or 3 years), with **DPO + breach notification since 2025-06-01** —
  **dates already past** (**U18**). **The lawful basis is `[verify]` — *"publicly available"* is not
  self-evidently one under the Act as amended (U25). It is counsel's call and A3's first real invoice.**
- **Residency is bounded**: `ap-southeast-5` is GA (U13 ✅, doc 02 §6.2). The corpus lives in-country and
  no Transfer Impact Assessment arises.
- 🔴 **F4's zero-retention promise and an eval corpus are different pipelines with different promises**
  — **and a security questionnaire does not care about our internal boundaries.** The answer must exist
  before it is asked. Doc 02 §4.3's warning applies verbatim: *"zero-retention is not an architecture
  decision you make once. It's a property you defend against your own future engineers' good ideas."*
- **DP-SGD is NOT reopened, and this is the trap to name.** Its guarantee is about **training-set
  membership**; this corpus is **eval-only and never enters a gradient**, so **there are no members to
  protect** and doc 02 §4.5's *"rigorous guarantee about nobody"* still holds. **Reopening it here would
  cost BM/ZH accuracy — the wedge — to protect people who are not in the training set**, which is doc 02
  §4.5's *"actively harmful"* outcome with an extra step. **§5.4's obligations have a lawyer's answer,
  not a gradient's.**
- **The names remain the residue.** Identifiers are injected and labeled for free. **A real name in real
  text is a real person and its label must be produced, not injected** — human, Malaysian, bilingual,
  paid. **That is the eval's real cost line, and doc 07 §4.3 says why an LLM cannot absorb it: our
  labeler and our generator are the same model with the same gap in the same language.**
- **Injection produces naturalistic, not natural, text** (**U24**) — the sentence was not written about
  the entity now standing in it. **The human audit loop's first job is to sample injected sentences and
  say whether a Malaysian reader would flinch.**

**Costs:**

- **A corpus is an asset with a maintenance tax.** It ages, its licence terms bind, and its provenance
  must be documented for every future security questionnaire. **Nobody budgets the second year of a
  corpus.**
- **The eval is now on the critical path for every budget decision doc 06 makes**, because §5.2 says the
  budget cannot be set without it. **That is the intended consequence and it is still a schedule cost.**

**Revisit if:**

- **U14's search (doc 07 §3.4) returns a corpus meeting its declared bar** — then the substrate is
  sourced rather than assembled, C3-b's blast radius collapses, and this ADR's cost mostly evaporates.
  **That is the outcome to hope for, and per doc 07 §3.4 it is the one a two-day search settles.**
- **A design partner shares real prompts** — then Option 3 becomes the eval's **upgrade**, not its
  replacement. **Keep this corpus regardless**: a partner's prompts are one tenant's distribution, and a
  model tuned to one tenant is a model that does not generalize to the second sale.
