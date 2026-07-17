# U12 harness

> **[`PROTOCOL.md`](PROTOCOL.md) is the thing to read.** This file explains the shape.
>
> **Load unpacked** → `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
> **No `npm install`. No build step.**

## Why this is raw MV3 and not WXT

**Doc 01 §6 wrote the rule before the question came up:**

> *"**Decision rule:** if WXT's abstractions fight the offscreen-document or **MAIN-world injection**
> work in week 1, **eject to CRXJS immediately** — those two are load-bearing and **framework magic
> there is a liability, not a convenience.**"*

**U12 *is* that work.** And doc 05 §1.1 classes U12-a as *"a **browser behaviour.** Either Chrome does
this or it doesn't. **Not tunable.**"*

> 🔴 **A build step between the claim and the browser makes a rework-trigger test ambiguous.** If
> U12-a failed under WXT we could not tell Chrome from the framework's content-script registration —
> and doc 05 §1 explicitly refuses that: U12 *"must be proven empirically, per surface — **not reasoned
> about**."* **A confound in the one test whose entire value is being unambiguous is not a tradeoff.
> It is the test not working.**

**And a second reason that is not about rigor:** zero dependencies means **30 seconds to load, no
toolchain.** Per `../../../CLAUDE.md` §7.3, U12 is ranked **#2 of everything** *because* it is cheap.
**A spike that needs a toolchain is a spike that slips** — and this one gates whether the rest is
worth building.

**The WXT skeleton is [`../../extension/`](../../extension/).** Different artifact, different job.

## The files

| | |
|---|---|
| `manifest.json` | **Deliberately minimal and comment-free.** Chrome warns on unrecognized manifest keys, and whether it tolerates them *inside* the `content_scripts` schema is not something I was willing to assume — **a manifest that fails to load is a spike that doesn't run.** The commentary lives here instead. |
| `iso-gate.js` | **ISOLATED world** — where the real gate lives (ADR 0005). U12-a + U12-b. |
| `main-probe.js` | **MAIN world** — U12-c's listener inventory + a React stand-in + U20, free. ⚠️ **Read its header before copying anything from it.** |
| `hud.js` | Shadow-DOM HUD. Live counters, ARM toggle, **Copy JSON**. |
| `PROTOCOL.md` | 🔴 **The actual protocol. Steps 0–7.** |
| `analyse.test.mjs` | **Tests for the U12-b analyser** — `node analyse.test.mjs`, no deps. **It exists because the first analyser shipped a false 🔴 verdict** (see below). Case 1 is the founder's actual capture. |

## MAIN-world code is in here and does not ship

**ADR 0012: Phase 0 injects nothing into the MAIN world.** The observer is `chrome.webRequest` in the
service worker — because a MAIN-world patch **(a)** only sees the transports we enumerated (an
unbounded, silent blind-spot set, in the component that exists to catch silent misses) and **(b)**
**can break the provider's app**, force-installed across an estate.

`main-probe.js` exists **only** because U12-c's protocol (doc 05 §1.4 step 1) needs an inventory of
what the page registers, and that is obtainable only from inside the page's own context. **It is a
measuring instrument, on two machines, for a week.** It is written defensively — every patch swallows
its own exceptions and always calls through — for exactly the reason ADR 0012 gives. **Nothing in it
is a component.**

## Two things the harness will not do

1. **It will not return a combined verdict.** Doc 05 §1.1: *"the blast radii are not comparable, so a
   combined verdict is meaningless."* It reports **U12-a / U12-b / U12-c separately**, and each can
   return **INCONCLUSIVE** or **NOT TESTED**. *(A harness that cannot say "inconclusive" is a harness
   that will say "pass.")*
2. **It will not invent the IME suppression window.** Doc 05 §1.3: *"It is derived from the U12-b
   measurement or it does not exist."* It reports `gapDistributionMs` and refuses to pick.

## It is not armed by default

**ARM suppresses real `Enter` sends on your real account.** That is U12-a step 3 and it is the point —
but doc 05 §1.2's pass criterion is **stricter than "the event stopped"**:

> *"ADR 0005's whole reason for preferring capture over `fetch`-layer aborts is that **the app never
> enters its send state machine, so there is nothing to unwind.** A test that shows the send suppressed
> but leaves a spinner turning has **falsified the actual claim while appearing to pass.**"*

**No log can see a stuck spinner. PROTOCOL.md step 5 is you, looking at the page.**

---

## 🔴 The analyser shipped a false verdict on the first real run. Read this before trusting it.

**2026-07-17.** The first version reported `compositionend_then_keydown` on **both** surfaces — the
🔴 verdict meaning *"`isComposing` is insufficient; doc 05 §1.3's suppression window is REQUIRED,
and its value comes from these gaps."*

**It was wrong.** The founder rejected it on the **magnitudes**: gaps of **3.6–40.8 s** (ChatGPT) and
**0.22–5.44 s** (Claude). **A composition commit and its keydown are one physical key press.** 40
seconds is a *send* Enter.

**The bug:** the analyser searched for the **nearest `Enter` anywhere in the log** — proximity, not
causation — on a premise that was simply false: **most compositions never commit with `Enter` at
all.** Microsoft Pinyin commits on **space**, a **number key**, **punctuation**, or a **mouse click**
on a candidate. So most `compositionend`s have no commit-Enter, and the analyser paired them with
whatever it could find.

> 🔴 **The lesson is bigger than the bug, and it is why the obvious fix is a trap.** It was caught
> **because 40.8 s is absurd.** The same mis-pairing grabbing an Enter **80 ms away** would have
> produced a **plausible** *"window ≈ 80 ms"* — **and been believed.** We would have built the number
> that decides whether Chinese input works **out of noise**, in the wedge's own language.
>
> **CLAUDE.md §9: plausible numbers do not get checked. Implausible ones do.** So **an instrument's
> most dangerous output is when it is only slightly wrong** — and **bounding the search by time does
> not fix a mis-attribution. It converts an absurd number into a plausible one.**
>
> **Fix the attribution, or fix the capture. Never the tolerance.**

**Both were fixed:**

- **Attribution** — pair only when the **next key event of any kind** after a `compositionend` is a
  `keydown: Enter`, because a commit and its keydown are the same press. That needs `keyup`, which
  the first version never recorded. Space-, number- and mouse-committed candidates now fall out
  correctly instead of being mis-paired.
- **Capture** — the protocol was the other half of the bug. It said *"do this ~10 times, **mixed with
  real sends**"*, which is the instruction that made the log unattributable. **PROTOCOL.md §6a is now
  a focused capture: one composition, one Enter, stop** — and the analyser **refuses to emit a verdict
  or a window without one**, because a mouse-committed candidate is otherwise indistinguishable.

**This is CLAUDE.md §2's ledger #10, and it is the first instance that is *code* rather than prose.**
**An instrument has connectives too:** every `if` that turns data into a verdict is a *therefore*, and
**nobody audits a function the way they audit a sentence.** The most dangerous lines in this directory
are the `verdict:` strings — they are the only place a measurement becomes a claim with no human in
between. **Hence `analyse.test.mjs`.**
