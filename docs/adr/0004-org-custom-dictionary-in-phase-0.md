# ADR 0004 — Org-custom dictionary is a Phase 0 L1 feature

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Amends:** decision #7's Phase 0
boundary

## Context

Doc 00 §1.2 established that detection quality is **inversely proportional to stakes**: regex nails
IC numbers at ~100% precision, but nothing in the L1/L2/L3 stack sees the career-ending class —
unreleased financials, M&A codenames, customer lists, litigation strategy. Those are sensitive
because of *facts about the company*, not because of *form*, so no public corpus and no NER class
covers them.

The original brief filed org-custom sensitivity (project codenames, internal IDs) as a sub-bullet of
doc 03, implicitly deferred. Decision #7 had scoped Phase 0 to "text prompt only; files Phase 1."

## Options

1. **Defer to Phase 1** as briefed — keep Phase 0's boundary intact.
2. **Phase 0 L1 feature** — customer-supplied dictionary, exact-match, alongside the regional regex
   fast-path.
3. **Solve it with L3 semantics** — let a small LLM infer org-specific sensitivity from context.

## Decision

**Option 2.**

Option 3 is a trap: an L3 model has no knowledge of the customer's business, so it cannot know that
"Nightjar" matters here and not elsewhere. It would be an expensive, imprecise, unauditable
approximation of a lookup table.

Option 1 was rejected on a **cost-shape** argument, and this is the reasoning worth preserving:

> Decision #7 was a boundary against the **six-month file-parsing swamp** (doc 00 §1.7) — Tika,
> OCR, zip-bomb defense, a dedicated engineer. That is a fundamentally different kind of cost from a
> wordlist match. Deferring the cheap thing because it shares a document with the expensive thing
> would be **filing by accident rather than by cost.**

On merits, this is the highest value-to-effort item in the package:

| Property | Why it matters |
|---|---|
| Catches the **high-stakes class** | The only layer that sees the career-ending category (§1.2) |
| **No ML** — Aho-Corasick over a wordlist | Sub-millisecond; no model risk; fits the L1 budget with room |
| **~100% precision** on exact match | Directly serves the precision-over-recall asymmetry (doc 07) |
| **Auditable** | You can show a compliance officer the list. You cannot show them a logit. |
| **Google cannot clone it** | A native browser DLP will never know "Nightjar" matters at this company |
| **Creates switching cost** | A curated dictionary is an investment the customer won't repeat for a competitor — the closest thing to lock-in this product has |
| **Makes the buyer a participant** | The compliance officer *configures* it: an onboarding ritual converting a purchase into a commitment |

## Consequences

**Accepted:**
- Phase 0 grows by days, not weeks. At A1 headcount (2–3 engineers) this is affordable; it is
  explicitly **not** a licence to reopen the files boundary, which remains Phase 1.
- Adds a tenant-console surface in Phase 0: dictionary CRUD. Small, but it's the buyer's first
  hands-on contact with the product, so it can't be a config file.
- Dictionary terms are themselves sensitive (a list of your unannounced project codenames is a
  target). **They must follow the same on-device rule as prompt text** — synced to the client,
  matched locally, never sent to our servers in the clear. This is a real design constraint on doc 02.
- Exact-match only in Phase 0. No fuzzy matching, no morphology, no case-insensitive-plus-stemming.
  Fuzzy matching reintroduces false positives into the one layer whose value *is* its precision.

**Costs / risks:**
- **Cold-start burden lands on the customer.** An empty dictionary detects nothing, so onboarding
  must ship starter templates and a bulk-import path or the feature demos as a blank box.
- Term collisions with common words ("Atlas", "Titan", "Phoenix" are all real codenames) will produce
  false positives that are *the customer's fault* but *our support ticket*. Mitigation: warn at
  configuration time when a term appears in a common-word list. Deferred to Phase 1.

**Revisit if:** dictionary FP rates from the first design partner exceed the doc 07 precision floor —
which would mean the exact-match assumption is too naive and word-boundary/context rules are needed
earlier than planned.
