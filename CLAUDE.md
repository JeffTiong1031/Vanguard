# CLAUDE.md — Session Briefing

> **Read this first, before touching any deliverable.** This is a briefing for a future session, not
> prose for the founder. Last updated: 2026-07-16, after doc 04 committed (`4026bff`).

---

## 1. What this is

This repo is an **investor-ready design package for a pre-seed prompt-privacy browser extension** — a
Manifest V3 extension that prevents employees leaking sensitive data into third-party LLM chat UIs
(ChatGPT, Claude, et al.) via typing-time detection, a send-time gate, and context-preserving
pseudonymization. It is **documents and a code skeleton, not a running product.** The user is the
**founder**; you are acting as **founding CTO / staff ML architect**.

**The engagement is deliberately adversarial and the founder has repeatedly confirmed he wants it
that way.** Critique before agreement. Numbers, not adjectives. Pick a side on every fork and defend
it. Flag unverified figures rather than inventing them — *"a gap over a fabrication"* is a standing
rule, and the founder has said explicitly he would rather have a hole than a confident invention. Do
not soften findings. The founder has overturned your positions twice (interception layer; the
tokenizer argument) and improved them; **he pushes back well and expects you to push back too.**
Agreeing with him quickly is the failure mode here, not disagreeing.

> **He verifies independently, and he catches things. Assume he will check.** In the doc 03 session he
> **verified the Wikipedia and Microsoft sources himself rather than taking them secondhand**, and
> caught two real defects in the draft: a wrong SSM date (2016 → **11 October 2019**, contradicted by
> the doc's *own cited sources*) and an imprecision that **understated a finding** (the NRIC/SSM
> collision hits **~86%** of 2001–2012 incorporations, not "any" — because the day filter is defeated
> by construction). **Both corrections tightened the doc.** The lesson for a fresh session: **re-read
> your own citations before asserting from them**, and **apply the package's rigor to its own findings,
> not just to its claims** — an overclaimed *finding* is still an overclaim.

---

## 2. Deliverable checklist

