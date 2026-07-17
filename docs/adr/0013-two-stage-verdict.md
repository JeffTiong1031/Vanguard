# ADR 0013 — The gate consumes a two-stage verdict: L1 may decide DIRTY alone

**Status:** Accepted (2026-07-17) · **Deciders:** founder + CTO · **Depends on:** U6-b, ADR 0004 ·
**Constrains:** I5, doc 03 §1's pipeline

## Context

Doc 01 §0's coupling: the send gate decides **synchronously**, so the verdict must already be in the
cache when the user presses Send. Doc 06 §2.1 shows the typing path meets that for free — keystrokes
are ~100–200 ms apart *(estimate)* and the scan runs in the gap the user's own hands create.

**Paste does not.** A paste puts thousands of characters into the composer in **one event**, and Enter
can follow immediately. There is no gap to hide the scan behind. And per doc 00 §6 this is not an edge
case — *"accidental paste"* is **the dominant real-world leak case**, so **the cache is cold by
construction on precisely the threat the product is sold against.**

Doc 03 §1's pipeline is `L1 → mask → L2 → findings`, and the gate consumes the finished result. **On a
cold paste, that means the gate waits for L2** — and per doc 06 §4.2, L2 on a long paste is
`ceil(tokens/512)` forward passes, not one.

**But the two layers are not alike, and the pipeline's ordering hides it.** L1 is regex plus
Aho-Corasick (doc 01 §6, ADR 0004): **sub-millisecond even on a 5,000-character paste**, no sequence
limit, no chunking, no model. L2 is a 12-layer transformer with a **512-token window**.

## Options

1. **Wait for the full pipeline.** The gate consumes only completed `L1+L2` verdicts.
2. **Two-stage verdict.** L1 alone may return `DIRTY`; the gate acts on it immediately; L2 continues in
   the background and populates the modal.
3. **Gate on L1 entirely**, run L2 only for the modal's content.

## Decision

**Option 2.**

**Option 3 is a silent fail-open and gets a specific kill.** L1 cannot see a name in prose. Gating on
L1 alone would let *"Please review the contract for John Tan"* through as clean — **the exact class L2
exists for**, waved past by the layer that structurally cannot see it. It would make the multilingual
model decorative on the one path that matters.

**Option 1 is correct and pays for it on the wrong input.** It makes every cold paste wait for the full
chunked L2 pass, including the pastes L1 already decided in under a millisecond.

### The asymmetry the decision rests on

| L1 says | Can the gate decide? | Why |
|---|---|---|
| **Found something** | ✅ **`DIRTY`, now** | A finding is a finding. **L2 can only add more findings, never retract one.** |
| **Found nothing** | ❌ **Cannot say clean** | L1-clean is not clean. A name in prose is invisible to regex. |

> **`DIRTY` is decidable early. `CLEAN` requires completion.**

**And this lands well, which is the point.** Doc 00 §6's dominant threat — *"dumps a spreadsheet row or
a customer record"* — **is structured identifiers**, which is exactly L1's job, at ~100% precision (doc
00 §1.2, ADR 0004).

> **The dangerous paste is gated in under a millisecond. The full L2 wait is only ever paid to say
> *"clean"* — on a prose paste, where nothing was at stake. The latency lands on the safe pastes.**

**Doc 00 §1.2's inversion pays us back for once.** Its complaint is that *"you are best at the
detections that matter least."* On the paste path, **being best at the cheap detections is what saves
the interaction**, because the cheap detections are the fast ones and the dominant threat is made of
them. **The inversion is still true. Here it is an asset.**

### The rule that keeps it honest

A two-stage verdict means a **partial** scan writes to the cache, and that is a correctness hazard.

> 🔴 **The verdict cache is monotonic toward dirty. L1 may write `DIRTY`. Only a completed L1+L2 scan
> may write `CLEAN`. A partial result may never downgrade a verdict.**

**Without this rule the optimization becomes the bug it was meant to avoid.** L1 finishes, finds
nothing, writes `CLEAN`; the gate reads it and lets the send through; **L2's name finding arrives after
the prompt has reached the provider.** The audit trail would record a clean scan of a prompt we never
finished scanning — **doc 00 §6's worst case, manufactured by a performance fix.**

## Consequences

**Accepted:**
- **I5 is unaffected.** The cache still holds hash + verdict, never text, and doc 01 §4's state space
  was already tri-state (`clean` / `dirty` / `unknown`). **The rule constrains transitions, not
  contents.**
- **The modal renders on the L1 verdict and streams L2 findings in.** 🔴 **But Accept stays disabled
  until the scan completes** (doc 06 §5) — accepting a partial finding set would mask a value we had
  not found yet, produce an incomplete rewrite, and bind doc 05 §6's approval token to it. **Streaming
  is for perceived latency; the Accept gate is for correctness. They are different controls and the
  second is not optional.**
- **Doc 03 §1's pipeline diagram now has a second consumer.** L1's output feeds the gate *and* the
  masking step. The ordering is unchanged; **the result is no longer only consumed at the end.**
- **This raises the value of the org dictionary on the paste path** (ADR 0004): dictionary hits are L1
  hits, so **a pasted codename is gated in under a millisecond too.** The feature doc 00 §1.3 calls the
  most valuable is also the fastest.

**Costs:**
- **Two verdict provenances to reason about** — `dirty (L1)` and `clean (L1+L2)` — and a future engineer
  "simplifying" them into one boolean reintroduces the fail-open above. **The monotonic rule is why
  they are distinct, and this ADR is why the rule exists.**
- **The audit event should record which stage decided**, or a bypass investigation cannot distinguish
  *"L1 caught it instantly"* from *"the full scan ran."* Cheap now, unreconstructable later.

**Revisit if:** U6-b's measured curve (doc 06 §3) shows full L1+L2 completes inside the paste-to-Send
interval even at P95 length — **then Option 1 is simpler and strictly safer, and this ADR should be
reversed rather than kept for elegance.** That is the outcome to hope for, and it depends on a number
we do not have.
