# `code/` — the scaffold

> **Read [`../CLAUDE.md`](../CLAUDE.md) §4 first.** This directory is **deliberately two artifacts
> with two different jobs**, and conflating them is how the week-1 spike slips.

| | What | State |
|---|---|---|
| [`spikes/u12-harness/`](spikes/u12-harness/) | 🔴 **U12-a/b/c against real ChatGPT + Claude.** Raw MV3, **zero build, zero dependencies.** | ✅ **LIVE. Run it.** |
| [`spikes/u21a-fertility/`](spikes/u21a-fertility/) | 🟢 **U21-a — stock-vocabulary fertility.** Public raw text, an afternoon. | ✅ **LIVE. Verified end-to-end.** |
| [`extension/`](extension/) | The doc 01 §2 component skeleton. WXT + TypeScript. | ⬜ **STUBS.** Shape only. |
| [`backend/`](backend/) | ADR 0007's FastAPI service — policy, dictionary, hashed audit ingest. | ⬜ **STUB.** |

---

## Why the spike is not built on the skeleton

**The spike is raw MV3. The skeleton is WXT. That is on purpose, and doc 01 §6 wrote the rule
before the question came up:**

> *"**Decision rule:** if WXT's abstractions fight the offscreen-document or **MAIN-world injection**
> work in week 1, **eject to CRXJS immediately** — those two are load-bearing and **framework magic
> there is a liability, not a convenience.**"*

**U12 *is* that work.** And doc 05 §1.1 classes U12-a as *"a **browser behaviour**. Either Chrome does
this or it doesn't. **Not tunable.**"*

> 🔴 **A build step between the claim and the browser makes a rework-trigger test ambiguous.** If
> U12-a failed under WXT, we could not tell Chrome from the framework's content-script registration —
> and doc 05 §1 refuses that: U12 *"must be proven empirically, per surface — **not reasoned
> about**."* **A confound in the one test whose entire value is being unambiguous is not a tradeoff.
> It is the test not working.**

**And a second reason that is not about rigor at all:** zero dependencies means **load unpacked, 30
seconds, no `npm install`.** Per `../CLAUDE.md` §7.3, U12 is ranked **#2 of everything** *because* it
is cheap. **A spike that needs a toolchain is a spike that slips** — and this one gates whether any of
the rest is worth building.

---

## Order of operations, and it is not the order you'd guess

**Per `../CLAUDE.md` §7.3 — rank by blast radius, not by cost:**

1. 🔴 **B3 — 5–10 phone calls.** *Not code.* Doc 00 §7: *"**Go make ten phone calls before you write a
   line of the detection engine.**"* It asks *"will anyone deploy it?"* while U12 asks *"can we build
   it?"* — and the first is cheaper to answer and likelier to be fatal. **Doc 07 §1.5 adds one
   question to that script and closes the precision floor for free.**
2. 🔴 **U12-a** — [`spikes/u12-harness/PROTOCOL.md`](spikes/u12-harness/PROTOCOL.md). **The package's
   single rework trigger, and the cheapest test in it.** *"If U12-a fails, no part of doc 05
   survives"* (doc 05 §1.2). **Nothing below is worth building until this passes.**
3. 🟢 **U21-a** — [`spikes/u21a-fertility/`](spikes/u21a-fertility/). Free, an afternoon, **and
   one-sided: a fail is final.**
4. 🟠 **U12-b** — the IME test. **Needs Microsoft Pinyin on Windows.** Highest-risk of the three, and
   **"not tested" is a real result, not a pass.**
5. Everything in [`extension/`](extension/).

> **Steps 1–4 cost about a week and no engineering.** Step 5 costs 18 months (A1/A2). **The scaffold
> is deliberately stubs until 1–4 report**, and that is the ordering doc 05 §1.1 argues for: *"Read
> the failure column top to bottom — it is a ranking, and **it inverts the effort you'd naively
> spend.**"*

---

## What is NOT here, and why

- **No model weights.** ~140 MB trimmed / ~279 MB stock (doc 03 §4.2, derived). Not a repo artifact.
- **No selectors.** Doc 05 §3.1 ships none **deliberately**: they are wrong by the time you read them
  (D4), and a committed selector reads as a spec.
- **No timeout, no TTL, no precision floor, no fertility ratio, no tokens/sec.** Every one of these is
  refused by the doc that owns it, and **the scaffold does not launder an estimate into a constant by
  writing it in code.** A number in a config file looks decided.
- **No MAIN-world code in `extension/`.** ADR 0012: **Phase 0 injects nothing into the MAIN world.**
  The one MAIN-world file in this tree —
  [`spikes/u12-harness/main-probe.js`](spikes/u12-harness/main-probe.js) — is **a measuring
  instrument for a spike, on two machines, for a week.** Its header says so. **Nothing there ships.**

## Standing constraints the code inherits

- **Per-tenant DEKs from day one** (ADR 0009). *"Not an optimization — a global DEK makes staged
  crypto-shredding impossible and forces a flag-day migration."*
- **`composedPath()`, never `event.target`** (ADR 0005). Shadow DOM retargets.
- **The gate registers at `window`** (ADR 0010), not `document`.
- **The verdict cache is monotonic toward dirty** (ADR 0013). L1 may write `DIRTY`; **only a completed
  L1+L2 scan may write `CLEAN`.**
- **Degrade to advisory. Never fail-closed** (ADR 0014).
- **L1's placeholder-grammar mask is `\b…\b`, not `^…$`**, and **its type list is generated from doc
  04's minter, not typed twice** (doc 07 §6.1).
- **Identifier fixtures are generated from the grammar, never from an LLM** (doc 07 §4.2/§4.3).
