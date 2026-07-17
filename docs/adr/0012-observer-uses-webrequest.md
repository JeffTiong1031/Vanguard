# ADR 0012 — The log-only observer uses observational `webRequest`, not a MAIN-world `fetch` patch

**Status:** Accepted (2026-07-17) · **Deciders:** founder + CTO · **Reverses:** the plan's stated
observer mechanism · **Corrects:** U11's inference · **Depends on:** U20 · **Constrained by:** ADR 0005

## Context

The log-only observer is confirmed in Phase 0 (founder-approved). It exists because a DOM gate that
misses a send path — Enter, Ctrl+Enter, the Send button, paste-and-send, voice — **fails open,
silently**, which per doc 00 §6 is the worst outcome available to a compliance buyer: the control stops
working while the audit trail says it worked. **The observer reconciles what was actually sent against
what the gate authorized, and reports the difference as a bypass.**

The plan specifies the mechanism as a **MAIN-world `fetch` patch**. That choice traces to **U11**:

> *"`declarativeNetRequest` cannot inspect request bodies. Believed true — and if so it's
> **dispositive**: the log-only fetch observer **must** be a MAIN-world patch, since dNR structurally
> cannot see prompt content."*

**U11 is TRUE.** Chrome's documentation lists what a dNR rule may match on — URL, resource type,
method, domains, tab, response headers — and bodies appear nowhere. The API's stated design is that
*"extensions modify network requests without intercepting them and viewing their content."*

**The inference drawn from it is a non-sequitur.** It runs: *dNR cannot see bodies → no extension API
can → we must patch the page.* **The middle step is false.** `chrome.webRequest` is a different API and
its **observational half survived MV3**:

> *"Aside from `"webRequestBlocking"`, the webRequest API is unchanged and available for normal use."*

`onBeforeRequest` still supplies **`requestBody`** via `opt_extraInfoSpec`. **Only the blocking half was
restricted**, to *"policy installed extensions"* — which is us at Phase 1.

> **U11 eliminates dNR. It does not select MAIN-world, and it never did.** The mechanism was reached by
> ruling out one option and not looking for a second.

## Options

| | MAIN-world `fetch` patch | **Observational `webRequest`** |
|---|---|---|
| World | **B1 — untrusted** | **B3 — extension privileged** |
| Sees | What the app passed to `fetch` | **The wire bytes** |
| Coverage | **Only the transports we patch** | **Every HTTP request to the host, whatever API made it** |
| WebSocket frames | ✅ (patch `WebSocket.send`) | ❌ **Handshake only** |
| Can break the provider's page | 🔴 **Yes** | ❌ No |
| New permission | None | `webRequest` |

## Decision

**Observational `chrome.webRequest.onBeforeRequest` with `requestBody`, in the service worker. It never
blocks.**

### The permission objection, killed first

`webRequest` looks expensive against doc 02 §6.4's un-N/A-able row. **It isn't.** We already hold
`host_permissions` on those exact origins, which lets us **inject arbitrary code into the page**.
**Reading a page's network traffic is strictly less power than running code in it.** The marginal
disclosure is near zero. *(Whether `webRequest` adds a distinct install-time warning string beyond the
host warning is **[verify]** — a store-listing question, not an architecture one.)*

### The decisive argument: enumeration is where silent misses come from

**Amended 2026-07-17 — the original argument here was overstated, and the founder was right to press
it.** It claimed the MAIN-world patch *"is defeated by the same class of event that defeats the gate"*
and called it *"a second opinion from the same doctor."* **Checked concretely, the failure sets overlap
far less than that implies:** the gate fails on **DOM** changes (a selector rename, a preempting
listener, a non-event send path), the patch fails on **transport** changes. A selector break blinds the
gate and not the patch. A `fetch` → XHR switch blinds the patch and not the gate. **They are correlated
only in a narrow corner** — e.g. a voice submission issued from a Web Worker. **"Shared failure domain"
was the right instinct and the wrong argument.** The durable one is narrower and survives:

> **A MAIN-world patch only ever sees the transports we thought to enumerate.** `fetch`, XHR,
> `sendBeacon`, `WebSocket` — **and `fetch` inside a Web Worker, which a `window.fetch` patch never
> touches, because a worker has its own global scope.** Every transport we fail to enumerate is a
> **silent** miss. **`webRequest` enumerates nothing over HTTP.** It watches the network, not the JS,
> so the page cannot route around it by changing which API it calls.

**Compare the blind spots honestly, because this is the whole decision:**

