# U12 — the test protocol

> **You run this. I can't.** U12 must be proven against **real ChatGPT and Claude, logged in**
> (doc 05 §1: *"discharged by an unpacked extension in Chrome against real ChatGPT and Claude, not by
> prose"*), and **U12-b's decisive case is Windows + Microsoft Pinyin** — a real IME on a real
> Windows machine. That is your laptop.
>
> **Time: ~20 minutes for U12-a and U12-c. U12-b costs as long as it takes you to install an IME.**
>
> 🔴 **Report the three sub-tests separately. Always.** Doc 05 §1.1: *"The blast radii are not
> comparable, so a combined verdict is meaningless. 'U12 passes' would be a sentence with no
> information in it: it could mean the architecture is sound, or it could mean two of three passed
> and the one that forces rework was the one that didn't."*

| | Blast radius if it fails |
|---|---|
| **U12-a** | 🔴 **REWORK.** No mitigation exists. Doc 05 §1.2: *"If U12-a fails, no part of this document survives."* |
| **U12-b** | 🟠 **The wedge breaks.** Fixable — but the naive version ships broken, in the language we sell on. |
| **U12-c** | 🟡 **Mitigated by ADR 0010** (we register at `window`). Least urgent despite reading as the most alarming. |

---

## Load it

1. `chrome://extensions` → **Developer mode** ON → **Load unpacked** → select
   `code/spikes/u12-harness/`.
2. No `npm install`. No build. That is deliberate — see `manifest.json`'s `_comment_why_raw_mv3`.
3. Open **https://chatgpt.com** (logged in). A small HUD appears bottom-right.

> ⚠️ **The harness observes and does not block until you press ARM.** Pressing ARM suppresses real
> `Enter` sends on a real account. That is the point of step 5, but do not leave it armed.

---

## Step 0 — did the probe land early? (gates U12-c's meaning)

The MAIN-world probe must patch `addEventListener` **before the page's own scripts register
anything**, or its inventory is a list of stragglers rather than a census.

- HUD → **Copy JSON** → check `log[]` for `kind: "main:probe-installed"`.
- **Pass:** it is at or near `seq: 0`, and `readyState` is `"loading"`.
- **Fail:** `readyState` is `"interactive"`/`"complete"` → **U12-c's inventory is not trustworthy and
  must be reported as inconclusive, not as "no listeners found."**

*Why this step exists: Chrome does not formally guarantee ordering across separate `content_scripts`
entries. `manifest.json` declares MAIN first, which is the intent — this measures the reality.*

---

## Step 1 — U12-a, base ordering *(the rework trigger — do this first)*

1. Click into the composer. Type a few words. Press **Enter** (let it send — not armed yet).
2. HUD reads:
   - **`iso@window cap`** — should be ≥ 1. Our isolated-world capture listener fired.
   - **`react stand-in`** — should read **`we fire first`**.

| HUD says | Meaning |
|---|---|
| **`we fire first`** | ✅ U12-a step 2 holds on this surface. Doc 05 §1.2's arrow ① → ③ is real. |
| **`THEY FIRE FIRST`** | 🔴 **STOP. This is the rework trigger.** Copy JSON, send it to me, build nothing else. |
| **`not found`** | ⚠️ **Not a failure and not a pass.** The React-root heuristic did not resolve — doc 05 §1.2 already flags these bundles as `[unverified]`. Skip to step 4 and test against the *real* send instead. |

---

## Step 2 — U12-a, ADR 0010's premise

`analyse().u12a.windowFiresBeforeDocument` should be `true`.

**If `false`, ADR 0010 is wrong** — it moved the gate from `document` to `window` on the reasoning
that `window` is above `document` on the capture path. That would be a decision record to reopen, not
a bug. **Report it.**

---

## Step 3 — U12-c, the inventory

Read `analyse().u12c`.

- **`pageListenersAtWindowCapture: 0`** → nothing above us. ADR 0010's mitigation is intact.
- **`> 0`** → read the `inventory[]`. A page listener at `window` **capture** for `keydown` is the
  U12-c risk: it fires before ours and could `stopPropagation()` us into silence — **fail-open,
  invisible, dashboard green** (doc 00 §6's worst case).
- **`0` but step 0 failed** → **inconclusive.** Say so; do not record a pass.

---

## Step 4 — every send path, not just Enter

Doc 05 §2.3: a gate that only watches `Enter` **fails open, silently** on the others.

Try each and confirm the HUD's event count moves: **Enter** · **Ctrl/Cmd+Enter** · **the Send
button** (look for `kind: "click-send"`) · **paste-then-immediate-Enter** (this is U6-b's path and
doc 00 §6's dominant threat) · **voice input**, if the surface has it.

**A send path that produces no log line is a silent hole.** Note which.

---

## Step 5 — 🔴 U12-a step 3, the one that actually matters

**The machine cannot judge this step. You have to look at the page.**

1. Type a prompt. Press **ARM**.
2. Press **Enter**.
3. **The send should not happen.** Then — and this is the real test:

> Doc 05 §1.2: *"Step 3's pass criterion is the real one, and it is stricter than 'the event
> stopped.' ADR 0005's whole reason for preferring capture over `fetch`-layer aborts is that **the
> app never enters its send state machine, so there is nothing to unwind.** A test that shows the
> send suppressed but leaves a spinner turning has **falsified the actual claim** while appearing to
> pass."*

| Look for | Verdict |
|---|---|
| Nothing happens. Composer keeps text and caret. No spinner. Console clean. | ✅ **PASS** |
| Send stopped **but** a spinner turns / the composer clears / a React error appears / the UI wedges | 🔴 **FAIL** — the app entered its send state machine. **This is a fail even though the send stopped.** |

4. **Un-ARM.** Confirm sending works normally again.
5. Repeat on **https://claude.ai**. Per-surface, per doc 05 §1 — the two surfaces are different apps
   and a pass on one is not a pass on the other.

---

## Step 6 — 🔴 U12-b, the wedge *(needs a real IME)*

**The highest-irony risk in the project** (doc 05 §1.3): *"when composing Chinese through an IME,
`Enter` commits the composition — it does not mean 'send'. A gate that intercepts every `keydown:
Enter` **breaks Chinese text input entirely**"* — i.e. breaks the language we differentiate on, for
the users we're selling to, on the first keystroke of the first demo.

**Priority order is the beachhead's, not symmetry's** (doc 05 §1.3):

| IME | Platform | Priority |
|---|---|---|
| **Microsoft Pinyin** | **Windows** | 🔴 **Highest — this is the beachhead's Chinese user on the D2 laptop** |
| Bopomofo / Cangjie, Google Pinyin | Windows | 🟠 Medium |
| macOS Pinyin | macOS | 🟡 Low |
| **Malay / English** | Any | 🟡 **Low, and say so.** Latin script, no IME. Doc 05: *"CJK is where the risk lives. Malay will almost certainly be fine. Spending equal time on both would be a way of looking rigorous while testing the wrong thing."* |

> 🔴 **REWRITTEN 2026-07-17 after the first real run, because the analyser was wrong and this step
> was what let it be wrong.**
>
> **The first version said:** *"type `nihao`, press Enter to commit… do this ~10 times, **mixed with
> real sends**."* **That instruction is what made the capture unattributable**, and the analyser then
> mis-paired it: it searched for the **nearest Enter anywhere in the log** and reported
> `compositionend_then_keydown` — **the 🔴 dangerous verdict** — with gaps of **3.6 s to 40.8 s**.
> Those were **send** Enters, seconds away, not composition commits.
>
> **Most compositions do not commit with Enter at all** — Microsoft Pinyin commits on **space**, a
> **number key**, **punctuation**, or a **mouse click** on a candidate. So most `compositionend`s have
> no commit-Enter, and the old analyser paired them with whatever Enter it could find.
>
> 🔴 **The lesson is bigger than the bug, and it is why the fix is not "add a time window."** It was
> caught because **40.8 s is absurd.** A version of the same mis-pairing that grabbed an Enter **80 ms
> away** would have produced a plausible *"dangerous ordering, window ≈ 80 ms"* — **and we would have
> built a product parameter out of noise.** CLAUDE.md §9: **plausible numbers do not get checked.** A
> time-bounded search would not have fixed the bug; **it would have made it look right.**
>
> **The analyser now pairs by causal adjacency** — *is the **next key event of any kind** after this
> `compositionend` a `keydown: Enter`?* — because a commit and its keydown are **the same physical key
> press**. **And this step now produces a capture with nothing left to mis-attribute.**

### 6a. 🔴 The focused capture — one composition, one Enter, then stop

**Do not mix sends into this.** The analyser refuses to emit a verdict unless the capture is focused,
and that refusal is the point.

1. Windows Settings → **Chinese (Simplified, China)** → **Microsoft Pinyin**.
2. Click into the composer. **Press Reset on the HUD.**
3. Type `nihao`.
4. Press **Enter once — to commit the candidate.** *(Not to send.)*
5. **Stop. Touch nothing else.** Do not press Enter again. Do not click.
6. **Copy JSON.** Repeat the whole cycle ~5 times, **Reset each time**, one JSON per run.

**Then read `analyse().u12b`:**

| Field | Meaning |
|---|---|
| **`enterWithIsComposingTrue > 0`** | ✅ **The safe ordering.** The committing Enter arrived with `isComposing === true` → we read it and pass it through. **The gate rule works as written. No window needed.** *(Directly observed — no pairing involved, so this number cannot be mis-attributed.)* |
| **`compositionEndFollowedByEnter > 0`** + **`focusedCapture: true`** | 🔴 The committing Enter arrives with **`isComposing === false`** → **indistinguishable from a send-intent Enter** → the naive gate **swallows the composition.** Doc 05 §1.3's suppression window is **required**, and **its value comes from `gapDistributionMs`.** |
| **`focusedCapture: false`** | 🔴 **No verdict. No window.** A `compositionend` committed by **mouse** cannot be told apart from one committed by a later Enter. **Redo 6a.** |
| **`compositionEndsCommittedOtherwise`** | **The expected majority** — commits via space/number/mouse. 🔴 **This is the number the old analyser ate and turned into a false dangerous verdict.** Its presence is evidence of nothing. |
| **`compositionsObserved: 0`** | **NOT TESTED. Not a pass.** Highest-risk sub-test; untested is untested. |
| **verdict says "NONE COMMITTED WITH ENTER"** | **The case under test was not exercised.** Also not a pass — you committed with space or the mouse. Redo 6a and commit with **Enter**. |

> 🔴 **Do not let me — or anyone — invent that window.** Doc 05 §1.3: *"It is derived from the U12-b
> measurement or it does not exist. Inventing '50 ms' now would be… a number that silently decides
> whether Chinese input works."* **Send `gapDistributionMs` from a focused capture, or send nothing.**

### 6b. The UX check the log cannot make

**Separately from the capture:** with the harness **ARMED**, type a few sentences of Chinese normally.
**Does the IME still work?** Doc 05 §1.3's failure is that the gate **swallows compositions** — that is
visible in one second and no log line states it. *(Your first run reported the UI worked. That is real
evidence and it is not the ordering measurement — report both, separately.)*

---

## Step 7 — U20, free while you're here

ADR 0012 / doc 05 §10: `webRequest` sees the WebSocket **handshake**, never the **frames** — so a
surface that submits prompts over an open socket is **invisible to the observer.** Not believed
likely; observable at zero marginal cost during this spike.

> 🔴 **REWRITTEN 2026-07-17. The first version asked you to correlate WebSocket frames against the
> moment of a send. You declined to close U20 on that, and you were right to** — ChatGPT emitted
> **62-byte frames** that could be anything, and *"they appeared near a send"* is a correlation
> argument wearing evidence's clothes.
>
> **The fix is to stop arguing from timing.** A prompt is **hundreds to thousands of bytes**.
> **62 bytes cannot carry one, at any compression.** So the question is not *"did a socket carry bytes
> near a send"* — it is:
>
> > 🔑 **Which transport shows a body the size of the prompt you just sent?**
>
> **That is a size argument, and it is decisive**, because it does not depend on how tightly two
> clocks line up. The harness now records **`fetch`/XHR body sizes** as well as WS frame sizes.

**Do:**

1. **Reset.** Paste a **long, incompressible prompt** — ~2,000 characters of random-ish text (mash a
   password generator, or paste a chunk of a UUID list). **Length matters more than content.**
2. Send it.
3. Read `analyse().u20`.

| Result | Meaning |
|---|---|
| **`maxHttpBodyBytes` ≈ your prompt's length**, `maxWebSocketFrameBytes` small | ✅ **The prompt is on HTTP.** `webRequest` sees it → **ADR 0012's observer works** → **U20 RESOLVED for this surface.** |
| **`maxWebSocketFrameBytes` ≈ your prompt's length** | 🔴 **U20 IS REAL for this surface.** `webRequest` sees the handshake, **never the frames** → the observer is **structurally blind** here → it needs a MAIN-world `WebSocket.send` patch **in addition** — the one thing ADR 0012 was avoiding. |
| **Neither is large enough** | **INCONCLUSIVE.** Not a pass. The prompt went somewhere; find it. |

> ⚠️ **The irony, stated rather than hidden:** resolving U20 — which exists *because* `webRequest`
> cannot see WS frames — required patching **`fetch` in the MAIN world**, which is exactly what
> **ADR 0012 rejected for the product.** That is not a contradiction: ADR 0012's reasons are
> **(a)** enumeration blind spots and **(b)** it can break the provider's app across a force-installed
> estate. **Neither applies to an instrument on two machines for a week.** But it is precisely the
> thing that gets copy-pasted into a component later, so `main-probe.js`'s header says it twice:
> **nothing in that file ships.**

*(Lengths, methods and URL paths only. **Never bodies.** I1/I3 apply to a spike too.)*

---

## What to send me

**Copy JSON** from each surface (`chatgpt.com`, `claude.ai`) plus your answers to **step 5's visual
check**, which is the only part no log can capture.

**Report as three verdicts, never one:**

```
U12-a: PASS | FAIL | INCONCLUSIVE   ← rework trigger. Include step 5's visual result.
U12-b: PASS | FAIL | NOT TESTED     ← name the IME + platform. "NOT TESTED" is a real answer.
U12-c: inventory + PASS | INCONCLUSIVE  ← inconclusive if step 0 failed.
U20:   resolved per surface | real
```

> **"Inconclusive" and "not tested" are results.** The register has one entry (`U14`) that survived
> seven documents by never being resolvable, and one number (`280M`) that shipped for three commits
> because it looked plausible. **A soft pass here is more expensive than either.**
