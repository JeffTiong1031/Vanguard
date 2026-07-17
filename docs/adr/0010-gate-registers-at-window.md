# ADR 0010 — The gate registers at `window`, not `document`

**Status:** Accepted (2026-07-17) · **Deciders:** founder + CTO · **Refines:** [ADR 0005](0005-gate-in-isolated-world.md) ·
**Depends on:** U12-a, U12-c

## Context

ADR 0005 settled the hard question — the gate lives in the **isolated world**, because that is where
the verdict cache lives and the gate must read it synchronously (doc 01 §0). That decision stands
entirely.

It also specified a node: *"a capture-phase listener registered on `document` from a content script at
`document_start`."* `document` is sufficient to beat React, which delegates at its **root container**
(React 17+), a descendant of `document`. Capture-on-an-ancestor precedes anything on a descendant, so
registration order never enters into it.

**But U12-c asks a different question, and `document` is the wrong answer to it.** `window` is above
`document` on the capture path. A page listener registered at `window`, capture phase, fires **before**
ours on `document` — and if it calls `stopPropagation()`, our gate never runs. **Silently.** The
control appears installed, the dashboard is green, and every send goes ungated: doc 00 §6's worst case
for a compliance buyer.

## Options

1. **Register at `document`** (ADR 0005 as written), and treat a `window`-level page listener as a
   detected-and-reported bypass.
2. **Register at `window`**, capture phase, at `document_start`.
3. **Register at both**, `window` primary and `document` as a fallback.

## Decision

**Option 2.**

`window` is the first node on the capture path. Nothing is above it. Registering there means the
bypass class U12-c exists to detect **cannot be constructed** by a page listener, because there is no
node from which to preempt us.

The only remaining way for a page to beat us is to register at the **same node, same phase, earlier** —
and a page script cannot run before a `document_start` content script. *(This is Chrome's documented
intent and it is **[unverified]** as an absolute guarantee, which is why U12-c's protocol in doc 05 §1.4
measures it rather than assuming it. **The move is still strictly better regardless of the result:** it
cannot make us later than `document` would have.)*

**Option 3 rejected.** Two listeners for one event doubles the surface on which
`stopImmediatePropagation()` semantics, double-firing, and token burning must be reasoned about — for a
"fallback" that can only fire in the case where the `window` listener already ran. It buys nothing and
adds a state.

> **The cost of this decision is one argument. The thing it buys is the deletion of an entire
> fail-open class.**

## Consequences

**Accepted:**
- **U12-c drops from a bypass we must detect to a bypass that cannot be built** — but it is **not
  deleted from the spike.** Doc 05 §1.4's protocol still enumerates each surface's existing `window`
  listeners, because the inventory is what tells us whether `document_start` ordering actually holds
  in production. **The mitigation makes U12-c cheap. It does not make it unnecessary.**
- Everything ADR 0005 decided is untouched: isolated world, capture phase, `composedPath()` not
  `event.target`, cover every send path, MAIN world is observer-only.
- `window` receives events from the whole page rather than a subtree, so the gate's first act must be
  `composedPath()` resolution against the adapter's `isComposer`. **It had to do that anyway** (shadow
  DOM retargets `event.target` — ADR 0005), so this costs nothing new.

**Costs:**
- The gate now sees every keystroke on the page, including in the provider's own search boxes and
  settings dialogs. **This is a filtering cost, not a privacy cost** — we are already a content script
  in that page with full DOM access, so no boundary moves.

**The reasoning worth preserving**, because it generalizes past this decision:

> ADR 0005 asked *"what do we need to beat?"* and `document` is the right answer. It did not ask
> *"what could beat us?"*, whose answer is one node higher. **Both questions have the same shape and
> only one of them got asked.** When a design picks a position in an ordered structure, ask both.

**Revisit if:** doc 05 §1.4's inventory finds a surface registering at `window` capture in a way that
preempts a `document_start` content script — at which point the DOM is out of mechanisms for that
surface, [ADR 0012](0012-observer-uses-webrequest.md)'s observer becomes its only signal, and per ADR
0005's own revisit clause **fail-open becomes structural there**. That is a product decision (drop the
surface, or ship it advisory-only and say so), not an engineering fix.