| | Blind spots | Knowable in advance? |
|---|---|---|
| **MAIN-world patch** | **Unbounded** — every transport not enumerated, including worker scopes and whatever ships next quarter | ❌ **No. Each one fails silently.** |
| **`webRequest`** | **Exactly one** — WebSocket frames | ✅ **U20. One look at the Network tab, week 1.** |

> **The observer exists to catch silent misses. Its mechanism must not have an open-ended set of its
> own.** We are trading an **unbounded, silent, unknowable** blind-spot set for **one, known, and
> testable before we build.** That is the trade, and it is not close.

### The second argument, which is about the customer, not the architecture

**A MAIN-world patch can break the provider's app.** We would be monkey-patching a third-party SPA's
network layer, force-installed into every browser in the estate, and it must never throw on any path —
including paths that ship next Tuesday. **If it does, their send fails.**

> For a compliance vendor at pre-seed, *"your DLP tool broke ChatGPT for 150 people"* is not a bug. **It
> is the end of the account and probably the company.** `webRequest` is a passive observer and
> **structurally cannot do this.**

**This is the argument doc 00 §4 would make if it were here:** we are optimizing for **non-defection**,
and there is no faster route to defection than breaking the tool the user is trying to use.

### A third consequence, free

**It moves the observer from B1 to B3.** Doc 01 §5 restricts the observer to *"hashes only"* **because
B1 is untrusted.** In B3 that is no longer compensation for a bad location. **We keep hashing anyway —
I3 requires it** — but now for the right reason.

## Consequences

**Accepted:**
- 🔴 **Doc 01 §2 and §5 are now wrong.** Both diagrams place the observer in the MAIN world / B1.
  **Two diagrams and one boundary row.** Flagged rather than silently patched.
- **A second adapter — but it is the feature's cost, not this decision's.** Extracting the prompt from
  `requestBody.raw` means parsing the provider's **request schema**, which churns on the same D4 clock
  as the DOM adapter, **and doc 05 §3.3's self-test covers only the first.** A doc 08 maintenance line.
  > ⚠️ **Corrected 2026-07-17 — this bullet read "we do not escape the adapter tax; we double it," as
  > though the doubling were a cost of choosing `webRequest`. It is not, and the framing was wrong
  > enough to argue against this ADR.** A MAIN-world patch pays it **identically**: it intercepts
  > `fetch(url, init)` where `init.body` is **already serialized**, so it must dig the prompt out of the
  > same provider schema. Hashing the whole body doesn't help either — the gate hashed the *composer
  > text*, and the body carries `conversation_id`, `model`, and the rest. **The request-schema adapter
  > is the price of content-based reconciliation (see "Reconciliation needs the body" below). Both
  > mechanisms pay it. It does not discriminate, and presenting it here made `webRequest` look worse
  > than it is in a like-for-like comparison.**
- **Blind to WebSocket frames.** New unverified claim **U20**: that each surface submits prompts over
  **HTTP** rather than a WS frame. If a surface moves to WS, it needs a MAIN-world `WebSocket.send`
  patch **in addition**, accepting every cost above for that surface alone.
- **Reconciliation needs the body**, and this is why U11 mattered. The cheaper design — reconcile on
  **timing**, no body needed — fails on precision: retries, regenerations, double-sends and background
  polls each produce a **false bypass report**, and per ADR 0001 every false positive is a ticket the
  admin eats. **A bypass alarm is the highest-severity thing we put in front of a compliance officer.
  Crying wolf there is worse than not shipping the feature.**
- **SW lifecycle is a non-issue here.** U10 is 30 s idle (cited), events wake the SW, and **the
  observer is log-only, so its latency is irrelevant.**

**Costs:**
- A permission we would otherwise not request, and a reviewer conversation about it. **The answer is
  the paragraph above and it is short.**

### The capability we will be given and will not take

**`webRequestBlocking` is restricted to policy-installed extensions. At Phase 1 we are policy-installed
(B3).** So the blocking capability arrives unrequested.

> **We still don't take it.** ADR 0005 rejected fetch-layer gating because **aborting inside a committed
> request throws into a React state machine never designed for it** — error toasts, stuck spinners,
> corrupted conversation state. **Force-install changes our permissions. It does not change React.**
>
> Recorded because *"we can block at the network layer now"* is exactly the kind of capability that gets
> used because it became available, and by then ADR 0005 will be three ADRs and a year ago.

**Revisit if:** **U20** fails on a surface (prompts go over WebSocket frames) → that surface needs the
MAIN-world patch in addition, not instead. Or: a surface's request schema churns fast enough that the
wire-format adapter costs more than the bypass detection is worth → **drop the observer for that
surface and say so in the threat model**, rather than keeping a check nobody maintains.
