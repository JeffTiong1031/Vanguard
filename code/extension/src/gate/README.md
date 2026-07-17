# The gate

**STUB.** ADR 0005, ADR 0010, ADR 0013.

🔴 **Blocked on U12-a — the package's single rework trigger.** Prove it before building this:
[`../../../spikes/u12-harness/PROTOCOL.md`](../../../spikes/u12-harness/PROTOCOL.md).

## The one arrow the architecture rests on

Doc 05 §1.2: **capture ① at `window` must precede ③ at React's root container.**

That is U12-a. It is **a browser behaviour** — *"either Chrome does this or it doesn't. Not tunable"*
(doc 05 §1.1) — and **if it fails there is no fallback.** The gate would move to the MAIN world, which
ADR 0005 shows destroys the synchronous cache read → which is doc 01 §0's coupling → which is
decisions #2 and #8. **Rework, not tuning.**

## Non-negotiables

| Rule | Source | Why |
|---|---|---|
| **Register at `window`, capture, `document_start`** | ADR 0010 | `window` is **above** `document` on the capture path. A page listener at `window` fires **before** ours and could `stopPropagation()` us into silence — **fail-open, invisible, dashboard green** (U12-c, doc 00 §6's worst case). At the same node and phase **first-registered wins**, so `document_start` timing is the lever. |
| **`composedPath()`, NEVER `event.target`** | ADR 0005 | **Shadow DOM retargets `target` to the host.** `target` lies about whether the event started in the composer. |
| **Pass through composition Enters** | doc 05 §1.3 | `isComposing \|\| keyCode === 229`. **Enter commits an IME composition — it does not mean "send."** The naive gate **breaks Chinese input entirely**: the language we differentiate on, for the users we sell to, on the first keystroke of the first demo. |
| **The cache is monotonic toward dirty** | ADR 0013 | L1 may write `DIRTY`. **Only a completed L1+L2 scan may write `CLEAN`.** Otherwise the L1 short-circuit is a **silent fail-open** — reporting a clean scan of a prompt we never finished scanning. |
| **Never auto-submit** | Decision #8 | The token **withholds an interruption**; it never generates an event. The user's keypress does the sending, exactly as with no extension installed. |

## Why the composition rule fails in the *safe* direction

Passing a composition `Enter` through means a send-intent `Enter` misread as a commit **gets through
ungated** — a silent miss. That looks like the wrong trade. It isn't (doc 05 §1.3):

1. **The miss is bounded to the instant after a composition commits** — milliseconds, one keystroke,
   not a standing hole.
2. **The observer catches it** (ADR 0012). An ungated send that reaches the network is reconciled and
   reported as a **bypass**. **The failure lands in the audit trail rather than in silence.**

**The alternative — stopping ambiguous Enters — fails to friction, which doc 02 §2.4 normally
prefers. We decline it here on a product judgement:** that friction would land on **every committed
composition**, i.e. every few words of Chinese typing. *"That is not friction. That is a broken text
box"* — and in Phase 0, removal is one click.

## No numbers live here

The **post-`compositionend` suppression window** has **no value** until U12-b measures it. Doc 05
§1.3: *"It is derived from the U12-b measurement or it does not exist. Inventing '50 ms' now would be
exactly the fabrication `ASSUMPTIONS.md` §3 exists to prevent, and it would be a number that silently
decides whether Chinese input works."*

**The U12-b harness reports `gapDistributionMs`. That is where the number comes from.**
