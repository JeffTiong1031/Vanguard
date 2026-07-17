# ADR 0016 — MVP-first sequencing: the team test is the next learning loop, not B3

**Status:** Accepted · **Date:** 2026-07-17 · **Decider:** the founder
**Reverses:** the standing *"B3 ranks above the engineering spikes"* constraint (CLAUDE.md §6.4, §7.3)
**Amends:** the **sequencing** of decision #7 for this engagement (not the decision itself)

---

## Context

**Every engineering spike that could have killed the design has now run and held** — U12-a ✅ (Enter
and click) · U12-b ✅ · U12-c ✅ · U20 ✅ (2026-07-17). The rework trigger did not fire.

The package's standing position, argued in doc 00 §3, doc 00 §7 and ADR 0001 and recorded as a
**binding constraint** in CLAUDE.md §6.4, was:

> *"**#1 pre-Phase-0 validation item = B3 primary research** (5–10 IT-lead interviews). **Ranked ABOVE
> the U6/U12 engineering spikes** — those ask 'can we build it?', B3 asks 'will anyone deploy it?', and
> the second is cheaper to answer and likelier to be fatal."*

That argument is unchanged and nothing in the spike results touches it. **The founder has read it and
decided against it for this phase.**

## Decision

**Build a working MVP and put it in front of the founder's own team before any B3 work.** Sequence:

1. **Slice 1** — a working chat-text extension, **L1 + L2 together**, ChatGPT + Claude, typing +
   paste, Enter + mouse Send, block/modal → rewrite → **the user presses Send** (decision #8),
   on-device scanning (decision #2), **no rehydration** (E2 — settled kill).
2. **Team test** — the team clones the repo and loads unpacked via Chrome Developer mode. **Not a
   public release.**
3. **Slice 2** — **file-content checking**, started only after the team has tried and accepted
   Slice 1. **B3 does not go between Slice 1 and Slice 2** (founder, explicit).
4. **Doc 08** — written only after both slices are implemented and tested.

**Parked until both slices are complete:** B3 IT-lead interviews · force-install work · U6-b's
design-partner-dependent **threshold** · marketing/GTM · doc 08 · anything else needing a design
partner. **U21-a may run in parallel only if it does not delay Slice 1.**

**Explicitly forbidden as a Slice 1 acceptance target: an L1-only build.** If L1+L2 cannot
realistically be done in days, the response is **a concrete timeline and the exact blockers** — not a
quietly descoped "MVP".

## Options considered

| | Option | Why not |
|---|---|---|
| **A** | **B3 first** (the package's standing position) | **The argument still stands and is recorded below as a consequence, not deleted.** Rejected by the founder for this phase: he wants a real artifact in his team's hands before spending the interview budget. |
| **B** | **MVP first, team test, then B3** | ✅ **Chosen.** |
| **C** | MVP first but B3 between Slice 1 and Slice 2 | Explicitly rejected by the founder. |
| **D** | L1-only Slice 1, L2 later | Explicitly rejected by the founder. **And he is right on the merits, though not for the obvious reason.** 🔴 **L1 is the package's *highest-value* feature** — doc 00 §1.3 is titled *"The highest-value feature needs no ML, and you deferred it"* — **so an L1-only build would demo WELL.** **That is the danger, not the objection.** The objection is that per doc 00 §5 and doc 03 §3.3, *"a regex catches the IC number in any language — nobody needs a model for that"*: **L1 is the part that is not ours.** An L1-only Slice 1 would demo **the highest-value feature and none of the differentiated one**, convincingly enough to be believed — and the team would validate a product we do not have. |

## Consequences

**The founder's reasoning, which is sound and is not a compromise:** a team test is a **different
learning loop**, not a worse one. It is the first time the product is used by people who did not
design it, and it produces evidence no interview can: **whether the thing is usable**, whether the
modal is tolerable, whether the latency is felt, whether people turn it off. **Doc 00 §7's
underclaiming argument cuts this way too** — walking into a B3 interview with a working extension is a
different conversation from walking in with a deck.

🔴 **The dissent, recorded once and then dropped, because the founder has heard it and decided:**

- **B3 is still unasked, still cheaper, and still likelier to be fatal than anything Slice 1 can
  discover.** A team test cannot tell us whether an IT lead will force-install; **the founder's own
  team is not the buyer** (ADR 0001: the buyer is the compliance officer, not the user). **A team that
  likes it tells us the product is pleasant, not that it is procurable.**
- **The failure mode this creates is specific:** Slice 1 and Slice 2 are **months of engineering
  against an unvalidated deployment assumption.** If B3 comes back negative after Slice 2, that work
  was spent answering *"can we build it?"* — **which we already knew the answer to, because that is
  what U12 just proved.**
- **This is now the package's largest single bet, and it should be named as one in doc 08 rather than
  discovered.**

**What this does NOT change:**

- **Decision #7 itself is intact** — Phase 0 is still text-first, files second. **Only the gap between
  them shrinks**, from *"a later commercial phase"* to *"immediately after the team test."*
- **Decisions #2 and #8, and the E2 rehydration kill, are unchanged and Slice 1 must honour all
  three.** The founder restated all three unprompted in the same message that set this sequence.
- **B3 is deferred, not cancelled.** **U6-b's *curve* is ours and Slice 1 produces it for free; only
  its *threshold* is parked** (doc 06 §3.3) — so Slice 1 **does** advance the #1 engineering number,
  just not to a pass/fail.
- **ADR 0001 is untouched.** The buyer is still the compliance officer. **The team test measures the
  user, and the user is not the buyer** — that gap is the thing to keep visible.

**The trigger that would reopen this ADR:** Slice 1 or Slice 2 slipping far enough that the parked
interviews would have completed inside the slip. **The cost of B3 is a week of the founder's phone
calls; the cost of the slices is measured in engineer-months.** If the ratio moves, the ordering
should be re-argued — **on the ratio, not on this ADR's authority.**
