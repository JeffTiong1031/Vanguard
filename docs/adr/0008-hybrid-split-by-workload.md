# ADR 0008 — Hybrid privacy posture, split by workload (not by confidence)

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Implements:** decision #2 ·
**Coupled to:** decision #8 (cannot be revisited separately) · **Depends on:** U6, D2, F4

## Context

The product must decide where prompt text is analysed. The objection that shapes the whole category
is the privacy paradox: *"to protect my data, your server has to see it."*

Doc 02 §1 argues that paradox is a **consumer** paradox and largely dissolves at our buyer (ADR 0001):
the data is the company's, the company already grants inspection rights to several vendors, and a DPA
under GDPR Art. 28 / the amended PDPA makes us a processor. The real objection decomposes into
*where, who, how long, and is it in your training set* — **all contract terms.**

Three postures were compared: **A** on-device only, **B** hybrid split by workload, **C** cloud-first.
A fourth — "hybrid" as the market usually means it, **confidence-based escalation** — was evaluated
and rejected separately below.

## Options

| | Prompt text | Files |
|---|---|---|
| **A** | On-device | On-device (browser-side parse + OCR) |
| **B** | **On-device, always** | **Cloud, in-region, zero-retention, under DPA** |
| **C** | Cloud | Cloud |
| **D** | On-device, **escalating ambiguous spans to cloud** | Cloud |

## Decision

**Option B.** Prompt text on-device always. Files cloud, in-region, zero-retention, under DPA.

> **"Your typing never leaves the machine. Files are processed in-region under our DPA, zero
> retention."**

### Why not C

**Not cost.** Doc 02 §2.5 derives all three postures at roughly **$0.10–0.50/user/month** *(estimate)*
against a $10–20/seat price. Cloud-first is affordable, and claiming otherwise is a fabrication an
advisor disproves with a pricing calculator. C dies on three other things:

1. **The gate coupling (decisive).** Doc 01 §0 — the send gate decides **synchronously**;
   `stopImmediatePropagation()` cannot be awaited. A cloud scan cannot make a synchronous decision,
   forcing stop-and-replay, and replay **is** the auto-submit decision #8 forbids. **Decisions #2 and
   #8 are one decision.**
2. **The tail, not the mean.** A slow scan doesn't make the gate slow — it makes the cache **cold**,
   converting every tail-latency event into user-visible friction on a product whose thesis is that
   the clean path has none. Corporate traffic hairpins through VPN/SWG concentrators, so C is slowest
   **precisely at the accounts most likely to buy.**
3. **Concentration.** C makes us a central store of every prompt from every employee at every
   customer — **the most toxic database in the category**, defended by a pre-seed security budget, at
   a company whose demonstrated exit is acquisition (doc 00 §2.2). Not a risk to mitigate; a business
   not to be in.

**And C's one real advantage is aimed at the wrong target.** A cloud posture could run a semantic
model on every prompt — a genuine ceiling gain. But doc 00 §1.2 established detection quality is
**inversely proportional to stakes**: a bigger model improves the *bounded-harm* classes, while the
career-ending class (codenames, unreleased financials) is sensitive because of **facts about the
company**, not form. That class is served by the **org dictionary** (ADR 0004), which matches
**locally in every posture**. **C buys a bigger model for the detections that matter least.**

### Why not A

A is the purer compliance story with zero vendor-mortality exposure. Rejected because on-device file
processing is worse on both product and security grounds: it ships a **hostile-format parser attack
surface** (zip bombs, malformed PDFs — doc 00 §1.7) to every endpoint, defended by a browser tab,
rather than to a sandboxed ephemeral container we control and can revoke; Tesseract.js at 1–3 s/page
*(U7)* on D2 hardware makes a 40-page scan a minute of a laptop's life in a tab; and **it answers a
question nobody asked** — the buyer never objected to files being scanned in a cloud they already
send files to. They objected to keystroke surveillance.

### Why not D — and this is the important rejection

"Hybrid" normally means escalating low-confidence spans to a cloud model. It is **strictly worse than
either pure posture**:

- **It exfiltrates precisely the worst data.** The local model is unsure exactly when a span is
  **unusual** — a novel identifier, an odd codename. It is a filter that forwards your most unusual
  sensitive data and keeps the boring stuff home: the **exact inverse** of the intended selection.
- **Stripped of context.** Send the span alone and the semantic model can't judge it (context is its
  entire advantage); send the surrounding prompt and it's posture C with extra steps. **No middle
  setting works.**
- **It breaks the gate anyway.** Escalation is a network call. The gate must be synchronous
  **always** — the coupling doesn't care that it's only *sometimes* async.
- **The boundary is undrawable in advance.** You cannot tell a reviewer which prompts leave the
  machine: the answer is "the ones our model found confusing," which changes with every retrain.

### The principle that makes B honest

> **A privacy boundary must be drawable *before* you look at the data.**
>
> *"Is this a file or is this typing?"* — a priori, by anyone, identically, forever. Auditable.
> *"Is this span ambiguous?"* — only after inference, only by us, differently after every retrain.

**B is not a compromise between A and C. It's a different axis.** The seam holds because workload type
is a property of the **input**, not of our model's opinion of the input: it cannot drift with a
retrain, be gamed by a prompt, or need a threshold.

## Consequences

**Accepted:**
- **We accept a permanently lower detection ceiling on prompt text** — D2-bound, no L3 semantic layer
  on prompts, ever, absent a change in device assumptions. §2.3's argument is that this ceiling is
  aimed at the *low-stakes* classes, but the ceiling is real and this is the price.
- **§6.4's questionnaire answers now depend on I1.** *"We never receive them"* is the answer to four
  separate rows. Any future prompt-path telemetry doesn't just violate I1 — **it falsifies statements
  already made in contracts and security reviews.**
- **The on-device choice is architecturally forced, not privacy-forced** (doc 02 §1.5). The privacy
  benefit is a free consequence of the gate coupling. State it that way: claiming we chose on-device
  *for privacy* invites *"then why not offer a cloud tier?"* — whose true answer is *"the gate
  wouldn't work."*
- Phase 1 requires **in-region file processing** and therefore multi-region ops at A1 (ADR follows
  doc 02 §6.2: `ap-southeast-5` for MY tenants, `ap-southeast-1` otherwise).
- **F4 (zero-retention) becomes load-bearing** and must be defended against retry queues, dead-letter
  queues, and APM body capture — each individually reasonable, each silently degrading zero-retention
  to short-retention.

**Costs:**
- Two processing paths to build and reason about instead of one.
- The vendor-mortality residue (doc 02 §1.4) is reduced but not eliminated: Phase 1 file content still
  transits our infrastructure, so a DPA still binds a counterparty that may be acquired.

**Revisit if:**
- **B3 primary research shows the segment won't tolerate any cloud component** → fall back to **A**.
  This is cheap: B's prompt path **is** A's prompt path, so the fallback is deleting the file
  pipeline, not redesigning the product.
- **U6 fails** (on-device inference ≫ 100 ms) → this does **not** reopen the posture. It breaks the
  **gate** (doc 01 §0), which is a different failure with a different fallback. Do not let a latency
  result be read as a privacy result.
- A regulated deal contractually requires cloud-side prompt inspection → that is a **different
  product**, and probably a different company.