> **Session ended 2026-07-16.** ✅ **Working tree clean · everything committed · everything pushed.**
> `origin/main` = local `main` = **`d214656`** *(plus this commit)* at
> `github.com/JeffTiong1031/Vanguard`. **Nothing is mid-write.** A fresh session starts from a
> consistent state — **read §4, then go to §8.**
>
> **This session shipped:** docs **02**, **03**, **04** · ADRs **0008**, **0009** · the rehydration
> kill settled in doc 01 §5 · **six correction passes** (E2 · F3/U13 · the fragmentation argument in
> doc 00 §5 + doc 01 §3 · I2 in doc 01 §5 · doc 03 §2.3's UI resolution) · **U1–U5 and U13 resolved by
> citation** · U17–U19 raised · the **cross-reference audit rule** added to §5.
>
> **The pattern worth knowing before you write anything:** every correction this session made a claim
> **narrower and more true**, and **none of them lost anything real** — the wedge, the posture, and the
> NRIC/SSM collision all survived intact. That is the signature of a package whose **claims were
> slightly ahead of its evidence**, not one whose thesis is wrong. **Expect to find more of these, and
> expect them to tighten rather than break things.**

| # | Deliverable | Status |
|---|---|---|
| 1 | `ASSUMPTIONS.md` | ✅ **done, committed** (`c7f0964`, amended `5206294`) |
| 2 | `docs/00-critique-and-positioning.md` | ✅ **done, committed** (`c7de4e8`, revised `f4bc6e0`) |
| 3 | `docs/01-hld.md` | ✅ **done, committed** (`4a670cd`) |
| 4 | `docs/02-privacy-architecture.md` | ✅ **done, committed** (`295561c`) |
| 5 | `docs/03-ai-ml-architecture.md` | ✅ **done, committed** (`d740a68`) |
| 6 | `docs/04-redaction-and-context-preservation.md` | ✅ **done, committed** (`4026bff`) |
| 7 | `docs/05-lld.md` | ⬜ **not started ← NEXT** |
| 8 | `docs/06-performance-and-scale.md` | ⬜ not started |
| 9 | `docs/07-ml-training-and-data-strategy.md` | ⬜ not started |
| 10 | `code/` scaffold | ⬜ not started |
| 11 | `docs/08-roadmap-and-risks.md` | ⬜ not started — **written LAST** so it inherits real risks |

**ADRs committed so far:** 0001 buyer · 0002 form factor · 0003 wedge-vs-moat · 0004 org dictionary ·
0005 gate in isolated world · 0006 offscreen document · 0007 Python backend · 0008 hybrid split by
workload · 0009 org-dictionary key custody. New ADRs continue from **0010**.

---

## 3. The 8 locked decisions

**Do not re-litigate these.** One line each for orientation only —
**[`ASSUMPTIONS.md`](ASSUMPTIONS.md) is canonical** for the reasoning, confidence, and blast radius.

1. **Buyer = enterprise compliance officer**, not the individual user.
2. **Privacy posture = hybrid, split by workload** — prompt text 100% on-device always; files cloud,
   in-region, zero-retention, under DPA.
3. **Gate = admin-enforced block; advisory for solo.** One engine, two policy modes.
4. **Beachhead = EN/BM/ZH code-switching (Malaysia/SEA).** The *wedge*, not the moat.
5. **Audit log = redacted finding + salted-hash reference.** Raw value never leaves the device.
6. **Deployment = self-install now, managed force-install later.**
7. **Phase 0 = text prompt only; files Phase 1.** *(Amended by ADR 0004 — see §6.)*
8. **No auto-submit, ever.** The user always presses Send.

> ⚠️ **#2 and #8 are ONE decision and cannot be revisited separately.** The gate must decide
> synchronously (`stopImmediatePropagation()` cannot be awaited) while scanning is async. The only
> escape is that the answer is already known at Send time — i.e. the typing-time scan is the gate's
> **cache**. A cloud scan could never decide synchronously → forces stop-and-replay → replay *is* the
> auto-submit #8 forbids. See `docs/01-hld.md` §0.

---

## 4. Required reading before writing anything

**Actually read these files. Do not assume you know their contents.** They contain reversals of
earlier positions, and acting on a remembered version will reintroduce errors already corrected.

1. **`ASSUMPTIONS.md`** — assumptions A1–F4 with confidence + blast radius; the **U1–U19 unverified
   claims register** (**U1–U5 and U13 now resolved**; **E2 and F3 are closed/corrected, not open**);
   §4 deliberate non-assumptions; **§5 correction log — read it, it is where the reversals live.**
2. **`docs/00-critique-and-positioning.md`** — the critique, competitive landscape, buyer argument,
   wedge-vs-moat split, threat model.
3. **`docs/01-hld.md`** — the architecture. §0 (the one architectural idea) and §5 (trust boundary
   invariants I1–I5) are load-bearing for everything downstream. §5 now carries the **rehydration
   kill**.
4. **`docs/02-privacy-architecture.md`** — the posture and its defense. Load-bearing sections: **§1.5**
   (on-device is *architecturally* forced, not privacy-forced — this distinction is easy to lose and
   changes what's fragile), **§2.6** (why "hybrid" as everyone else means it is strictly worse), and
   **§5** (the org-dictionary custody gap — **the weakest privacy claim in the package**).
5. **`docs/03-ai-ml-architecture.md`** — the numbers. **§2.1** (the phantom-checksum kill), **§2.3**
   (the NRIC/SSM collision — and why structure *cannot* fix it), **§3** (the fragmentation correction:
   **the wedge is BM/ZH text NER, not tokenizing identifiers**), **§4.3** (the 86M backbone floor →
   distillation).
6. **`docs/04-redaction-and-context-preservation.md`** — the outbound path. **§2.2** (the vault is
   forward-only and hash-keyed — **there is no de-pseudonymization key**), **§2.3** (…**and it is still
   sensitive** — hashing is not a boundary; the section records the error nearly recurring),
   **§3.2** (the kill makes **surrogates dangerous**), **§5.2** (ambiguity is a **policy** question).
7. **Everything in `docs/adr/`** — all nine. 0003 and 0005 both record **reversed CTO positions**;
   reading a summary instead of the ADR will lose the reversal. **Doc 04 mints none, deliberately** —
   its decisions all follow from decisions already recorded, and an ADR per section devalues the ones
   recording real forks.

**External, outside the repo:** the approved plan lives at
`C:\Users\user\.claude\plans\role-you-are-acting-parsed-engelbart.md`. It contains agreed positions
for **docs not yet written**. The load-bearing ones are transcribed into §6 below because a fresh
session may not read that file — but read it if available.

---

## 5. Engagement rules (verbatim checklist)

- [ ] **One deliverable at a time.**
- [ ] **3-line summary in chat after each, then wait for the founder's go-ahead before proceeding.**
- [ ] **Commit after each approved deliverable, with a commit message naming the deliverable.**
- [ ] **No full doc contents pasted back into chat.**
- [ ] **Every number is either cited or explicitly tagged `(estimate)` or `(unverified)` — no
      confident fabrications.**
- [ ] **Every fork resolves to a stated decision, never "it depends" without a decision rule.**
- [ ] **Flag any decision that's expensive to reverse before writing it into multiple docs.**

**Also standing:**
- 🔴 **Every cross-reference is an assertion, and it gets the same audit as a cited number.**
  Writing *"per doc 01 §5"* is a claim that doc 01 §5 says what you say it says. **Re-read the target
  section — not your memory of it — every single time you cite one.**

  **Why this is the package's actual failure mode, and why it's counterintuitive:** the *"gap over a
  fabrication"* rule is holding — no invented facts have shipped. **But three of the most significant
  findings so far were internal inconsistencies, not external errors:** doc 00 pointing at a doc 01 §5
  that didn't carry the claim · I4's wording satisfied while its purpose was defeated · **doc 01 §3
  refuting doc 00 §5 mid-sentence.** None required research. All required re-reading what we had
  already written.

  **The bias is specific and it is backwards:** we trust our own prior text *more* than an external
  source — when prior text is the thing **most likely to have been revised without every pointer being
  updated.** An external source is at least stable. **Internal references are the ones to distrust.**
- Mermaid for all diagrams. **Render-check every block before committing** (see §9).
- Teach the reasoning on non-obvious calls, in ~2 sentences. The founder is optimizing for learning
  the reasoning, not just receiving artifacts.
- Every significant decision → a short ADR in `docs/adr/` (context / options / decision /
  consequences).

---

## 6. Standing corrections NOT yet reflected in committed docs

**These were agreed in session and exist only in conversation or the external plan file. They will be
silently lost unless carried forward.**

### 6.1 Commit attribution — applies immediately
**Do not add a `Co-Authored-By: Claude` trailer to commits.** The founder asked for sole attribution
to his GitHub account. `git config user.name/user.email` is already `JeffTiong1031
<jefftiong1031@gmail.com>`, so **authorship is correct by default** — just omit the trailer.
**Verified 2026-07-16: all 18 commits on `origin/main` are authored by `JeffTiong1031
<jefftiong1031@gmail.com>`, sole author, no exceptions.**

*Four commits predate this instruction and still carry the trailer in their message body:*
**`c7f0964`, `5206294`, `c7de4e8`, `6364657`.** **Leave them — do not rewrite history.** *(Corrected
2026-07-16: this note previously said the range was `c7f0964`–`c7de4e8`, which is wrong — `6364657` is
later in history than doc 01 and also carries it. The trailer stopped at `ae7d831`, not at `c7de4e8`.
Caught while verifying the push. A claim about our own git history is still a claim.)*

### 6.2 Doc 06 — the L2 backbone is a cost shift, not an architecture swap
Founder flag, accepted. **✅ Doc 03 did the real math (`d740a68`); U4 and U5 are RESOLVED.** The
numbers below are now **cited, not estimated** — do not re-derive them, and do not reintroduce the
estimates.
- **Cited (Microsoft model card):** mDeBERTa-v3-base = **86M backbone + 190M embedding (250K vocab) =
  280M total.** **68% of the model is a lookup table**, not compute. **Multilingual is paid for in
  download size and RAM, not FLOPs** — the budget a browser extension can least afford.
- **Vocabulary trimming works, once:** ~70K tokens → embedding **190M → ~54M (−72%)**, total
  **280M → ~140M (~140 MB int8)**. U5's estimate was good.
- 🔴 **The floor U5 never mentioned, and it's doc 06's problem:** **the 86M backbone is irreducible by
  trimming.** Vocabulary trimming buys **exactly one halving and is then exhausted.** Below ~130 MB the
  only lever is **distillation**. **Trigger: if doc 06's D2 memory budget lands below ~140 MB of
  weights, distillation moves from a risk to a Phase 0 requirement** — and its fallback depends on
  **C3**, the least-confident assumption in the package.
- **Consequence surfaced, not absorbed:** → **doc 08 ranked risk**, not a silent doc 06 line item.
- **Still open for doc 06:** the runtime multiple (§4.4 — weights ≠ RAM; ~1.5–2× is a rule of thumb
  doc 03 refuses to assert), the int8 path (**it degrades BM/ZH accuracy first — the wedge is what
  quantization eats**), and **U15**.
- **No tokens/sec figures until measured or cited.** Doc 03 held this line and produced **none**;
  doc 06 must not break it. Doc 03 §6 does leave a **falsifiable prediction**: trimming should cut
  **memory ~50%, latency barely at all** (embedding is lookup, backbone is compute).

### 6.3 WebGPU — the offscreen-document choice does NOT block it
**Correction recorded 2026-07-16.** An **offscreen document is a Window context, so WebGPU is
available there.** A service worker is a worker context and WebGPU is unavailable *(SW support is
`[unverified]` and has moved across Chrome versions)*.

**Why this needs saying:** ADR 0006 puts the engine in an offscreen document, and a fresh session
could plausibly infer that this trades away GPU acceleration. **It does not — it's the choice that
preserves it.** Do not let doc 06 be written on the assumption that WebGPU is structurally
unavailable to us; it isn't, and a budget derived from that assumption would be pessimistic in a way
that changes conclusions.

**Note the SW/WebGPU question is moot for us regardless.** ADR 0006 rejects the service worker on
**~30s idle termination + reloading 135 MB on most scans** — not on GPU access. That reasoning is
unaffected either way.

**D3's hedge stands, unchanged:** WebGPU is **opportunistic, hardware- and policy-dependent**. Assume
CPU/WASM as the baseline; treat WebGPU as an optimization, **never** a requirement. **U15** (WebGPU
availability under enterprise Chrome policy) remains open and materially affects doc 06's budget —
enterprise policy may disable it on exactly the fleet we're targeting.

### 6.4 Agreed positions for docs not yet written
Approved during planning; transcribed here so they survive.

**Doc 02 — ✅ WRITTEN (`295561c`). All of the above landed. Do not re-derive; read the doc.**

**Doc 05:**
- **Auto-submit verdict: NO.** Unreliable across React/Lexical synthetic event systems; grey-zone
  under provider ToS with the downside landing on *the user's* account, not ours.
- **Post-modal flow (founder asked for this explicitly, state it plainly):** modal resolves → adapter
  writes rewritten text into composer → modal closes, focus returns to composer, caret at end →
  extension mints a **single-use approval token** bound to `hash(rewritten text)`, TTL ~60s,
  invalidated by any edit → **the user presses Send themselves**; gate matches hash to token and does
  **not** stop the event. **Nothing auto-resubmits.** Cost: exactly one extra keypress on a dirty
  prompt, zero on a clean one.
- **Log-only fetch observer is CONFIRMED IN for Phase 0** (founder approved). MAIN-world patch,
  **never aborts**, reconciles outgoing sends against what the DOM gate authorized; unauthorized
  sends land in the audit trail as **bypasses**. Exists because a DOM gate that misses a send path
  (Enter / Ctrl+Enter / Send button / paste-and-send / voice) fails **open, silently** — worst case
  for a compliance buyer, since the control still appears to work.

**Doc 07:**
- **Precision over recall**, explicitly targeted and justified. A blocking tool that cries wolf gets
  uninstalled and then detects nothing — **precision failures are self-amplifying.** Per ADR 0001
  this is a **quasi-contractual commitment**, not an ML preference: every FP is a ticket *the admin*
  eats. Include adversarial-Ignore poisoning defenses.

**Doc 08:**
- **#1 pre-Phase-0 validation item = B3 primary research** (5–10 IT-lead interviews in the target
  segment). **Ranked ABOVE the U6/U12 engineering spikes** — those ask *"can we build it?"*, B3 asks
  *"will anyone deploy it?"*, and the second is cheaper to answer and likelier to be fatal.
- Scope phases to **A1/A2 (2–3 engineers, 18 months)**. **Do not re-derive from a different number** —
  the founder confirmed this is a deliberate constraint, not a compromise: solo would collapse the
  multilingual ML edge into regex-chasing, and more headcount would let the performance budget go soft.

### 6.5 Obligations handed forward by committed docs

#### 🔴 SETTLED KILL — de-pseudonymization does NOT ship in Phase 0
**Decided 2026-07-16 by the founder. This is a closed decision, not an open warning. Do not reopen
it, and do not soften it back to "designed but deferred pending assessment."** Doc 04 still *designs*
the mechanism (it's a Phase 1+ question and the design work is real), but **Phase 0 ships no
rehydration. Full stop.**

**State the reason precisely, because the imprecise version invites a reversal.** The kill is *not*
that rehydration violates invariant **I1** — it doesn't. We send nothing to our server; I1 is intact.
Anyone checking rehydration against I1 will find no violation and conclude it's safe. **That
reasoning is wrong.** The actual defect:

1. The entire pipeline exists to stop `John Tan` reaching **the provider's server**.
2. Rehydration writes `John Tan` **back into the provider's page** (doc 01 §5, boundary B2 → B1).
3. The provider's app has **legitimate, non-malicious** reasons to re-serialize rendered DOM —
   edit-message, rich-text copy handlers, autosave, scroll/engagement analytics.
4. So rehydration can hand the provider's server **exactly the value the whole product spent its
   latency budget keeping away from it** — through a normal product feature, not an attack.

**It doesn't break I1; it defeats I1's purpose, and it falsifies any blanket claim that the user's
sensitive data never reaches the provider.** That claim is load-bearing in the doc 02 compliance
story and in the sales conversation. A control that quietly undoes itself on the return path is worse
than no control, because the audit trail says it worked.

**Related — the provider-client boundary. ✅ RESOLVED: folded into `docs/00` §6 (commit `00c78b6`).**
The provider's page JS can already read the **composer** while the user types, *before* any
redaction. The raw text is in their DOM the whole time; nothing we build changes that. So
pseudonymization protects against the provider's **server**, never their **client**. Doc 00 §6 now
carries this as a "not defended" row plus a subsection stating the boundary precisely.

**The claim-scoping rule this produces is binding on every downstream doc and on the deck:**
> ❌ Never *"the provider never sees it"* — false, and provable in one line of devtools.
> ✅ Always *"it never reaches their servers or their training set"* — true, is what the buyer cares
> about, and is what the DPA and retention terms are written against.

**Why rehydration is still worse than the composer exposure** (and why the kill above stands):
composer text is transient and user-controlled; rehydrated text is **injected by us** into a
persisted, server-synced conversation view.

#### The invariant-letter-vs-purpose trap — now the package's named failure mode
**Twice now, a design satisfied an invariant's wording while defeating its purpose.** Doc 01 §5
(rehydration doesn't violate I1 — it defeats I1's purpose) and doc 02 §5.1 (encryption-at-rest
satisfies I4's *"never sent in the clear"* while we hold the plaintext the moment the admin types it).
**Check the invariant's purpose, not its wording.** Expect a third instance and look for it.

*A related recurring error, also twice: choosing a cryptographic mechanism for how it reads rather
than what it resists — TEEs (doc 02 §4.2) and salted-hash dictionary matching (ADR 0009). Codenames
are memorable words, so a salted hash is brute-forced in milliseconds. It survives a diagram review
and fails a first-year crypto exercise.*

#### Obligations handed forward by doc 02
- **ADR 0009 → doc 05:** verify **U19**. Phase 1 key custody rides the same machine policy as
  `ExtensionInstallForcelist`, so it is **coupled to B3** — if the segment won't deploy machine policy
  we lose the control story *and* the dictionary's key-custody upgrade. Two consequences, one
  assumption.
- **ADR 0009 → Phase 0 code:** **per-tenant DEKs, from day one.** Not an optimization — a global DEK
  makes staged crypto-shredding impossible and forces a flag-day migration. Cheap now, painful later.
- **Doc 02 §2.4 → doc 06 (🔴 specification, not a hint):** engine **slow** vs engine **dead** are
  different failures. Slow fails to friction and self-clears; **dead does not resolve at all in the
  current design.** The obvious patch — a timeout that lets the send through — is a **silent
  fail-open**, i.e. decision #8's spirit and doc 00 §6's worst case. Doc 06 specifies: timeout →
  degrade to **advisory-only** (reusing decision #3's existing mode) → surfaced to user **and** admin
  as *"protection degraded."* **No timeout value has been invented** — doc 06 derives it from the U6
  measurement.
- **Doc 02 §4.5 → doc 07:** DP-SGD's revisit trigger is **the first real prompt in the training set**,
  not a date. Its Phase 0 rejection is structural: DP protects *training-set members*, and a synthetic
  corpus (C3) has none — a rigorous guarantee about nobody.
- **Doc 02 §6.4 → doc 05:** extension **permissions and the auto-update channel** are the security
  questionnaire rows we **cannot** answer "N/A" — they're a remote-code-execution path into every
  managed browser in the estate. Doc 05 owns that answer.

#### Other obligations
- **ADR 0004 → doc 07:** exact-match only in Phase 0. Fuzzy matching reintroduces false positives
  into the one layer whose entire value is its precision.
- **ADR 0004 → doc 02: ✅ DISCHARGED.** The org dictionary's encrypted-distribution design is
  [ADR 0009](docs/adr/0009-org-dictionary-key-custody.md). **I4 is the one invariant posture B cannot
  claim in full** (doc 02 §7) — Phase 0 is a *contractual* control, Phase 1 makes it *mathematical*.

---

## 7. Open items carried forward

### The three week-1 validation spikes
Between them, these decide whether the design survives contact. All three are cheap.

| Item | Claim | Why it's blocking | Owner doc |
|---|---|---|---|
| **B3** 🔴 | Target segment will actually force-install | **#1 priority — ranked above the two engineering spikes.** Asks *"will anyone deploy it?"* Deployment hurdle is low (one HKLM registry key on Windows; no Chrome Enterprise Core needed) but the **sales** hurdle is unmeasured. Requires **phone calls, not code.** | doc 08 |
| **U12** 🔴 | From the **isolated world**, a capture-phase `document` listener preempts React AND `stopImmediatePropagation()` crosses the world boundary | **The gate mechanism itself.** If false, the architecture needs rework, not tuning. Must be proven **empirically, per surface** — not reasoned about. **Has 3 sub-tests — see below.** | doc 05 / code |
| **U6** 🔴 | On-device L2 inference = 30–100 ms on D2 hardware | **The zero-friction path.** If it's ~500 ms the cache is cold too often, the miss path dominates, and the product degrades to *"press Send twice, always."* **Highest-priority number to measure.** Currently an estimate with **no measurement behind it.** | doc 03 / doc 06 |

#### U12 sub-tests — all three must pass, against **real ChatGPT and Claude**, not a test page

**U12-a — Base claim.** An isolated-world capture listener on `document`, registered at
`document_start`, fires before React's root-container delegation, and `stopImmediatePropagation()`
suppresses the page's handler across the world boundary.

**U12-b — IME / composition events (CJK and Malay).** 🔴 **Highest-irony risk in the project.**
When composing Chinese via an IME, **Enter commits the composition — it does not mean "send."** A
naive gate that intercepts every `keydown: Enter` will **break Chinese text input entirely.** Our
differentiator is EN/BM/ZH support; the naive gate implementation breaks exactly the languages we
differentiate on, for exactly the users we're selling to. Test:
- `event.isComposing` and `keyCode === 229` behaviour during active composition, per surface.
- Whether the gate correctly **passes through** composition-commit Enters and **only** intercepts
  send-intent Enters.
- Malay: Latin-script, so IME is unlikely to be the issue — but check platform predictive-text /
  autocorrect interactions. **Honest asymmetry: CJK is where the real risk lives; Malay is a
  lower-probability check, don't spend equal time on it.**

**U12-c — Capture listener at `window` above `document`.** Does either target site register a
capture-phase listener on **`window`**? `window` is *above* `document` in the propagation path, so a
page listener there fires **before ours** — and if it calls `stopPropagation()`, **our gate never
fires and is silently bypassed.** This is a fail-open bypass, the worst failure mode for a compliance
buyer (doc 00 §6). Test:
- Enumerate existing capture listeners at `window` on each surface.
- If present, determine whether registering our own at `window` at `document_start` wins — at the same
  node and phase, **first-registered wins**, so `document_start` timing is the lever.
- This is precisely the class of silent miss the **log-only fetch observer** exists to detect (§6.4).

### Other unverified claims blocking downstream docs
Full register is `ASSUMPTIONS.md` §3 (**U1–U19**). Blocking ones by doc:

- **doc 06:** ~~U4/U5~~ ✅ resolved by doc 03 — see §6.2. **U15** remains.
- **doc 06:** U15 (WebGPU availability under enterprise Chrome policy) — materially affects the budget.
- **doc 05:** U10 (MV3 SW ~30s idle termination), U11 (**`declarativeNetRequest` cannot inspect
  request bodies** — if true this is *dispositive*: the fetch observer **must** be a MAIN-world patch,
  since dNR structurally cannot see prompt content), U16 (macOS `.mobileconfig` signing specifics;
  Windows HKLM path is High confidence and unaffected).
- **doc 07:** U14 (no usable public EN/BM/ZH code-switched PII corpus) — flagged as *an assumption
  masquerading as a fact*; treat with suspicion.
- **doc 00:** U8/U9 (Chrome Enterprise Premium native DLP; Microsoft Purview endpoint DLP) — these
  underpin the "Layer 4 is the real competitor" argument. Still `[verify]`.

**New, raised by doc 02** (full text in `ASSUMPTIONS.md` §3):
- **U17** — `ap-southeast-5` per-service availability (ECS/Fargate, S3, KMS, RDS). **Check before doc
  08 sizes Phase 1**; the residency decision assumes the stack runs there.
- **U18** — PDPA **DPO appointment threshold**. The obligation is confirmed and **its date has already
  passed (2025-06-01)**, binding processors too. We may already be non-compliant. Doc 08 cost line.
- **U19** — `chrome.storage.managed` as the tenant-key channel. **ADR 0009's entire Phase 1 key-custody
  upgrade rests on it** — it's what turns I4 from a contractual control into a mathematical one.

**Resolved by doc 03 (`d740a68`) — do not re-open, do not re-derive:**
- **U1 ✅** no NRIC checksum → validation is structural. 🔴 **And a kill: a hobbyist repo claims ISO
  7064 Mod 11,2 from trial-and-error fitting. DO NOT IMPLEMENT.** A phantom checksum **silently
  rejects valid ICs** — recall collapse, invisible, in the layer whose value is determinism.
  **§2.3's NRIC/SSM collision is the pressure that will make someone reach for it.**
- **U2 ✅** `YYMMDD-PB-###G`; **exactly 14 of 100 PB codes unassigned** (`00`,`17`–`20`,`69`,`70`,
  `73`,`80`,`81`,`94`–`97`). ⚠️ **gender digit rule still unverified — do not gate on it.**
- **U3 ✅ individually:** LHDN TIN verified (`IG`; legacy `SG`/`OG` must still match — pre-2023 docs
  are what people paste) · SSM 12-digit verified · passport medium · **old-format IC unverified, not
  shipping** · **EPF/KWSP = 8 bare digits, not L1-detectable — keep it off any coverage slide.**
- **U4 ✅ / U5 ✅** — see §6.2. **The 86M backbone floor is the finding.**
- 🟠 **New, carried by doc 03 §2.3:** ~86% of **SSM numbers** for entities incorporated **2001–2012**
  parse as valid NRICs. The NRIC day field lands on SSM's **entity-type code (01–06)**, so **the day
  filter rejects nothing by construction.** Fix is context tokens + an **ambiguous finding class** —
  a 12-digit Malaysian number is not always decidable from the digits alone.

**Resolved so far:**
- **SentinelOne acquired Prompt Security, closed 2025-09-05** (founder research). Acquirer type is now
  known — an **endpoint-security incumbent, not a hyperscaler** — and the 18–24 month head-start
  estimate is the **optimistic end** after this close, not the midpoint.
- **U13 ✅ TRUE** — AWS `ap-southeast-5` (Malaysia) **GA since 2024-08-22**. **This corrected F3**:
  Phase 1 files land **in-country for MY tenants from day one**; residency is a per-tenant config, not
  a later upgrade. Deletes a Transfer Impact Assessment from every Malaysian deal.
- **PDPA moved and the docs hadn't caught up** (doc 02 §6.1). Act A1554 phased in across 2025:
  processors **directly liable** under the Security Principle since **2025-04-01** (RM1m and/or 3
  years); DPO + breach notification since **2025-06-01**; **s129 cross-border whitelist repealed**.
  **Net: strengthens the dissolution argument** — criminal exposure in the buyer's own jurisdiction
  beats any attestation — **but creates obligations already overdue.**

---

## 8. Immediate next action

**Write `docs/05-lld.md`.**

**Doc 05 is where the two week-1 spikes live, and it is the doc most likely to be wrong in ways that
only a browser can reveal.** Docs 00–04 can be argued. **This one gets falsified by Chrome.**

**Scope:**
1. 🔴 **U12 — the gate mechanism, all three sub-tests (§7).** This is the architecture's single point
   of failure. **U12-a** base claim · **U12-b** IME/composition — **CJK Enter commits a composition, it
   does not mean "send"**; a naive gate **breaks Chinese input entirely**, i.e. breaks the languages we
   differentiate on, for the users we're selling to · **U12-c** a page capture listener on `window`
   fires **above** `document` and would **silently bypass** us. **Must be proven empirically, per
   surface, against real ChatGPT and Claude — not reasoned about.**
2. **The site adapter layer.** Per-surface selectors, the self-test, and D4's churn assumption. **Every
   send path must be covered — Enter, Ctrl/Cmd+Enter, Send button, paste-and-send, voice.** A miss
   **fails open, silently** (doc 00 §6's worst case), which is why (3) exists.
3. **The log-only fetch observer — CONFIRMED IN for Phase 0.** MAIN-world patch, **never aborts**,
   reconciles outgoing sends against what the gate authorized. Unauthorized sends land in the audit
   trail as **bypasses**. **U11 is dispositive here**: if `declarativeNetRequest` cannot inspect
   request bodies, the observer **must** be a MAIN-world patch.
4. **Offscreen lifecycle (ADR 0006).** Chrome may reclaim it; the SW must recreate it. 🔴 **Doc 04 §8
   raises a correctness bug, not a perf one: if a live conversation's vault dies mid-thread,
   placeholder numbering restarts and `PERSON_1` means two different people in one thread.**
5. **The approval token** (doc 04 §6) — TTL (~60 s is an estimate), single-use, hash-bound, isolated
   world. **Deterministic rewrite is load-bearing**: the token binds to `hash(rewritten)`, so identical
   input must always produce identical output or the token never matches.
6. **U10** (SW ~30 s idle) · **U16** (macOS `.mobileconfig` signing — **Windows HKLM is High confidence
   and unaffected; this gap only touches the secondary platform**) · **U19** (`chrome.storage.managed`
   as ADR 0009's Phase 1 key channel).
7. **Doc 02 §6.4's un-N/A-able row:** our `host_permissions` and auto-update channel are **a remote
   code execution path into every managed browser in the estate.** A good reviewer says so. **Doc 05
   owns that answer** — it is the one security question the architecture cannot make inapplicable.
8. **Must honour:** ADR 0005 (gate in the isolated world — and `composedPath()`, not `event.target`,
   because shadow DOM retargets) · decision #8 · I2/I5.

**Then:** 3-line summary in chat → wait for go-ahead → commit (no `Co-Authored-By`).

## 9. Verification tooling (works, use it)

Mermaid render-checking is set up and has already caught a real break:

```bash
# extract blocks from a doc, then render each; exit 0 = parses
npx --yes @mermaid-js/mermaid-cli -i block.mmd -o block.svg
```

**Gotcha already hit:** a **semicolon inside a Mermaid `Note` is a statement separator** and silently
breaks the parse. It killed the most important diagram in doc 01 (the send-gate sequence) and was only
caught because the block was actually rendered rather than eyeballed. **Lint for `;` in Mermaid
blocks; render every block before committing.** `node` v24 and `@mermaid-js/mermaid-cli` v11 are
available via `npx`.

**Also worth running before every commit** (all three have caught real defects this package):
- **Markdown table column consistency** — a ragged row renders as garbage and is invisible in review.
- **Relative link resolution** — doc 00 §6 once pointed at a doc 01 §5 that didn't carry the claim.
  **A link that resolves is not a link that's correct** — check the target says what you cite it for.
- **Recompute every number in the doc independently** before committing. Doc 03's parameter and
  probability arithmetic was re-derived from scratch and matched; that check is cheap and it is exactly
  what an ML advisor will do first.
