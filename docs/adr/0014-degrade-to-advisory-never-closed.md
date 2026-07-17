# ADR 0014 — A dead engine degrades to advisory. There is no fail-closed mode.

**Status:** Accepted (2026-07-17) · **Deciders:** founder + CTO · **Resolves:** doc 01 §7's deferred
call · **Implements:** doc 02 §8's specification · **Depends on:** decision #3, ADR 0002, B3

## Context

Doc 01 §7 listed **fail-closed** as *"a product decision, not an engineering one — doc 06 argues it."*
Doc 02 §2.4 then split two failures that had been treated as one:

- **Engine slow** — contention, a cold offscreen document, a long paste. The cache is cold, the gate
  stops the event, the user sees *"scanning…"*, **and it resolves.** Friction: annoying, visible,
  **loud**, self-clearing.
- **Engine dead** — offscreen crashed, model failed to load, OOM on D2. **The miss never resolves.**
  *"Scanning…"* becomes a hang.

Doc 02 §2.4 named the trap precisely: a hung modal generates support tickets immediately, so **the
pressure will be to add a timeout that lets the send through** — a **silent fail-open**, decision #8's
spirit and doc 00 §6's worst case. It specified the resolution (degrade to advisory, surfaced) and left
**the fail-open/fail-closed call to this document.**

Doc 05 §3.3 then added two more triggers reaching the same state: a **broken adapter** (`readText()`
returns `""`) and an **unresolvable surface** (U12-c).

## Options

1. **Fail-closed** — a dead engine blocks sends to the covered surfaces.
2. **Fail-open to advisory** — sends proceed, the user and the admin are told *"protection degraded,"*
   and it lands in the audit trail.
3. **Admin-configurable** — ship both, let the tenant choose.

## Decision

**Option 2. Always. There is no fail-closed mode in Phase 0 and we do not build one.**

### Option 1 is the intuitive answer and doc 00 §1.4 already refuted it

**The case for fail-closed is strong on its face.** The buyer bought *"nothing leaks."* A control that
stops working and lets traffic through is not controlling anything. For a compliance officer, a dead
control that fails open reads like negligence.

**It is wrong, and the refutation was written before the question was asked:**

> *"You have **trained** the user to find the uncovered channel. A control that visibly blocks one door
> while an unlocked door sits beside it doesn't reduce leakage — **it redirects leakage to a channel you
> can't even audit.**"* — doc 00 §1.4

**Apply it here.** ChatGPT and Claude both ship **native desktop clients**, which ADR 0002 accepts we do
not cover and which sit on the user's dock.

> 🔴 **A dead engine that blocks ChatGPT in the browser sends the user to the ChatGPT desktop app.**
>
> **Fail-closed does not prevent the leak. It relocates it to the channel we cannot see — at the exact
> moment our telemetry is already broken.** The compliance officer's dashboard would show zero sends,
> and **it would mean the opposite of what it appears to mean.** That is not a degraded control. It is
> **an actively misleading one**, which doc 00 §6 ranks below having no control at all.

### The second-order effect is worse than the first

Per doc 00 §4 we optimize for **non-defection**, and per `ASSUMPTIONS.md` §4, *"that the extension can't
be removed"* is a **deliberate non-assumption** — in Phase 0 (decision #6, self-install) removal is one
click, and force-install is gated on **B3**, which is Low confidence with zero primary research.

> **A tool that blocks your work when it breaks gets uninstalled. Then it detects nothing at all,
> forever.** Fail-closed trades a **temporary** gap for a **permanent** one, and it does the trade at
> the worst possible moment — when the user is already frustrated and already looking for a way around.

### Option 3 is rejected, and not on cost

Shipping fail-closed as a tenant toggle sounds like deference to the buyer. **It is deference to a
setting that makes their outcome worse**, and we would be the ones who knew. Per doc 00 §7's
underclaiming argument and ADR 0009's standard: **the honest move is to say what the option does, not
to ship it and let the label do the arguing.** *(And per ADR 0009: "Do not pre-build it against the
possibility.")*

## Consequences

**Accepted:**
- **Three triggers, one mode** (doc 05 §3.3): engine dead · adapter broken · surface unresolvable →
  **advisory, surfaced to the user *and* the admin as *"protection degraded."*** Decision #3 already
  ships advisory for the solo tier — **this is a third trigger for a mode we build anyway, not a new
  mode.**
- 🔴 **During degradation we are not a control.** We are a warning label plus an audit record saying
  *"protection was degraded on this device from 14:02 to 14:09."* **That is a worse product for those
  seven minutes and an honest one.** Per doc 00 §6's framing: **a seatbelt with a broken sensor does not
  immobilize the car.**
- **It must be loud in both directions.** The user must know the gate isn't gating (or they will assume
  it is). The admin must see it in the audit trail (a device with a dead engine is a **compliance
  event**, on the same argument doc 00 §4 makes for uninstall paging someone). **Swallowing it as an
  internal error is the failure this ADR exists to prevent.**
- **The timeout that declares the engine dead is doc 06 §7.1's, derived from U6-b — and it cannot be a
  constant.** Latency is a function of chunk count (doc 06 §4.2), so **a fixed timeout would declare
  the engine dead on a long Chinese paste** — i.e. on the wedge, on the dominant threat. **It is a
  function of pasted tokens.**

**Costs:**
- **We will be asked for fail-closed in a security review, and "no" needs the full answer, not a
  policy.** The answer is the desktop app: *"we can block the browser. We can't block their dock. If we
  block, they move there and you lose the audit trail too."* **That answer is checkable and it is
  theirs to verify.**
- **This is the one place the product is weakest exactly when it is most needed** — a dead engine on a
  device is a device with no protection. **Doc 08 should carry the engine-liveness rate as a metric we
  will be asked for and do not have.**

**Revisit if:** a design partner's security review **demands** fail-closed → build it, **and tell them
what it does.** Per ADR 0009: *one customer saying it is worth more than our entire estimate of whether
they will.* Or: if Phase 1 force-install (B3) is paired with **EDR-level blocking of the desktop apps**,
the doc 00 §1.4 argument weakens — **fail-closed only makes sense for a customer who has closed the
other doors**, and that is a customer configuration, not our default.
