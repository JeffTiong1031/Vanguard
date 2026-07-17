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

**Do:** Windows Settings → add **Chinese (Simplified, China)** → Microsoft Pinyin. In the composer,
type `nihao`, press **Enter to commit the candidate** (not to send). Do this ~10 times, mixed with
real sends.

Then read `analyse().u12b`:

| `orderings[].order` | Meaning |
|---|---|
| **`keydown_then_compositionend`** | ✅ The committing `Enter` arrives with `isComposing === true` → we read it and pass it through. **The gate rule as written works.** |
| **`compositionend_then_keydown`** | 🔴 The committing `Enter` arrives with **`isComposing === false`** → **indistinguishable from a send-intent Enter** → the naive gate **swallows the user's composition.** Doc 05 §1.3's post-`compositionend` suppression window becomes **required**, and **its value comes from `gapDistributionMs` in this log.** |

> 🔴 **Do not let me — or anyone — invent that window.** Doc 05 §1.3: *"No window value appears here.
> It is derived from the U12-b measurement or it does not exist. Inventing '50 ms' now would be
> exactly the fabrication `ASSUMPTIONS.md` §3 exists to prevent, and it would be a number that
> silently decides whether Chinese input works."* **Send me `gapDistributionMs`.**

**If `compositionCommitsObserved: 0` → the sub-test did not run. That is NOT a pass.** It is the
highest-risk of the three and an untested result is untested.

---

## Step 7 — U20, free while you're here

ADR 0012 / doc 05 §10: `webRequest` sees the WebSocket **handshake**, never the **frames** — so a
surface that submits prompts over an open socket is **invisible to the observer.** Not believed
likely; observable at zero marginal cost during this spike.

Read the log for `kind: "main:websocket-send"` **at the moment you send a prompt**.

- **None** → ✅ the surface POSTs. ADR 0012's observer sees it. **U20 resolved for that surface.**
- **Frames sent as you press Enter** → 🔴 **U20 is real for that surface** and it needs a MAIN-world
  `WebSocket.send` patch *in addition* — the one thing ADR 0012 was trying to avoid.

*(Lengths and types only. Never payloads — I1/I3 apply to a spike too.)*

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
