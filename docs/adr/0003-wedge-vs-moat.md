# ADR 0003 — Multilingual is the wedge; vendor-neutrality is the moat

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Revises:** an earlier CTO position
that treated multilingual capability as defensible

## Context

Decision #4 makes EN/BM/ZH code-switching the beachhead. The CTO initially presented this as the
moat. The founder challenged it: *why is the multilingual/semantic wedge structurally hard for a
browser vendor to clone once it's proven valuable, rather than merely absent from their roadmap?*

The challenge broke the position. This ADR records the revision, because a package that quietly
edits its own claims is worth less than one that shows where it was wrong.

## Options

1. **Multilingual capability is the moat** — original position.
2. **Vendor-neutrality is the moat**; multilingual is a time-limited head start.
3. **No moat exists** — this is a feature, build for acquisition.

## Decision

**Option 2.**

**Why not 1.** Google's multilingual NLP is better than ours will ever be — they trained the models
the field is built on. If EN/BM/ZH prompt DLP becomes a visible revenue line, they ship it in a
quarter. A vocabulary swap replicates our tokenizer advantage. What we own is a **head start** —
est. 18–24 months, *low confidence* — because incumbents are English-first and genuinely bad at
Malay, Chinese, and the code-switched mixture the market types. That wins the beachhead and the first
20 logos. It is not a moat, and calling it one is what gets caught in diligence.

**Why 2.** Google sells Gemini; Microsoft sells Copilot. Chrome Enterprise Premium's DLP and
Microsoft Purview exist to make it safe to **keep** data inside their ecosystem — the strategic goal
is to *route* prompts to their model, not to *reduce* prompts flowing to models. Neither will ship a
first-class "stop your data reaching Gemini" control, because that product's success metric is
directly opposed to the platform's revenue.

**This is the key property: the gap does not close when the market is proven — it widens.** The more
Gemini is worth to Google, the less Google wants the thing that throttles it. That's structural
(Christensen-shaped), not a roadmap accident.

A compliance officer whose LLM, browser, and DLP are all one company has no independent verification
of any of them — and independent verification is the entire reason a compliance function exists. This
is why CASBs sold into Microsoft shops that already had native Microsoft controls. Not a new bet; a
bet that has paid before.

**Why not 3.** Acquisition is a plausible *outcome* (the peer set is all equally exposed to Layer 4),
but "no moat" is not a strategy — it's a reason to build the thing an acquirer wants: a wedge into a
market they can't reach.

## Consequences

**Accepted:**
- The deck says: **"Multilingual gets us in the door. Vendor-neutrality is why we're still there when
  the platform notices."** Wedge and moat are stated separately and never blurred.
- **We never become a model vendor or a model router.** Not a first-party model, not a resale margin,
  not a "sanctioned assistant" SKU, not routing prompts to a model we're paid to prefer. The moment
  we have a model to route *to*, we are Google with less capital and the neutrality claim is gone.
  This is not a scruple sitting beside the moat — **it is the moat's necessary condition.** Test
  every future revenue idea against it.

  **Phrase this precisely for investors**, because the wrong phrasing sounds like a founder leaving
  money on the table:

  > ✅ *"We don't become a model vendor or router — neutrality is the asset we're selling."*
  > ❌ *"We won't take a dollar adjacent to LLM usage."*

  The constraint is **narrow and load-bearing**, not a blanket refusal to monetize. Seat licences,
  policy management, audit and compliance reporting, on-prem/VPC deployment, per-scan pricing, and
  usage-based tiers are all fully open. What's closed is exactly one thing: having a horse in the
  race we're refereeing.
- Reinforces the §1.8 repositioning: policing the boundary between sanctioned and unsanctioned AI is
  a product the platforms structurally cannot offer credibly.
- The 18–24 month head-start estimate is low confidence and should not appear in the deck as a number.

**Revisit if:** a browser vendor ships credible BM/ZH prompt DLP (head start over — fall back to the
moat immediately, and check it holds); or a platform spins out a genuinely neutral DLP arm.
