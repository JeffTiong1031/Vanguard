# Trying the sensitivity classifier

**Rewritten 2026-07-20.** No Python server. No DevTools commands. If you followed the previous
version of this page, everything it told you to do is obsolete — see §6.

---

## 1. What it changes

Today the extension masks every name and company the detector finds. The classifier decides whether
each one is **actually sensitive**.

| prompt | without | with the classifier |
|---|---|---|
| `Explain Einstein's theory` | 🔴 blocked | **not blocked** |
| `Summarise Apple's quarterly earnings` | 🔴 blocked | **not blocked** |
| `李白的诗歌流传千古。` | 🔴 blocked | **not blocked** |
| `Einstein from accounting hasn't sent the invoice` | blocked | blocked |
| `Tolong ingatkan Encik Rahman pasal mesyuarat` | blocked | blocked |

**Everything runs on your own machine.** The model is downloaded once and cached; nothing you type
is ever sent anywhere.

## 2. Setup

1. **Load the extension.** `chrome://extensions` → **Developer mode** on → **Load unpacked** →
   `code/extension/dist/chrome-mv3`.
2. **Open the options page.** **Details** on the extension card → **Extension options**.
3. Under **Sensitivity classifier**, put this in the Model box and press **Save**:
   ```
   tehjiajie/vanguard-sens-v0.2.0-trim70k
   ```
4. Go to ChatGPT or Claude and send `Explain Einstein's theory`.

**First use downloads ~535 MB.** The options page shows **Loading model…**, then **Ready**. After
that it is cached and starts fast.

## 3. Reading the status line

The options page always says what the engine is doing. **Check it before reporting anything** — the
reason it exists is that a broken classifier and an absent one used to look identical, and a full
session was lost to exactly that.

| Status | Meaning |
|---|---|
| **Off — no model configured** | Step 3 was not saved. |
| **Loading model…** | First download in progress. |
| **Ready — 3 spans in 210 ms, 2 released, 1 masked** | Working. `released` = judged harmless and left alone. |
| **Failed — \<reason\>** | Something broke, and the reason is the real error. **Copy it into your report.** The extension keeps masking everything, so you are not exposed — it is over-cautious, not off. |
| **Skipped — prompt too long** | Expected. See §4. |
| **Skipped — files are not sensitivity-filtered** | Expected and deliberate (ADR 0018). |
| **Skipped — nothing to judge** | No names or companies in the prompt. |

## 4. 🔴 Known limit — read this before reporting a bug

**Prompts longer than roughly 400 characters skip the classifier entirely and stay fully masked.**

That is deliberate. Measured 2026-07-19, single-thread WASM, **per span**:

| tokens | per span |
|---|---|
| 21 | 174 ms |
| 44 | 342 ms |
| 242 | **2,000 ms** |
| 512 | **4,758 ms** |

A pasted paragraph is longer *and* carries more names: 242 tokens × 5 spans is **ten seconds**
before you could press Send. So above ~96 tokens the classifier is skipped and today's behaviour
stands.

**You will see long pastes masking Einstein and Apple. That is the cutoff, not a failure**, and the
direction is the safe one — over-masking, never leaking.

Chinese hits the cutoff sooner for the same visual length (U21-a measured **2.78×** the tokens per
character), and the check uses the Chinese ratio whenever it sees CJK, so a Chinese paste cannot
slip through at three times the intended budget.

⚠️ **This is also the honest weak spot.** Pasting is the most common way real data leaks, so the
feature is currently weakest exactly where it matters most. **96 is `(estimate)`** — measured on a
machine that is not a typical corporate laptop, and `ASSUMPTIONS.md` rates that device assumption
Medium confidence with HIGH blast radius. Finding the right value is part of what this test is for.
**If the classifier feels fast on your machine, say so.**

## 5. What to report

- **Anything masked that obviously should not be** (a public figure, a well-known company) — with
  the prompt and the status line.
- **Anything NOT masked that should have been** — most valuable of all.
- **How long you waited** between pressing Send and seeing the dialog.
- **Any `Failed — …` status**, verbatim.

Use **Ignore with reason** when it blocks something it shouldn't. That ranks which detector we fix
first — it does not label your data, and nothing you type is uploaded.

## 6. If you followed the previous version of this page

- **Stop the `python -m http.server 8765` process.** No longer used; the permission for it has been
  removed from the extension.
- **The `chrome.storage.local.set({ vg_sensitivity_model_url: … })` command is dead.** The key was
  renamed deliberately, so an old value is ignored rather than silently reused as a repo id.
- **`build_web_bundle.py` is not needed** to try the classifier. The bundle is published.

Why: the model now loads from a public, hash-pinned repo
([ADR 0029](../adr/0029-sensitivity-weights-public-hub-hash-pinned.md)), and the configuration moved
out of the offscreen document — which turned out never to have had access to it at all
([ADR 0030](../adr/0030-offscreen-config-through-messages.md)).

## 7. What this is still not

- **Not validated on real traffic.** Every accuracy figure comes from a `human_simulated` exam.
  ADR 0015's real-substrate requirement is undischarged.
- **Not measured on the detector we ship.** The published integrated recall (0.928) was measured
  against a *different* NER — fp32, and never trained on Malay. The extension runs an int8 one.
  **That composed measurement is owed before any of these numbers are quoted outside the team.**
- **Not the un-mask UX.** Above the cutoff nothing changes, so the "blocked, then released a moment
  later" behaviour never appears. Still an open product question.
- **Not a size we can ship broadly.** 535 MB is fine for this test. Reaching everyone needs
  distillation — int8 is blocked and vocabulary trimming is spent (ADR 0029 §4).
