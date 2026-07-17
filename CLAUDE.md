# CLAUDE.md — Session Briefing

> **Read this first, before touching any deliverable.** This is a briefing for a future session, not
> prose for the founder. Last updated: 2026-07-17, after **doc 07** committed.

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

> **Session ended 2026-07-17.** ✅ **Working tree clean · everything committed · everything pushed.**
> `origin/main` = local `main` at `github.com/JeffTiong1031/Vanguard`. **Nothing is mid-write.** A fresh
> session starts consistent — **read §4, then go to §8.**
>
> **This session shipped:** docs **05** and **06** · ADRs **0010**–**0014** · **U10/U11/U19 resolved by
> citation** · **`max_position_embeddings` = 512 resolved** · **U6 re-specified → U6-a/U6-b** ·
> **U20/U21/U22 raised** · **four correction passes** (the rehydrate column in doc 00 §3 + ADR 0002 ·
> doc 01 §2/§5/§6 + doc 04 §8 + ADR 0009 · **doc 03 §4.1's fabricated total** · ADR 0012's reasoning +
> doc 05 §4.4's misattributed cost).
>
> 🔴 **The pattern sharpened, and a fresh session should know how it changed.** The prior session's
> lesson was that **internal references drift** — corrections land in one place and not another. **That
> still holds and produced four more finds this session** (doc 00 §3's rehydrate column · doc 01 §2's
> vault node still reading `PERSON_1 → John Tan` after §5's I2 row was fixed · §2's storage node
> contradicting §6 · the vault's 🔑 emoji). **But the biggest find was a different animal:**
>
> > **U11's claim was TRUE and the inference recorded beside it was a non-sequitur — and it had been
> > driving the architecture for three docs.** Nobody audited it **because the ✅ on the claim looked
> > like closure.** **A register entry is a cross-reference like any other, and when one carries a
> > *"therefore,"* the therefore is the part to audit.** The same shape appeared twice more: **doc 01
> > §6 reached the right storage decision via a reason that could not have distinguished the options**,
> > and **doc 04 §8 asked for determinism when the property it needed was idempotency.**
>
> **So the failure mode has a second form: not a stale pointer, but sound reasoning wrapped around a
> true fact, never re-examined because the fact checked out.** Look for **"therefore," "dispositive,"
> "must," and "so"** in our own prior text. **The nouns are usually right. The connectives are where
> the errors live.**
>
> **The ledger, because a count is a number and numbers get checked here.** *(Rewritten 2026-07-17.
> This read **"Three for three: conclusion right, connective wrong"** — a slogan whose arithmetic does
> not resolve: it named **two** instances after the words *"twice more,"* and the ledger it was
> summarizing has **five**, one of which contradicts it. **A tidy phrase about unaudited reasoning,
> with an unaudited number in it.** The founder asked for it to be recorded; recording it required
> checking it, and it did not survive the check. **It is a better entry as a list than as a slogan** —
> a list gets appended to, a slogan gets repeated.)*
>
> | # | Where | The fact | The connective bolted to it | Did the conclusion survive? |
> |---|---|---|---|---|
> | 1 | **U11** | ✅ TRUE — `declarativeNetRequest` cannot inspect bodies | *"**Dispositive**: therefore the observer **must** be a MAIN-world patch"* — **non-sequitur; it had driven the design for three docs** | ❌ **No.** Inference struck **and** the mechanism reversed (ADR 0012) |
> | 2 | **doc 01 §6** | ✅ The storage split is right | A reason that **could not have distinguished the options** | ✅ Yes — re-justified |
> | 3 | **doc 04 §8** | ✅ The token must bind to the rewrite | Asked for **determinism** when the property it needed was **idempotency** | ✅ Yes — property renamed (doc 05 §6.2) |
> | 4 | **ADR 0012** | ✅ `webRequest` is the right mechanism | *"A second opinion from the same doctor"* — **the founder broke it** | ✅ Yes — re-argued on **enumeration** + **provider-app integrity** |
> | 5 | **doc 03 §6** | ✅ Trimming cuts memory ~50%, latency flat | **True *per token*, silent on *token count*** — trimming moves fertility, and fertility adds chunks (doc 06 §4.4) | ✅ Yes — **scope narrowed**, not reversed |
> | 6 | **§7.3's own through-line** | ✅ The wedge really is where the cost lands | *"**Coherent for a moat** — the hard thing is the defensible thing, and per ADR 0003 the wedge was never claimed as one anyway"* — **asserts the framing, asserts a false general rule, refutes itself, all in one sentence.** The founder built on it and reached *"friction is the price of the moat"* — **decision #4's exact prohibition** | ✅ Yes — **lead with it** (founder, 2026-07-17); **framing reversed to *"the wedge is where we spend, the moat is where we don't"*** |
> | 7 | **Precision over recall** (doc 07 §1.2) | ✅ TRUE, and quasi-contractual per ADR 0001 | *"because a blocking tool that cries wolf **gets uninstalled** and then detects nothing"* — 🔴 **depends on the user being ABLE to uninstall. B3 is force-install, whose whole purpose is that they cannot.** **The justification is anti-correlated with our own success** — it dies at the moment the enterprise story becomes real | ✅ Yes — **re-justified on ADR 0001's ticket economics + channel defection (doc 00 §1.4 = ADR 0014's argument).** Both **strengthen** under force-install. ***"Over-blocking is fail-closed, delivered gradually"*** |
> | 8 | **doc 06 §4.4** (doc 07 §3) | ✅ Fertility is one measurement settling three budgets — doc 06's best finding | *"therefore **blocked on the corpus (U14/C2 → C3)**"* — 🔴 **a false dependency. U14 is a *PII* corpus; fertility is unsupervised and needs only raw text.** **Doc 03 sized the blocker for the *vocabulary pick*, correctly; doc 06 copied it onto *latency*, which needs less** | ✅ Yes — **conclusion survives, blocker dies.** **U21-a is free, now, and one-sided.** The package's highest-value measurement had a lower bound nobody took |
> | 9 | **doc 04 §8** (doc 07 §1.4) | ✅ Recall matters, and mention-level recall is the unit | *"a missed entity **breaks coreference for the entities we did catch**"* — **inter-entity, and the case could not be constructed.** True form is **intra-entity**: a miss on a *mention* of A splits A | ✅ Yes — **but it deflates rather than escalates.** The damage is **ADR 0011's *split*, already ruled the benign failure.** **The asymmetry is *less* complicated than the brief said** |
> | 10 🔴 | **The U12-b analyser** (2026-07-17, founder) | ✅ The `compositionend`/`keydown` **ordering** really is the whole of U12-b — doc 05 §1.3 was right | *"`compositionend_then_keydown` **therefore** `isComposing` is insufficient and a suppression window is REQUIRED"* — 🔴 **built on a PROXIMITY search ("nearest Enter anywhere in the log"), on a false premise: most compositions never commit with Enter at all.** It paired commits with **send** Enters **3.6–40.8 s away** | ✅ **Conclusion (the ordering is the test) survives. The instrument did not.** **Founder broke it on the MAGNITUDES, not the logic** — 40 s is not one key press. **Fixed causally** (next-key-event adjacency + a *focused* capture), **not by bounding the search** |
> | 11 🔴 | **The U12-b/U20 instruments** (2026-07-17, founder) | ✅ **U12-b PASSED and U20 RESOLVED** — the safe ordering, and prompts go by HTTP | 🔴 **THREE bugs, and the shape INVERTED from #10.** `NOT TESTED` on a log holding a clean composition (`at:'window'` never written — **the filter and the listener were both right; the field they agree on was never set**) · `key === 'Enter'` **blind to `key:"Process"`**, the IME's own key value, i.e. blind to **the exact event U12-b exists to observe** · U20's verdict fired on **`max(bodyBytes)` = an analytics beacon**, bigger than the prompt on **both** surfaces | ✅ **All three. #10 was a FALSE verdict; these were HONEST verdicts on the WRONG INPUT** — true of the data held, false of the run performed. **The instrument was correct and the measurement was still wrong** |
>
> > **What the ledger actually says — and it is more useful than the slogan was.** **ELEVEN instances.
> > In TEN, the conclusion survived and the reasoning did not.** **In one — U11, the earliest and the
> > most expensive — the conclusion fell with it.** So the honest rule is **not** *"the conclusion is
> > always right"*: that is the comfortable read, it is 10-for-11, and **the exception is the instance
> > that cost the most.** The rule is: **a true fact confers nothing on the sentence attached to it.
> > Audit the therefore on its own evidence** — sometimes the decision survives, sometimes it is
> > U11 and three docs were built on a non-sequitur. **You cannot tell which until you check, and the
> > ✅ on the fact is precisely what stops people checking.**
> >
> > 🔴 **Doc 07 added a refinement worth having: #7 and #8 are not random.** **#7's bad connective
> > dies when B3 *succeeds*; #8's dies because a blocker was *inherited* rather than re-derived.**
> > **Both are connectives that were true when written and were never re-checked against a moved
> > premise.** **So the therefores to audit first are the ones whose premise has changed since** —
> > and in this package the premise that moves most is **the wedge** (doc 03 §3) and **B3**.
> >
> > 🔴 **#10 is the first instance that is CODE, and it changes where to look.** Nine instances lived
> > in prose; **#10 lived in an analyser, and it was going to hand us a product parameter.** **An
> > instrument has connectives too** — every `if` that turns data into a verdict is a *therefore*, and
> > **nobody audits a function the way they audit a sentence.** **The three most dangerous lines in
> > this repo are now the `verdict:` strings**, because they are the only place the package converts
> > a measurement into a claim without a human in between.
> >
> > 🔴 **#11 is the one to internalize, because it is the failure #10's fix DOES NOT CATCH.** #10 said
> > *audit the `verdict:` strings.* **#11's verdict strings were all correct.** `NOT TESTED` was a true
> > statement **about the log the analyser was handed** — and the log had been silently emptied by the
> > recorder. **So: a verdict is a claim about its INPUT, and auditing the therefore does nothing if
> > nobody checks that the input is the experiment you ran.** **The `if` was innocent. The data never
> > arrived.**
> >
> > 🔴 **And the tests were complicit, which is the transferable part.** They pushed straight into the
> > log and **hand-wrote the missing field themselves** (`{ at: 'window', ...e }`) — **feeding the
> > analyser precisely the input the recorder failed to produce.** **A fixture that supplies the field
> > under test is testing the fixture.** The seam has to sit at the **real** boundary — fire the event,
> > read the verdict — or the tests certify the half that was never broken. **Both bugs were in the
> > half the tests did not reach, and BOTH were found by a human reading a raw log.**
> >
> > **And #10 pays back CLAUDE.md §9's rule with interest.** It was caught **because 40.8 s is
> > absurd**; the same bug at **80 ms** would have been **believed**. So: **an instrument's most
> > dangerous output is when it is only slightly wrong** — which means **the fix for a mis-attributing
> > analyser is never "narrow the window."** That converts an implausible number into a plausible one
> > and **buys nothing but silence.** **Fix the attribution, or fix the capture. Never the tolerance.**

> 🔴 **A FOURTH failure mode, found by doc 07, and it does not fit the ledger's shape.** The ledger is
> *true fact + wrong connective*. This one is **a claim whose *form* prevents the register from ever
> resolving it** — nothing is wrong with the reasoning, because no reasoning was reachable.
>
> | Entry | The defect in its shape | Fixed by |
> |---|---|---|
> | **U6** (doc 06 §3) | Specified against the workload **with slack** — measured completion, gate needs a boolean | **Split → U6-a / U6-b** |
> | **C3** (doc 07 §2.3) | **Bundled a near-certainty with a coin flip and rated the bundle Low** — *"PII"* is the identifier framing, and **L1 is written, not trained** | **Split → C3-a / C3-b** |
> | **U21** (doc 07 §3.3) | Bundled a **free** measurement with a **blocked** one | **Split → U21-a / U21-b** |
> | **U14** (doc 07 §3.4) | 🔴 **A universal negative.** *"No corpus **exists**."* **There is no citation for an absence** — a search returns FALSE or *unresolved-forever*. **It can never be marked ✅ and never could have been** | **Re-specified → U14-a**, a timeboxed search with a bar **declared before looking**, whose output is **a decision, not a verdict** |
>
> > **Four for four, and the tell is the same each time: an entry that has sat open for several
> > documents while everything around it resolved.** **That is not diligence failing. It is the entry's
> > shape refusing the register's only method** — *go and read the source*. **When an entry will not
> > close, stop trying to resolve it and ask whether it *can* be. Re-specify, then resolve the halves.**
>
> 🔴 **And then a third form, which is the worst one, because it is the thing the package promised
> never to do.** **Doc 03 §4.1 published `Total | 280M | Model card`.** **86 + 190 = 276** — and **the
> card states no total at all.** Neither the sum nor the citation it claimed. **That is the confident
> fabrication `ASSUMPTIONS.md` exists to prevent, and it shipped for three commits** against an
> **external** source, after four instances of the same defect had been caught against internal ones.
> **It survived because ~279M is within 0.5% of 280M.**
>
> > **The lesson generalizes and it inverts where you look: plausible numbers do not get checked.
> > Implausible ones do.** So **the numbers most likely to be wrong in this package are the ones that
> > look fine.** CLAUDE.md §9 *asserted* this arithmetic had been *"re-derived from scratch and
> > matched."* **The assertion was the only evidence, and it was false. A claimed check is not a
> > check.** Recompute it yourself, in a shell, now.
>
> **The consolation is unchanged and it keeps being earned:** every correction across both sessions
> made a claim **narrower and more true**, and **none lost anything real** — the wedge, the posture,
> the NRIC/SSM collision, the form-factor verdict and the observer's *existence* all survived. **Claims
> slightly ahead of their evidence, not a broken thesis. Expect more, and expect them to tighten.**

| # | Deliverable | Status |
|---|---|---|
| 1 | `ASSUMPTIONS.md` | ✅ **done, committed** (`c7f0964`, amended `5206294`) |
| 2 | `docs/00-critique-and-positioning.md` | ✅ **done, committed** (`c7de4e8`, revised `f4bc6e0`) |
| 3 | `docs/01-hld.md` | ✅ **done, committed** (`4a670cd`) |
| 4 | `docs/02-privacy-architecture.md` | ✅ **done, committed** (`295561c`) |
| 5 | `docs/03-ai-ml-architecture.md` | ✅ **done, committed** (`d740a68`) |
| 6 | `docs/04-redaction-and-context-preservation.md` | ✅ **done, committed** (`4026bff`) |
| 7 | `docs/05-lld.md` | ✅ **done, committed** (`c084f0d`) |
| 8 | `docs/06-performance-and-scale.md` | ✅ **done, committed** (`50037b8`) |
| 9 | `docs/07-ml-training-and-data-strategy.md` | ✅ **done, committed** |
| 10 | `code/` scaffold | ✅ **done, committed.** 🔴 **Two artifacts, deliberately:** `code/spikes/` is **LIVE** (U12 harness · U21-a fertility) · `code/extension/` + `code/backend/` are **STUBS** — doc 01 §2's shape only. **The spike is raw MV3, NOT WXT** (doc 01 §6's own eject rule: U12 *is* the MAIN-world work, and a build step makes a rework-trigger test ambiguous). **Read [`code/README.md`](code/README.md) §Order of operations before building anything.** |
| 11 | `code/` **Slice 1** — chat text, **L1 + L2** | 🔴 **NEXT. Founder decision 2026-07-17, [ADR 0016](docs/adr/0016-mvp-first-sequencing.md).** The smallest extension the founder's **team** can load unpacked from the repo: ChatGPT + Claude · typing **and** paste · Enter **and** mouse Send · **L1 deterministic + L2 on-device model TOGETHER** · block/modal → rewrite → **the user presses Send** · on-device (decision #2) · **no rehydration** (E2). 🔴 **An L1-only build is NOT an acceptable Slice 1 target** (founder, explicit) — **and he is right on the merits, for a sharper reason than "a weak demo": per doc 00 §1.3 L1 is the *highest-value* feature — so an L1-only build would demo WELL — but per doc 00 §5 and doc 03 §3.3 *"a regex catches the IC number in any language; nobody needs a model for that"*. **L1-only demos the part that is not ours.** It would answer a question nobody is asking, convincingly.** **Accepted when the team can clone → load unpacked → use it on both surfaces → verify the whole experience.** |
| 12 | `code/` **Slice 2** — **file-content checking** | ⬜ **After the team accepts Slice 1. B3 does NOT go between the slices** (founder, explicit). **Must inspect file CONTENT — a permanent "uploads forbidden" message is not sufficient.** **Scope is proposed and argued BEFORE implementation**: PDF-only vs more · text PDF vs scanned/OCR · scanning vs blocking · on-device vs cloud under **ADR 0008** · **security limits: malformed PDFs, oversized files, ZIP bombs, timeouts, retention.** ⚠️ **Push back hard on feasibility and timeline — broad PDF/DOCX/image/ZIP support is not a small feature.** |
| 13 | `docs/08-roadmap-and-risks.md` | ⬜ **PARKED — written only after BOTH slices are implemented and tested** ([ADR 0016](docs/adr/0016-mvp-first-sequencing.md)). **It inherits evidence from the real chat and file builds instead of ranking guesses.** ⚠️ **This strengthens the original *"written LAST"* rule rather than replacing it — the risks it ranks now include the ones only a team test and a file pipeline can surface.** |

**ADRs committed so far:** 0001 buyer · 0002 form factor · 0003 wedge-vs-moat · 0004 org dictionary ·
0005 gate in isolated world · 0006 offscreen document · 0007 Python backend · 0008 hybrid split by
workload · 0009 org-dictionary key custody · **0010 gate registers at `window`** (refines 0005) ·
**0011 monotonic placeholder numbering** · **0012 observer uses `webRequest`** (reverses the plan's
mechanism) · **0013 two-stage verdict** (L1 may decide DIRTY alone) · **0014 degrade to advisory, never
fail-closed** · **0015 the eval corpus's text substrate is REAL** (training may stay synthetic — the
decision that puts real personal data in the company) · 🔴 **0016 MVP-first sequencing** (**reverses *"B3 above the engineering spikes"*** — the team test is the next learning loop; B3, force-install, U6-b's threshold, marketing and **doc 08** are **parked** until Slices 1 and 2 land). · **0017 Slice 1's four technical choices** (stock L2 · CDN weights · WXT with committed dist · block+Ignore). New ADRs continue from **0018**.

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
7. **Phase 0 = text prompt only; files Phase 1.** *(Amended by ADR 0004 — see §6.)* ⚠️ **SEQUENCING amended 2026-07-17 by [ADR 0016](docs/adr/0016-mvp-first-sequencing.md) — the decision is INTACT (text first, files second); the GAP SHRANK.** Files are **Slice 2, immediately after the team test**, not *"a later commercial phase"*. **Slice 2 must inspect file CONTENT — a permanent "uploads forbidden" message is not sufficient** (founder, explicit).
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

1. **`ASSUMPTIONS.md`** — assumptions A1–F4 with confidence + blast radius; the **U1–U22 unverified
   claims register** (**U1–U5, U10, U11, U13, U19 resolved**; **U6 re-specified → U6-a/U6-b, not
   resolved**; **E2 and F3 are closed/corrected, not open**); §4 deliberate non-assumptions; **§5
   correction log — read it, it is where the reversals live.** ⚠️ **Read two entries specifically,
   whatever you are working on: U11** (the claim is ✅ and its *inference* is struck) and **U4** (the
   claim is ✅ and the number attached to it was **fabricated**). **Those two are the session's whole
   lesson: a ✅ covers the claim, never the reasoning or the figure bolted to it.**
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
   **§8 now carries a dated note: both its handoffs to doc 05 were narrower than stated.**
7. **`docs/05-lld.md`** — the mechanism, and **the doc Chrome falsifies.** **§1** (U12 as **three**
   sub-tests with three blast radii — **never test or report it as one claim**), **§4.1** (U11's
   inference struck), **§4.3** (**enumeration is where silent misses come from** — the argument that
   moved the observer, **and note its own amendment: the first version of it was overstated and the
   founder broke it**), **§5.3** (conflation vs. splitting), **§6.2** (idempotency, not determinism),
   **§7** (the RCE answer: *"you control when our code changes, not us"*).
8. **`docs/06-performance-and-scale.md`** — the budget. **§1** (**two deadlines, not one number** — the
   reframe everything else hangs on), **§2.3** (**the L1 short-circuit**: the dangerous paste is gated
   sub-ms, **the L2 wait is only paid to say "clean"**), **§2.4** (**monotonic toward dirty** — the rule
   that stops the short-circuit becoming a silent fail-open), **§4.3** (**the wedge's language is the
   slowest**), **§4.4** (**the memory fix taxes the latency budget** — one spike settles three budgets),
   **§7.2** (**fail-closed rejected on doc 00 §1.4's own argument**).
9. **Everything in `docs/adr/`** — **all fourteen.** **0003, 0005 and 0012 record reversed positions**;
   reading a summary instead of the ADR will lose the reversal. **0009 now carries U19's resolution and
   the `setAccessLevel()` finding.** **Doc 04 mints none, deliberately** — its decisions all follow from
   decisions already recorded, and an ADR per section devalues the ones recording real forks. **Doc 05
   mints three and says why each is not that** (0010 revises an accepted ADR · 0011 resolves
   correctness-vs-privacy · 0012 reverses a mechanism on evidence).

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

### 6.2 The model numbers — canonical, and the fertility finding doc 07 inherits
> **Retitled 2026-07-17.** This was *"Doc 06 — the L2 backbone is a cost shift, not an architecture
> swap"*, a founder flag aimed at a doc that had not been written. **Doc 06 is written (`50037b8`) and
> consumed it.** The section stays because it is **the canonical parameter block for the whole
> package** — and because doc 06 handed it back a finding that now binds **doc 07**.

Founder flag, accepted. **✅ Doc 03 did the real math (`d740a68`); U4 and U5 are RESOLVED** — **and its
headline total was wrong until 2026-07-17. Read the correction before quoting any number here.**
- **Cited (model card), and this is ALL the card says:** **86M backbone** · **190M embedding** ·
  **250K vocab.** 🔴 **The card states NO total.** Its verbatim claim is: *"It has 86M backbone
  parameters with a vocabulary containing 250K tokens which introduces 190M parameters in the
  Embedding layer."*
- **Derived (`config.json` — `vocab_size: 251000` × `hidden_size: 768`):** **192.8M embedding + 86M =
  278.8M ≈ ~279M total.** **~69% of the model is a lookup table**, not compute. **Multilingual is paid
  for in download size and RAM, not FLOPs** — the budget a browser extension can least afford.
  > 🔴 **Doc 03 §4.1 asserted `Total | 280M | Model card` and *"the card says 86M + 190M = 280M."*
  > **86 + 190 = 276, and the card states no total.** Neither the sum nor the citation it claimed.
  > **This is the one confident fabrication that shipped** — and it shipped **against an external
  > source**, after four instances of the same defect were caught against our own internal ones.
  > **The total can never be cited. It is ours to derive and ours to own.** Everything load-bearing
  > survived (86M floor · trim table · thesis), and **our 278M estimate was 0.28% off — more accurate
  > than the "citation" that marked it down.** It survived because **~279M is within 0.5% of 280M: the
  > wrong number looked right and the one-second check was never run.**
- 🔑 **`max_position_embeddings` = 512** *(`config.json`, verified 2026-07-17)*. **Doc 06 cannot budget
  the paste path without it** — a long paste chunks to `ceil(tokens/512)` forward passes, so paste
  latency is **not** one forward pass. Doc 03 never recorded this.
- **Vocabulary trimming works, once:** ~70K tokens → embedding **192.8M → ~54M (−72%)**, total
  **~279M → ~140M (~140 MB int8)**. U5's estimate was good.
- 🔴 **The floor U5 never mentioned, and it's doc 06's problem:** **the 86M backbone is irreducible by
  trimming.** Vocabulary trimming buys **exactly one halving and is then exhausted.** Below ~130 MB the
  only lever is **distillation**. **Trigger: if doc 06's D2 memory budget lands below ~140 MB of
  weights, distillation moves from a risk to a Phase 0 requirement** — and its fallback depends on
  **C3**, the least-confident assumption in the package.
- **Consequence surfaced, not absorbed:** → **doc 08 ranked risk**, not a silent doc 06 line item.
  **✅ Doc 06 §6.2 did that, and found the risk has a *second entrance* — see §7.3.**
- ~~**Still open for doc 06:**~~ **✅ CLOSED by doc 06** — the runtime multiple (§6.1: **measure it, do
  not inherit it**; doc 03's refusal to assert ~1.5–2× stands), the int8 path (§6.3), and **U15**
  (§6.4, still open as a *claim* but no longer blocking a doc). **Do not re-derive; read doc 06.**
- **No tokens/sec figures until measured or cited.** Doc 03 held this line and produced **none**, and
  **doc 06 held it too** — the doc whose whole subject is numbers produced no tokens/sec. **Doc 07
  inherits the same line.**

> 🔴 **Doc 03 §6's falsifiable prediction — falsified in scope, not in fact, and this is the entry to
> read before doc 07 touches the tokenizer.** The prediction: trimming cuts **memory ~50%, latency
> barely at all** (embedding is lookup, backbone is compute).
>
> **Doc 06 §4.4's verdict: it is true *per token* and silent on *token count*.** Trimming changes the
> tokenizer. Drop vocabulary rows that BM/ZH text was using and those words fall back to shorter
> sub-word pieces or bytes — **fertility rises, the sequence lengthens, and the backbone runs on more
> tokens.** Per-token latency is flat; **per-*scan* latency is not.** And per doc 06 §4.2, longer
> sequences cross the **512** boundary sooner — **so fertility does not merely lengthen the sequence,
> it adds whole forward passes.**
>
> **The consequence that binds doc 07: fertility is simultaneously the accuracy metric, the latency
> metric, and the chunk-count metric.** Doc 03 §4.2 already named the mechanism *as an accuracy risk*
> and called size *"the easy metric and the wrong one to optimize alone"* — **it was more right than it
> knew.** **One measurement settles three budgets** (**U21** is the same measurement).
>
> > 🔴 **CORRECTED 2026-07-17 by doc 07 §3 — this paragraph ended: *"and it is blocked on the corpus
> > (U14/C2 → C3). C3 now blocks the latency budget, not just accuracy."* **The blocker is a false
> > dependency and the conclusion above is untouched.** **U14 is a *PII* corpus. Token frequency and
> > fertility are UNSUPERVISED — no labels, no PII, only raw EN/BM/ZH text**, which demonstrably exists
> > (doc 03 §3.3 cites **CC100 Malay** as mDeBERTa's own training data without noticing what that
> > proves). **Doc 03 §4.2 blocked the *vocabulary pick*, correctly; doc 06 §4.4 copied it onto
> > *latency*, which needs strictly less.** **→ U21-a (stock vocab · FREE · week 1 · one-sided, a fail
> > is FINAL because trimming only raises fertility) and U21-b (trimmed · genuinely blocked).**
> > **C3-b's blast radius is unchanged — it owns the *accuracy* budget. What moved is the schedule.**
> > **Ledger #8.**
>
> ⚠️ **The trap for doc 07: the memory win and the latency cost are the same lever.** A trim that looks
> free on the memory budget is not free on the paste path, **in the wedge's languages, on the dominant
> threat.** Do not quote the ~50% memory saving without the fertility caveat attached.

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
- ~~**#1 pre-Phase-0 validation item = B3 primary research**~~ 🟠 **PARKED — see the OVERRULED note above ([ADR 0016](docs/adr/0016-mvp-first-sequencing.md)).** Still 5–10 IT-lead interviews in the target segment when it unparks, and **still first among what remains unasked** —
  segment). **Ranked ABOVE the U6/U12 engineering spikes** — those ask *"can we build it?"*, B3 asks
  *"will anyone deploy it?"*, and the second is cheaper to answer and likelier to be fatal.
- Scope phases to **A1/A2 (2–3 engineers, 18 months)**. **Do not re-derive from a different number** —
  the founder confirmed this is a deliberate constraint, not a compromise: solo would collapse the
  multilingual ML edge into regex-chasing, and more headcount would let the performance budget go soft.
- 🔴 **OVERRULED 2026-07-17 — *"B3 ranks above the engineering spikes"* is NO LONGER THE
  SEQUENCE.** [ADR 0016](docs/adr/0016-mvp-first-sequencing.md): **Slice 1 → team test → Slice 2 →
  doc 08**, with **B3 parked** until both slices land. **The argument below was never refuted — it
  was overruled — so do not "restore" it by re-deriving it from doc 00 §3.** The bullet stays
  because **doc 08 still has to rank B3 first among what remains unasked.**
- 🔴 **DOC 08 OPENS WITH THE WEDGE'S COST — founder decision, 2026-07-17.** Three of the top eight
  ranked items are the wedge's own price. **Lead with it; do not bury it in a risk table** — the facts
  are the same either way and **only the ordering decides whether they read as *priced* or as *didn't
  know*.**
  > ✅ **"The wedge is where we spend. The moat is where we don't."** It buys **18–24 months of
  > beachhead, not defensibility.** Vendor neutrality costs **zero engineering** and **widens for
  > free.**
  >
  > ❌ **NOT *"friction is the price of the moat"*** — that reverses **decision #4** and **ADR 0003**,
  > and the asymmetry runs the wrong way (**Microsoft ships the IME in U12-b; Google trained the
  > multilingual models**). **Full argument and the sentence in this file that caused the error: §7.3.**

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

### 7.1 The three week-1 validation spikes
Between them, these decide whether the design survives contact. All three are cheap.

> 🔴 **Updated 2026-07-17 (second pass): U12 IS FULLY RESOLVED — U12-a ✅ (Enter **and** click) · U12-b ✅ ·
> U12-c ✅ — and **U20 ✅** fell out of the same run at zero marginal cost, as doc 05 predicted it would.
> **The rework trigger did not fire. Every engineering spike that could have killed the design has now
> run and held.** 🔴 **What remains is not engineering — but the next action is NOT B3 either.**
> **The founder has parked B3 and chosen a TEAM TEST of a working MVP as the next learning loop** ([ADR 0016](docs/adr/0016-mvp-first-sequencing.md)).
> **Doc 00 §7's *"go make ten phone calls before you write a line of the detection engine"* was overruled, not refuted — see §8.**
>
> ⚠️ **Updated 2026-07-17: it is `U6-b`, not `U6`, and the table below is unchanged only because the
> priority didn't move — the *input* did.** Doc 06 §3 found U6 was specified against **typing**, where
> the user's own keystroke gaps hide the scan. **The critical path is paste.** And **U6-b's threshold
> is B3-blocked**, so the two rows below are no longer independent.

| Item | Claim | Why it's blocking | Owner doc |
|---|---|---|---|
| **B3** 🟠 **PARKED** | Target segment will actually force-install | 🔴 **PARKED 2026-07-17 until Slices 1 and 2 land — founder decision, [ADR 0016](docs/adr/0016-mvp-first-sequencing.md). This row was *"#1 priority, ranked above the two engineering spikes"* and IT IS NO LONGER THE NEXT ACTION.** **The argument that put it first is unchanged and nothing has refuted it** — it asks *"will anyone deploy it?"*, it is cheaper than the slices, and it is likelier to be fatal. **The founder has read it and chosen a team test as the next learning loop instead.** ⚠️ **A fresh session must not "restore" this row's ranking on the strength of the old argument: the argument was never beaten, it was OVERRULED, and re-deriving it will look like diligence while contradicting a live decision. Read ADR 0016.** **Deployment hurdle stays low (one HKLM key); the SALES hurdle stays unmeasured.** | doc 08 |
| ~~**U12**~~ ✅ | **FULLY RESOLVED 2026-07-17 against real ChatGPT + Claude on Windows.** **U12-a ✅ (Enter **and** click) · U12-b ✅ · U12-c ✅ · and U20 ✅ free.** | 🔴 **THE REWORK TRIGGER DID NOT FIRE.** ADR 0005/0010, doc 01 §0's coupling and decisions #2/#8 now rest on a **measurement**. `windowFiresBeforeDocument: true`; armed Enter suppressed across the world boundary; **doc 05 §1.2's visual criterion held** (no spinner, no wedge). **U12-c: 20 page `window`-capture listeners on ChatGPT, 4 on Claude — all registered after ours. ADR 0010 was load-bearing, not theoretical.** ⚠️ **Three narrowings, all real:** **(1)** the **click** PASS is the **founder's observation, not a saved capture** — every attached JSON has `armedStops: 0` (correctly: U20 needs an *unarmed* run). **~30 s to close.** **(2)** U12-b is **one IME, one platform, one date** — evidence about Pinyin, not about IMEs. **(3)** U12-c and U20 are **properties of two websites** and move on the **D4** clock. 🔴 **And the run's real lesson is not in this row: FOUR harness bugs produced three wrong answers, and the founder caught every one by reading raw logs instead of verdicts** (§2 ledgers #10, #11). | ✅ **done** |
| ~~**U12-b**~~ ✅ | **RESOLVED 2026-07-17 — PASS, both surfaces, focused capture.** `keydown(code:"Enter", key:"Process", isComposing:true)` → `compositionend` → `keyup`. **The committing Enter arrives WHILE composing → `isComposing` is SUFFICIENT → NO suppression window.** | ✅ **The wedge's language is not broken by the gate — on Microsoft Pinyin / Windows / these two surfaces / this date.** **Doc 05 §1.3 named the ordering as the whole test and refused to invent the window: the doc was right THREE times while the instrument was wrong three times** (ledgers #10, #11). ⚠️ **SCOPE IS NARROW AND IS THE ONLY THING TO CARRY FORWARD: one IME, not IMEs.** Sogou/Google Pinyin, macOS, JP/KR **untested**. 🔴 **Do not promote *"Pinyin never reports `key:'Enter'` while composing"* into *"a naive gate cannot break Chinese input"* — the fact is real, the therefore is unearned and per-IME.** | ✅ **done** |
| **U6-b** 🔴 | **Time from `paste` to a gate-usable verdict**, P50/P95 paste length, D2 | **The zero-friction path — and the input is paste, not typing.** *(Was "U6 / a few hundred tokens" until doc 06 §3: **typing is not on the critical path**, because keystroke gaps warm the cache for free. **Paste is one event then Enter**, and per doc 00 §6 it is the **dominant** leak case — **so the cache is cold by construction on the threat we exist for.**)* If it's slow the miss path dominates and the product becomes *"press Send twice on every paste."* **Mitigated but not removed by ADR 0013:** L1 gates the *dangerous* paste sub-ms; **U6-b governs the wait to say *"clean."*** ⚠️ **Curve is ours (week 1, no human needed). Threshold is B3-blocked** — it is the measured `Ctrl+V` → `Enter` interval. **No number invented.** | doc 06 / code |

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

### 7.2 Other unverified claims blocking downstream docs
Full register is `ASSUMPTIONS.md` §3 (**U1–U22**). Blocking ones by doc:

- **doc 06:** ~~U4/U5~~ ✅ (doc 03, §6.2) · ~~U6~~ **re-specified → U6-a / U6-b** (doc 06 §3) ·
  **`max_position_embeddings` = 512** ✅ cited. **U15 remains** (WebGPU under enterprise Chrome policy —
  **the pessimistic case is the likely one**, on the same machine-policy channel as B3). **New: U21**
  (tokens-per-char BM/ZH — sets chunk count in the wedge's language) · **U22** (COOP/COEP →
  `SharedArrayBuffer` → ORT threads — **ours, not the fleet's**, unlike WebGPU).
  > 🟢 **Updated 2026-07-17: Slice 1 produces U6-b's CURVE for free, and only its THRESHOLD is parked** ([ADR 0016](docs/adr/0016-mvp-first-sequencing.md)). **Doc 06 §3.3, verbatim: *"The curve is ours. The threshold on it is the design partner's."*** A working extension on the team's machines measures **paste → verdict** on real hardware — a machine measurement, no human needed. **So the #1 engineering number advances during Slice 1; it just cannot be marked PASS or FAIL until B3 supplies the deadline.**
  >
  > 🔴 **And do NOT expect the team test to supply the threshold as a side effect — doc 06 §3.3 rules it out by name.** Its step 2 says measure the `Ctrl+V`→`Enter` interval *"with the **first design partner**, on real work, for a week. **Not on us — we know the tool is watching, which is exactly the bias**."* **The founder's team IS "us".** They know what the extension is, they know it is being evaluated, and their paste-to-Send timing is therefore **the biased sample the doc already rejected**. **The team test gives the curve and cannot give the threshold. Reporting a threshold from it would be the package's own §9 error: a plausible number nobody checks.**
  >
  > 🔴 **U6-b's pass criterion is B3-blocked** —
  > the deadline is the user's measured `Ctrl+V` → `Enter` interval, which needs a design partner on
  > real work. **The #1 engineering number is coupled to the #1 validation item.** B3 was already
  > ranked first; **it is now first for two independent reasons.**
- **doc 05:** ~~U10~~ ✅ · ~~U11~~ ✅ · ~~U19~~ ✅ — **all three resolved by citation** (`c084f0d`).
  **U16 remains, deliberately:** macOS `.mobileconfig` signing. **Windows HKLM is High confidence and
  unaffected**, and B2 puts the beachhead on Windows — U16 touches **the secondary platform only** and
  resolves when a design partner has Macs. Doc 05 §8.1 states it as a **scoped gap**, not an unranked
  risk.
  > 🔴 **U11's lesson outlived U11 and is the one to carry forward.** The **claim** was true; the
  > **inference** recorded beside it — *"dispositive: the observer **must** be a MAIN-world patch"* —
  > was a **non-sequitur that had been driving the design for three docs.** §5 says re-read the target
  > rather than your memory of it. **U11 shows the target can be our own register, and that a verdict
  > can be right while the "therefore" bolted onto it is wrong.** **When a register entry carries a
  > *therefore*, audit the therefore** — nobody had, because the ✅ on the claim looked like closure.
- **doc 07:** U14 (no usable public EN/BM/ZH code-switched PII corpus) — flagged as *an assumption
  masquerading as a fact*; treat with suspicion.
- **doc 00:** U8/U9 (Chrome Enterprise Premium native DLP; Microsoft Purview endpoint DLP) — these
  underpin the "Layer 4 is the real competitor" argument. Still `[verify]`.

**New, raised by doc 02** (full text in `ASSUMPTIONS.md` §3):
- **U17** — `ap-southeast-5` per-service availability (ECS/Fargate, S3, KMS, RDS). **Check before doc
  08 sizes Phase 1**; the residency decision assumes the stack runs there.
- **U18** — PDPA **DPO appointment threshold**. The obligation is confirmed and **its date has already
  passed (2025-06-01)**, binding processors too. We may already be non-compliant. Doc 08 cost line.
- ~~**U19**~~ ✅ **RESOLVED by doc 05 §8.2** — mechanism confirmed (read-only, policy-populated). **The
  size worry was never proportionate to a 32-byte key** (`sync`'s 8 KB per-item floor clears it
  **~256×**). 🔴 **The finding was elsewhere: `storage.managed` is exposed to content scripts by
  default, so ADR 0009's tenant key lands in B2, not B3, unless we call `setAccessLevel()`.** Third
  instance of the letter-vs-purpose trap — **and it surfaced from reading an API default, not from
  auditing an invariant. Defaults are where this trap lives, because a default is a decision nobody
  remembers making.** ADR 0009 carries a dated note.

**New, raised by doc 05:**
- **U20** — that each surface submits prompts as an **HTTP request, not a WebSocket frame.**
  `webRequest` sees the WS **handshake**, never the frames, so a surface that moved submission onto an
  open socket is **invisible to the observer** (ADR 0012). Not believed likely; **observable during the
  U12 spike at zero marginal cost.**

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

### 7.3 The doc 08 queue — what committed docs have already handed it

> 🔴 **PARKED 2026-07-17 — doc 08 is written only AFTER both MVP slices are implemented and
> tested** ([ADR 0016](docs/adr/0016-mvp-first-sequencing.md)). **This STRENGTHENS the *written LAST*
> rule rather than replacing it:** the queue below currently ranks **B3, U6-b's threshold and the
> distillation entrances as GUESSES**, and Slice 1 + Slice 2 turn several of them into
> measurements. 🔴 **But note what the parking does to rank 1: B3 is deferred, so doc 08 will be
> written with its #1 validation item still UNASKED.** **That is the bet ADR 0016 records — doc 08
> must state it as the top risk, not rank it away.** ⚠️ **Ranks 1, 3, 3a and 4a are all
> design-partner-dependent and therefore all parked together; the queue's shape changes when they
> unpark, so re-rank against ADR 0016 rather than against this table's current order.**
>
> **Added 2026-07-17.** Doc 08 is **written LAST so it inherits real risks** (§2), which means its
> input accumulates for six documents and **lives nowhere until it is needed.** That is exactly the
> condition under which things get lost. **This is the index, not the content.**
>
> 🔴 **Every row below is a cross-reference, so §5's rule applies to this table itself: re-read the
> source section before ranking from it.** The **Source** column exists so a fresh session can audit
> each line against its origin rather than trusting this transcription.
>
> ⚠️ **And the rule bit this table on its first pass, which is the argument for the column.** Six of
> the Source cells were **wrong when written** — doc 05's handoff block cited as **§9** when §9 is
> *Invariant conformance* and the block is **§10** (×3) · doc 04's cited as **§9** when it is **§8** ·
> B3's argument cited to **doc 00 §1.4**, which is *the desktop-app hole* — a real section, load-
> bearing for **ADR 0014**, and **nothing to do with B3**; the argument is **doc 00 §3**. **Every one
> was off by a plausible amount, in the right document, in a direction nobody would question.** Caught
> by listing the target docs' headings — **two commands.** *(Fixed 2026-07-17, before commit.)* **Six docs carry explicit
> `To doc 08` blocks** — `docs/02` §8 · `docs/03` §7 · `docs/04` §8 · `docs/05` §10 · `docs/06` §9 ·
> plus `docs/00` §3 and ADRs 0001/0012/0014. **Those blocks are canonical. This is a pointer to
> them.**

**Ranked items** (the ranking is doc 08's to make; this is the ordering the source docs argued for):

| Rank | Item | Source |
|---|---|---|
| 🟠 **1 — PARKED** | **B3 primary research** — 5–10 IT-lead interviews. 🔴 **PARKED until both MVP slices land** ([ADR 0016](docs/adr/0016-mvp-first-sequencing.md)) — **the founder chose a team test as the next learning loop.** **The ranking argument is UNREFUTED and stays here for when it unparks:** the spikes ask *"can we build it?"* and **U12 answered that**; B3 asks *"will anyone deploy it?"* — **cheaper to answer and likelier to be fatal.** 🔴 **Doc 08 is therefore written with its #1 validation item still unasked. That is ADR 0016's bet and doc 08 states it as the top risk rather than ranking it away.** 🔴 **Doc 07 §1.5's ONE QUESTION rides along when it happens and closes the precision floor for free:** *"You already run some control that flags things. **How many false flags a week, per hundred staff, does your team absorb before you loosen it or turn it off?**"* — **about their present, not our hypothetical.** | doc 00 §3 · ADR 0001 · §6.4 · **doc 07 §1.5** · **ADR 0016** |
| ~~🔴 **2**~~ ✅ | ~~U12-a is the package's single rework trigger~~ → **ANSWERED 2026-07-17. It did not fire.** PASS on both surfaces for the **Enter path**, including doc 05 §1.2's visual criterion. **Doc 08 reports this as a resolved risk with a measurement behind it, not an open spike** — and per doc 00 §7's underclaiming argument, *"we tested the thing that could kill it, first, and it held"* is a better diligence line than a green risk table. ⚠️ **Two live remainders: the CLICK path is untested** (harness gap; **doc 05 §2.3's Enter-only-fails-open is now empirically confirmed**) **and U12-c is a property of two websites that changes when they deploy.** | doc 05 §10 · **U12-a** |
| ~~🔴 **2a**~~ ✅ | **U12-b — the wedge's language — RESOLVED 2026-07-17: PASS.** `isComposing` is **sufficient** on Microsoft Pinyin / Windows; **no suppression window exists or is needed.** **Doc 08 reports a resolved risk with a measurement behind it.** 🔴 **Report the SCOPE with it, always: one IME, not IMEs** — and **do not carry the first run's 3.6–40.8 s gaps as data; they were a broken analyser** (ledger #10). | **U12-b** · §2 ledgers #10, #11 |
| 🔴 **3** | **U6-b's pass criterion is B3-blocked** — the deadline is the measured `Ctrl+V`→`Enter` interval, which needs a design partner on real work. **This couples the #1 engineering number to the #1 validation item.** | doc 06 §3.3, §9 |
| 🔴 **3a** | **The precision floor's operating point is the admin's, not ours — B3's THIRD reason.** 🟢 **But unlike U6-b it is *askable*: U6-b needs instrumentation on real work (nobody knows their own paste-to-Enter interval); the ticket tolerance is a number the admin has lived.** **One line on a script that is already happening.** 🔴 **And the standing justification for the floor is wrong: *"cries wolf → gets uninstalled"* dies when B3 succeeds** (**ledger #7**). **It is ADR 0001's ticket economics + ADR 0014's channel defection — *over-blocking is fail-closed, delivered gradually*.** | doc 07 §1.2, §1.5 · ADR 0014 |
| 🔴 **4** | **The distillation risk has TWO entrances, not one** — the memory budget landing under ~140 MB **or** fertility forcing a larger vocabulary. **Same risk; the second entrance never involves a memory decision.** Depends on **C3-b**. ⚠️ **And U21-a can fire the second entrance in week 1, from public text** — doc 07 §3.3. | doc 06 §6.2 · doc 03 §4.3 |
| 🔴 **4a** | 🔴 **The eval corpus is a LEGAL event, not a data task** — **ADR 0015 puts real personal data in the company before there is a product.** **Lawful basis is `[verify]` (U25) and is counsel's call — A3's first real invoice.** **Not optional: the eval is the only detector C3-b will ever have**, and a risk with no experiment is not managed (ADR 0009's standard). ⚠️ **Do NOT reopen DP-SGD** — eval data never enters a gradient. | doc 07 §5.4 · **ADR 0015** · **U25** |
| 🔴 **4b** | 🟢 **U21-a is FREE and must not be ranked as blocked** — *"blocked on the corpus"* was a false dependency (**ledger #8**). **Public raw text, week 1, an afternoon, and one-sided: a fail is FINAL.** **The package's highest-value measurement has a lower bound nobody took.** | doc 07 §3 · **U21-a** |
| 🟠 **5** | **PDPA DPO + breach-notification readiness — in-force dates already past** (2025-06-01). **First invoice against A3.** We may already be non-compliant. | doc 02 §6.1 · **U18** |
| ~~🟠 **6**~~ ✅ | **U12-b would break the wedge's language if the naive gate shipped — MEASURED AND IT DOES NOT.** **Windows + Microsoft Pinyin was the test that matters and it PASSED** (2026-07-17). **Merged into rank 2a; do not rank twice.** ⚠️ **The residual is scope, not mechanism: other IMEs are untested and doc 08 should say so rather than generalize a single pass.** | doc 05 §1.3, §10 · **U12-b** |
| 🟠 **7** | **The beachhead's language is the slowest on the critical path** (~3× chunks, **estimate**, U21). **Second instance of the pattern** after U12-b. **Rank it as the wedge's engineering cost, honestly, rather than discover it.** | doc 06 §4.3 |
| 🟠 **8** | **§2.3's NRIC/SSM collision** — systematic FP source on **~86%** of 2001–2012 incorporations, in the layer whose precision is **quasi-contractual**. **Structure cannot fix it.** | doc 03 §2.3 |
| 🟠 **9** | **I4's Phase 0 gap** — **the weakest privacy claim in the package, in the most valuable feature.** Contractual now; mathematical at Phase 1. | doc 02 §5.4, §7 · ADR 0009 |
| 🟠 **10** | **Two adapters, not one** — the DOM adapter and the request-schema adapter break **independently** on the same D4 clock, **and the self-test covers only the first.** | doc 05 §4.4 · ADR 0012 |
| 🟠 **11** | **U15** (WebGPU under enterprise policy) — **the pessimistic case is the likely one**, on the same machine-policy channel as B3. | doc 06 §6.4 |
| 🟠 **12** | **U17** — `ap-southeast-5` per-service availability. **Verify BEFORE sizing Phase 1**; the residency decision assumes the stack runs there. | doc 02 §6.2 |
| 🟠 **13** | **SOC 2 has a lead time nobody has started.** It gates deals we cannot yet see. | doc 02 §6.4 |
| 🟠 **14** | **Old-format IC is unverified and not shipping.** **A coverage gap to state, not hide.** | doc 03 §2.4 |
| 🟠 **15** | **§4.3's honorific/register loss** — accepted with a decision rule, **in the beachhead's primary language.** Cheap to carry; **expensive to discover in a pilot.** | doc 04 §4.3, §8 |
| 🟡 **16** | **Engine-liveness rate — a metric we will be asked for and do not have.** A device with a dead engine is a **compliance event**. | ADR 0014 |
| 🟡 **17** | **Multi-region ops at A1** — bounded, but real. | doc 02 §6.2 |
| 🟡 **18** | **The adapter self-test measures D4 for free.** After one quarter of Phase 0 an assumption becomes a number — **the cheapest open item in the package to close, and doc 08 should say so.** | doc 05 §3.4, §10 |
| 🟡 **19** | **U16 is scoped to macOS** and resolves when a design partner has Macs. **Windows HKLM is unaffected** and B2 puts the beachhead there. | doc 05 §8.1 |

**Binding constraints on doc 08 itself** (agreed, do **not** re-derive from a different number):
- **Scope phases to A1/A2 — 2–3 engineers, 18 months.** Founder-confirmed as a **deliberate
  constraint, not a compromise**: solo collapses the multilingual ML edge into regex-chasing; more
  headcount lets the performance budget go soft. *(§6.4)*
- **B3 ranks above the engineering spikes.** *(§6.4, and now doubly — see rank 3.)*

> 🔴 **DOC 08 LEADS WITH THIS. Founder decision, 2026-07-17. Do not bury it in a risk table.**
>
> **The through-line: three of the top eight ranked items are the wedge's own cost.** U12-b (the naive
> gate breaks Chinese input) · §4.3 (the wedge's language is the slowest on the critical path) ·
> §6.3's three taxes (**trimming, quantization and distillation all degrade BM/ZH first — three taxes
> on one asset**). **Decision #4 chose EN/BM/ZH, and the wedge keeps turning out to be where the
> engineering is hardest.**
>
> **The founder's reason for leading, and it is the durable part:** the facts are identical either
> way; **only the ordering decides whether they read as *priced* or as *didn't know*.** Bury it and a
> diligence reader who finds it concludes we missed it. Lead with it and the same three items are
> evidence about our engineering rigor — **doc 00 §7's underclaiming argument.**
>
> ### 🔴 The framing — decided, and the rejected one is a trap this file set
>
> ✅ **"The wedge is where we spend. The moat is where we don't."** The three costs buy **18–24 months
> of beachhead — not defensibility** *(estimate, low confidence; the **optimistic** end since
> SentinelOne closed Prompt Security)*. **Vendor neutrality costs zero engineering** — it is a
> structural *refusal* (never a model vendor or router, ADR 0003's necessary condition) and **it widens
> for free as Gemini grows.** **We know what the pain buys, and it isn't the moat.** This survives the
> diligence question *"why won't Google just do this?"* **because it does not depend on the answer.**
>
> ❌ **NEVER: *"the engineering is hardest here because this is where our strategic advantage lies"*** —
> i.e. friction as **the price of the moat.** **Three reasons, and the third is the one that bites:**
> 1. **It contradicts decision #4 and ADR 0003** — *"the **wedge**, not the moat."* Doc 00 §5's title
>    is **"Wedge vs. moat — do not conflate these"**; ADR 0003's consequence is *"stated separately and
>    **never blurred**"* and its warning is *"**calling it a moat is what gets caught in diligence.**"*
>    **This framing puts a multilingual-is-the-moat claim in doc 08's opening paragraph of a package
>    that ships an ADR explaining why it is false.**
> 2. **"A moat is only defensible because it is hard to build" is false as a general rule.**
>    **Difficulty is defensibility only when it is *asymmetric* — hard for the competitor, not merely
>    hard.**
> 3. 🔴 **Our asymmetry runs BACKWARDS, and this is checkable.** **U12-b's decisive test is Windows +
>    Microsoft Pinyin — the IME is made by Microsoft**, Layer 4, the competitor doc 00 §2.4 calls
>    ***"the existential one."*** **The BM/ZH fertility problem is hard because multilingual tokenizers
>    are hard, and per ADR 0003 *"Google's multilingual NLP is better than ours will ever be"* — they
>    trained the models the field is built on.** None of it is proprietary. **It is hardest for a 2–3
>    engineer team (A1/A2) and easiest for the incumbents most able to eat us.** So *"hardest here
>    because our advantage lies here"* is **exactly inverted: it is hardest here because *theirs* does,
>    and we operate in it anyway, on a timer.**
>
> ⚠️ **This file caused the error, which is why the rejected framing is written out rather than just
> omitted.** This paragraph previously read: *"**That is coherent for a moat** — the hard thing is the
> defensible thing, and per ADR 0003 the wedge was never claimed as one anyway."* **One sentence that
> asserts the moat framing, asserts the false general rule, and then refutes itself with the ADR that
> kills it.** The founder built on it and reached the moat framing; **his connective was downstream of
> ours.** **It is doc 01 §3 refuting doc 00 §5 mid-sentence — the package's oldest failure mode — and
> it shipped in the paragraph that tells doc 08 how to talk about the wedge.** *(Instance #6 in §2's
> ledger. Corrected 2026-07-17.)*

---

## 8. Immediate next action

> ## 🔴 **SLICE 1 — a working chat-text extension, L1 + L2, that the founder's TEAM loads unpacked.**
>
> **Founder decision, 2026-07-17. [ADR 0016](docs/adr/0016-mvp-first-sequencing.md). Read it before
> anything else in this section, because it REVERSES the instruction this section carried for two
> sessions.**
>
> 🔴 **THE ORDERING CHANGED AND A FRESH SESSION WILL GET THIS WRONG IF IT TRUSTS ITS MEMORY.** This
> section used to say *"the next action is NOT code"* and *"go make ten phone calls before you write a
> line of the detection engine."* **That is no longer the next action.** **B3, force-install work,
> U6-b's threshold, marketing/GTM, doc 08, and anything else needing a design partner are PARKED until
> both MVP slices land.**
>
> ⚠️ **And the trap is specific, because the old argument is still good.** **B3 was never refuted — it
> was OVERRULED.** Doc 00 §3, doc 00 §7 and ADR 0001 still argue it should come first, and **nothing in
> the spike results touched that argument.** So a fresh session re-reading those docs will "discover"
> the B3-first case and mistake re-deriving it for diligence. **It is a live decision, not an
> oversight. ADR 0016 records the dissent so it does not have to be re-argued — read it there.**
>
> ### The locked sequence
>
> | | | |
> |---|---|---|
> | **1** | 🔴 **Slice 1 — chat text, L1 + L2** | ChatGPT + Claude · typing **and** paste · Enter **and** mouse Send · **L1 deterministic + L2 on-device model TOGETHER** · block/modal → rewrite → **the user presses Send** · scanning on the user's machine, **raw prompts never reach our server** · **no rehydration**. **Accepted when the team can clone → Developer mode → Load unpacked → use it on both surfaces → verify the whole experience.** |
> | **2** | **Team test** | **Not a public release.** The founder sends them the repo; they load unpacked. |
> | **3** | **Slice 2 — file CONTENT checking** | **Only after the team accepts Slice 1.** 🔴 **B3 does NOT go between the slices** (founder, explicit). **Propose the thinnest honest scope BEFORE implementing** — see the checklist row. |
> | **4** | **Doc 08** | **Only after both slices are implemented and tested.** |
>
> 🔴 **AN L1-ONLY BUILD IS NOT AN ACCEPTABLE SLICE 1 TARGET.** Founder, explicit: *"If L1+L2 cannot
> realistically work in days, push back with a concrete timeline and the exact blockers. Do not replace
> it with an L1-only 'MVP'."* **He is right on the merits, and the reason is sharper than *"a weak demo"* —
> re-read doc 00 §1.3 before repeating it.** 🔴 **L1 is the package's *highest-value* feature**
> (doc 00 §1.3's title is *"The highest-value feature needs no ML, and you deferred it"*), **so an
> L1-only build would demo WELL.** That is the danger, not the objection. **The objection is that per
> doc 00 §5 and doc 03 §3.3 — *"a regex catches the IC number in any language; nobody needs a model
> for that"* — L1 is the part that is NOT ours.** **An L1-only Slice 1 would demo the highest-value
> feature and none of the differentiated one**, impressively enough to be believed, and the team
> would validate a product we do not have.
>
> 🟢 **U21-a may run in parallel — but ONLY if it does not delay Slice 1** (founder). It is still
> free, still an afternoon, still one-sided.
>
> 🟢 **Slice 1 pays a debt nobody expected it to: it produces U6-b's CURVE for free.** The curve was
> always ours (doc 06 §3.3); only the **threshold** needs a design partner. **A working extension on the
> team's machines measures paste → verdict on real hardware.**
>
> ### What Slice 1 must honour — these are not negotiable and the founder restated all three unprompted
>
> - **Decision #2 + #8 (coupled):** on-device scanning, synchronous gate, **the user presses Send**.
>   **No auto-submit, ever.** The post-modal flow is §6.4's: modal → adapter writes the rewrite →
>   focus + caret restored → **single-use approval token bound to `hash(rewritten)`** → the user presses
>   Send → the gate matches and does not stop the event.
> - **E2 — the rehydration kill.** Once a value is replaced, **the extension never writes the original
>   back into the provider's page.** §6.5 is the reasoning; **the demo is where the pressure to reopen
>   comes from, and that pressure is not a reason.**
> - **Decision #5 + I3 — and this is now a REVIEW GATE, not a hope.** **U26: the spike harness logs raw
>   `key` values.** That is fine for an instrument on two machines for a week; **the production
>   extension must not inherit it.** **Classes, counts and salted-hash references. Check it; do not
>   assume it.**
> - **ADR 0009 — per-tenant DEKs from day one**, even with one tenant. Cheap now, flag-day migration
>   later.
> - **ADR 0013's monotonic rule** — L1 may write DIRTY; **only a completed L1+L2 scan may write CLEAN.**
> - **ADR 0014** — a dead engine degrades to **advisory**, never fail-closed.
>
> ### ✅ The four blockers are ANSWERED — [ADR 0017](docs/adr/0017-slice-1-technical-choices.md)
>
> | | Decision (founder, 2026-07-17) | The part that will get forgotten |
> |---|---|---|
> | **L2** | **A stock public multilingual NER checkpoint**, int8, in the offscreen doc. **No trained model. No in-product placeholder banner** — the founder tells the team verbally. **Do NOT switch to a custom L2 or an LLM sensitive-classifier for Slice 1.** | 🔴 **It is PERSON/ORG/LOC tagging, NOT a sensitive-vs-not classifier.** *"Explain Einstein's theory"* has a PERSON; *"summarise Apple's earnings"* has an ORG; **neither is a leak.** **The gap between *is an entity* and *is sensitive* is the product, and Slice 1 does not have it.** |
> | **Weights** | **First-run download from a public CDN.** | **Decision #2 is about what we SEND, not what we download — a weights fetch carries no user data and does not touch it.** 🔴 **But pin the hash and verify before load** (doc 02 §6.4's un-N/A-able row, doc 05 §7's *"you control when our code changes"*), **and note it fails on a locked-down network — exactly the fleet B3 targets.** Fine for the team; **not the shipping answer.** |
> | **Build** | **WXT** (doc 01 §6's stack) **with `dist/` committed**, so the team clones → Load unpacked with no toolchain. | ⚠️ **A committed build artifact is a second source of truth and it drifts SILENTLY.** **Slice 1 needs a `dist/`-matches-`src/` check** or the team reports on code that no longer exists. **Doc 01 §6's eject-to-CRXJS rule still stands** — Slice 1 has no MAIN-world work but **all** the offscreen work. |
> | **Gate** | **Block + modal + Ignore-with-reason.** | 🟢 **This turns Slice 1's weakness into its best output: the Ignore rate PER CLASS on real work** is doc 07's detector-prioritization signal — *"it ranks our bugs; it does not label them."* **Doc 02 §4.6: local labelling only. I3/U26: class + count + salted hash, never the typed value.** |
>
> **Masking policy (founder):** **L1 hits + L2 PERSON + ORG** are mask targets. **LOC is OFF** — see
> the recommendation in §8.1. **The org dictionary (ADR 0004) follows and must NOT block Slice 1.**
>
> ### 🔴 Slice 1 is NOT days. ~3–5 weeks, one engineer. The founder asked for this pushback explicitly.
>
> *"If L1+L2 cannot realistically work in days, push back with a concrete timeline and the exact
> blockers. Do not replace it with an L1-only 'MVP'."* — founder. **It cannot, and here is why.** **The
> gate is the ONLY part U12 de-risked**; everything below is unbuilt.
>
> | Work | Est. | Why it is not free |
> |---|---|---|
> | WXT scaffold + committed `dist/` + drift check | **~1 d** | |
> | **ONNX Runtime Web in the offscreen doc: model load, int8, WASM** | **~3–5 d** | 🔴 **U22 is on the critical path now** (COOP/COEP → `SharedArrayBuffer` → ORT threads). **Ours, not the fleet's** — unlike U15. It is the difference between a usable and an unusable L2. |
> | **Tokenizer in the browser** (SentencePiece) | **~1–3 d** | **Not a detail.** Doc 06 §4.2's 512-chunking and doc 07 §6.2's overlap floor are both defined in TOKENS. |
> | ChatGPT + Claude adapters (composer, send button, paste) | **~3–4 d** | **U12 proved the GATE, not the adapters.** Doc 05 §4.4: two adapters, breaking independently on the D4 clock. |
> | Gate: `window` capture, `composedPath()`, `isComposing`, verdict cache | **~1–2 d** | **The one part U12 de-risked.** |
> | L1 detectors + placeholder-grammar mask (doc 05 §6.2) | **~2 d** | **The mask is a DETECTION requirement** — without it L2 tags its own `PERSON_1` output. |
> | Vault, monotonic numbering (ADR 0011), IndexedDB | **~2 d** | Doc 04 §8: a dead vault mid-thread makes `PERSON_1` mean two people. |
> | Modal (Preact, shadow root) + rewrite + focus/caret + approval token | **~3–4 d** | Token is hash-bound, single-use, **idempotent** (doc 05 §6.2). |
> | Paste path: preempt the queue, no debounce (doc 06) + Ignore loop + local audit | **~2–3 d** | |
> | **Total** | **~18–26 engineer-days ≈ 3.5–5 weeks** | **(estimate)** — no comparable build to cite. |
>
> 🔴 **The number is an ESTIMATE and is tagged as one.** **The two that could blow it: U22** (if ORT
> threads are unavailable, L2 latency may miss the gate entirely and the answer is ADR 0013's L1
> short-circuit plus a slower "clean") **and the ADAPTERS** (a D4 event during Slice 1 costs days and
> is outside our control). **Both are measurements, not guesses — and neither is discoverable without
> building.**


<details>
<summary><b>Superseded — the doc 07 brief (kept for the reasoning, not the task)</b></summary>

**Write `docs/07-ml-training-and-data-strategy.md`.** ✅ **DONE.**

> **Docs 05 and 06 are committed. Read both — doc 06 hands doc 07 the thing that makes it harder than
> it looks.** **Doc 07's scope is the numbered list immediately below.** **§8.3/§8.4 record what docs
> 05–06 settled**, so it is not re-derived; **§8.5/§8.6 are superseded briefs, kept for reasoning only
> — do not write doc 07 against either.**
>
> *(Corrected 2026-07-17: this line read **"§8.0 is doc 07's scope"**. It was not — §8.0 was doc 06's
> **superseded** brief, and a fresh session following the pointer would have written doc 07 against the
> scope of a doc already committed. **The pointer in the line that tells you where the scope lives was
> itself the stale reference.** §8's subsections were also numbered `8.0, 8.2, 8.1, 8.2` — **two
> different sections both called §8.2** — so the pointer had no unambiguous target even had it aimed
> at the right one. Renumbered `8.1 → 8.4` in reading order. **Found by listing the file's own
> headings, which took one command and should be routine.*)

**Scope:**
1. 🔴 **Precision over recall — explicitly targeted and justified. Per ADR 0001 this is a
   *quasi-contractual commitment*, not an ML preference:** every FP is a ticket **the admin** eats, and
   the admin is the buyer. **A blocking tool that cries wolf gets uninstalled and then detects
   nothing** — and per `ASSUMPTIONS.md` §4, *"the extension can't be removed"* is a **deliberate
   non-assumption**: in Phase 0 it is one click.
2. 🔴 **But doc 04 §8 complicates the asymmetry and doc 07 must say so:** a **recall** miss isn't just
   an unmasked entity — **it breaks coreference for the entities we did catch**, because the model sees
   half-anonymized text. **Recall failures degrade output more than the precision framing implies.**
3. 🔴 **The fertility spike settles THREE budgets at once** (doc 06 §4.4): **accuracy, latency, and
   chunk count.** It is **one experiment** — token frequency over an EN/BM/ZH corpus, keep ~99.9%
   coverage, **measure fertility before/after.** **Blocked on the corpus (U14/C2 → C3).** **U21** is
   the same measurement.
4. **The cold start:** public corpora + synthetic + LLM-as-labeler + human audit (C1/C3). **C3 is the
   package's least-confident, highest-blast-radius assumption** and it now blocks the **latency**
   budget too, not just accuracy.
5. ⚠️ **Doc 02 §4.7 is NOT evidence synthetic data is good** — only that it's privacy-clean. **An LLM
   generating Malay PII generates the *stereotypical* distribution**: too-regular NRICs, skewed name
   distributions, textbook code-switching. **Train on that and you are excellent on synthetic Malay and
   mediocre on Malaysia.**
6. **U14** (no usable public EN/BM/ZH code-switched PII corpus) — flagged as **an assumption
   masquerading as a fact. Treat with suspicion; it is a research task, not a finding.**
7. **Adversarial-Ignore poisoning defenses.** Per doc 00 §1.6 the Ignore+reason loop is **a compliance
   artifact, not a label** — its consumer is the admin console. **Doc 02 §4.6: local labeling only, and
   it costs a slower, noisier loop. Say so rather than pretending the loop is as good either way.**
8. **DP-SGD's revisit trigger is the first real prompt in the training set, not a date** (doc 02 §4.5).
   Its Phase 0 rejection is **structural**: DP protects *training-set members*, and a synthetic corpus
   has none — *"a rigorous guarantee about nobody."*
9. **Inherited requirements:** doc 05 §6.2's **L1 placeholder-grammar mask** (a *detection* requirement
   — without it L2 tags its own `PERSON_1` output and the pipeline is non-idempotent) · doc 06 §4.2's
   **512-token chunk boundaries** (an entity straddling a boundary is split — **the stride/overlap
   trades latency against recall, and doc 07 owns which side to err on**) · doc 03 §2.3's
   **`NRIC_OR_SSM_AMBIGUOUS`** class needs a precision target for a case **undecidable from the digits
   alone** · doc 04 §4.2/§4.3's **gender and register losses** belong in the eval — *"the wedge's
   quality story, in the wedge's languages."*
10. 🔴 **The eval is the only thing that catches over-spending the wedge** (doc 06 §6.3): **trimming,
    quantization and distillation all degrade BM/ZH first. They are three taxes on one asset.** A
    budget that spends all three lands a model that is small, fast, and **bad at the languages the
    company exists to be good at.**

</details>

### 8.1 LOC — the recommendation the founder asked for: **OFF for Slice 1**

**The founder's masking policy is L1 hits + L2 PERSON + ORG, *"(and LOC if you recommend)"*.
Recommendation: 🔴 LOC OFF. Every fork resolves to a decision, so here it is with its reason.**

**Stock NER's `LOC` class conflates two things that are not alike:**

| | Example | Is it a leak? |
|---|---|---|
| **Public geography** | *"flights from Kuala Lumpur to Tokyo"* · *"how's the weather in Penang"* | 🔴 **No.** Masking it is a **pure false positive.** |
| **A personal address** | *"12 Jalan Ampang, 50450 KL"* | ✅ **Yes** — and **stock NER tags it with the SAME label.** |

**So `LOC` cannot separate the case we care about from the case that is 95% of its firings**, and per
doc 07 §1.2 / ADR 0001 **precision is a quasi-contractual commitment: every FP is a ticket the admin
eats.** Turning LOC on buys a small amount of address recall and pays for it with **a constant
interruption on ordinary prompts**, in the one layer whose value is precision.

⚠️ **And note the honest asymmetry rather than hiding it: an address IS sensitive and Slice 1 will
miss it.** **That is a stated gap, not a silent one** — and it is **L1's** job (structural/postcode
patterns) or a later fine-tune with a real `ADDRESS` class, **not stock `LOC`'s.**

> 🟠 **ORG has the same disease and is IN anyway — say so plainly.** *"Summarise Apple's earnings"*
> tags an ORG. **ORG will over-fire on public companies exactly as LOC over-fires on public places.**
> It is in because **the org dictionary (ADR 0004) is the precise instrument for the ORG case** and
> the founder has (correctly) refused to block Slice 1 on it — **so ORG is the placeholder for a
> feature we have already designed**, whereas LOC is a placeholder for nothing.
>
> 🟢 **The Ignore rate per class settles this empirically, which is why the argument does not have
> to be won now.** Doc 07: *"it ranks our bugs; it does not label them."* **If ORG's Ignore rate comes
> back high on the team's real work, that is the measured case for the org dictionary — and if
> someone wants LOC back, the same instrument prices it.** **Do not tune this by intuition; the whole
> point of shipping Ignore+reason is that it is an instrument.**

---

### 8.2 What doc 07 settled — do NOT re-derive

- 🔴 **C3 → C3-a / C3-b.** *"PII"* was the **identifier** framing and **doc 03 §3 moved the wedge on
  2026-07-16 without moving C3.** **C3-a** (identifiers · **published grammar** · High · near-zero blast
  radius): **no model ever learns from a synthetic NRIC** — **L1 is written, not trained** (fixtures,
  not data) **and L2 never sees one** (doc 03 §3.2 masks it). **C3-b** (BM/ZH text, register, name
  distribution, **and the context tokens around every identifier**) is **Low and carries all the blast
  radius.** **The rule: synthesize what has a specification; sample what you can only observe** — **it
  cuts *through* the NRIC**, since doc 03 §2.3's *"highest-value L1 rule"* reads the sentence.
- 🔴 **U21 → U21-a (free, now, one-sided) / U21-b (blocked).** *"Blocked on the corpus"* was a **false
  dependency.** **U21-a is the FLOOR** — trimming only raises fertility — so **a fail is final and fires
  doc 06 §6.2's distillation trigger without a memory decision ever being made.**
- 🔴 **U14 → U14-a.** **A universal negative cannot be resolved**; the search's **bar is declared before
  looking**, output is **a decision, not a verdict.** **Do not carry U14 as open forever — it cannot
  close.**
- 🔴 **ADR 0015 — the eval's text substrate is REAL; training may stay synthetic.** **A synthetic eval
  is BLIND to doc 06 §6.3's three taxes**: the trim keeps the **~99.9%-coverage** tokens and synthetic
  Malay is **made of** those tokens. **It also makes C3-b unfalsifiable — testing the claim against
  itself.** **Fourth instance of the letter-vs-purpose trap, and the first living in a *metric*.**
- **Precision over recall ✅ — re-justified.** **Not** *"gets uninstalled"* (dies when B3 succeeds).
  **ADR 0001's ticket economics + channel defection** (doc 00 §1.4 = **ADR 0014's argument**). ***"Over-
  blocking is fail-closed, delivered gradually."*** 🔴 **No floor invented: the curve is ours, the
  operating point is the admin's — and unlike U6-b's threshold it is ASKABLE. One question on the B3
  script.**
- **Recall's unit is the *mention*, reported per *entity*.** Doc 04 §8's *"breaks coreference for the
  entities we did catch"* is **intra-entity, not inter-entity**, and the damage is **ADR 0011's benign
  split.** 🔴 **Recall is MONOTONE ON PRIVACY and NON-MONOTONE ON UTILITY — both halves, in that
  order.** At 0% the provider gets `John Tan`; at 90% it gets `Tan`, **strictly less** — **90% beats 0%
  on privacy and loses to it on utility.** **Consequence: report the fraction of entities with 100%
  mention coverage alongside F1**, because F1 averages over the variable that matters. ⚠️ **This was
  first written as the slogan *"90%-caught is worse than 0%-caught (on utility)"* and the founder
  repeated it back within one turn with the qualifier gone and the axis inverted** (*"captures the
  threat model… false sense of security"*). **The rejected reading has a bad instruction in it —
  *"mask everything or mask nothing"*, which deletes achieved privacy to avoid a coherence artifact,
  in the wedge's languages first.** **Do not re-compress this into a comparison. Doc 07 §1.4.**
- **The Ignore *rate per class* is a detector-prioritization signal and doc 00 §1.6's poisoning
  argument does not reach it** — the poisoner is **indiscriminate**, so they move the mean and not the
  ranking. **Never a label. It ranks our bugs; it does not label them.** **Already I3-shaped** (class +
  count). **Cost: it is a second purpose and the DPA must name it.**
- **DP-SGD unchanged and its trigger is still right** (doc 02 §4.5) — **but the first real data arrives
  in the *eval* set and nothing was watching that door.**
- **`NRIC_OR_SSM_AMBIGUOUS` cannot have a precision target** — ambiguity is a property of our
  information, not the string. **Score its *over-firing rate*.** 🟢 **And half the collision's ground
  truth is PUBLIC**: real SSM numbers in real sentences measure the **FP** direction — **the
  quasi-contractual one** — **with no personal data in it at all.** Cheapest real-data eval row; build
  it first.

### 8.3 What doc 05 settled — do NOT re-derive

- **U10 ✅ 30 s**, cited. **Offscreen→SW messages reset the timer**, so the engine keeps the SW alive
  when there is work.
- **U11 ✅ TRUE, inference struck.** **U19 ✅.** **U20 raised** (prompt submission is HTTP, not a WS
  frame — observable during the U12 spike at zero marginal cost).
- **The observer is `webRequest` in the SW (B3), not a MAIN-world patch** (ADR 0012). **Doc 01 §2/§5
  corrected.** **Phase 0 injects nothing into the MAIN world.**
- **The gate registers at `window`** (ADR 0010), not `document`.
- **Token needs idempotency, not determinism** (doc 05 §6.2) — and the L1 placeholder-grammar mask that
  delivers it is **doc 07's**, as a detection requirement.

### 8.4 What doc 06 settled — do NOT re-derive

- 🔴 **The budget is TWO deadlines, not one number.** **Hard** = dirty/clean at Send (cannot slip).
  **Soft** = full findings while the user reads the modal (hundreds of ms, free). **Gating is the
  deadline. Completing is not.**
- 🔴 **U6 was specified against the workload with slack** and is **split**: **U6-a** (typing ·
  CPU/battery · deprioritized — the user's own keystroke gaps hide the scan) · **U6-b** (paste · the
  number the gate lives on). **U6-b's curve is ours; its threshold is B3-blocked.**
- **ADR 0013 — L1 may decide DIRTY alone.** The dangerous paste is gated **sub-ms**; **the full L2 wait
  is only ever paid to say *"clean."*** 🔴 **The rule that keeps it honest: the verdict cache is
  monotonic toward dirty — L1 may write DIRTY, only a completed L1+L2 scan may write CLEAN.**
- **ADR 0014 — degrade to advisory, never fail-closed.** **A dead engine that blocks ChatGPT sends the
  user to the ChatGPT desktop app** (doc 00 §1.4). **Fail-closed relocates the leak to the channel we
  cannot audit, at the moment our telemetry is already broken.**
- **`max_position_embeddings` = 512** (cited). **Paste latency = `ceil(tokens/512) × per-chunk`.**
- **Paste bypasses the debounce and preempts the queue.** Typing scans are droppable; paste scans never.
- **The timeout cannot be a constant** — latency is a function of chunk count, so a fixed timeout
  declares the engine dead on a long Chinese paste.
- 🔴 **The memory fix taxes the latency budget, and the two budgets are ONE lever** (§4.4). **Doc 03
  §6's prediction — *"trimming cuts memory ~50%, latency barely at all"* — is true *per token* and
  silent on *token count*.** Trimming changes the tokenizer → **BM/ZH fertility rises → the sequence
  lengthens → it crosses 512 sooner → whole extra forward passes.** **Per-token latency is flat.
  Per-*scan* latency is not.** **Full reasoning and the trap it sets for doc 07: §6.2.**
- 🔴 **So fertility is the accuracy metric, the latency metric AND the chunk-count metric — one
  measurement, three budgets** (§4.4; **U21** is the same measurement). **It is blocked on the corpus
  (U14/C2 → C3)**, which means **C3 now blocks the latency budget too, not just accuracy.**
- 🟠 **The wedge's languages are the slowest on the critical path** (§4.3) — chunk count is set by
  *tokens*, users paste *characters*, and CJK yields far more tokens per character (**~3×, estimate,
  U21**). **Second instance of the beachhead being the hard case**, after doc 05 §1.3's IME finding.
  **→ §7.3 rank 7.**

### 8.5 Superseded — the doc 06 brief (kept for the reasoning, not the task)

**Doc 06 is done.** Retained because its framing binds doc 07 and doc 08:
1. 🔴 **Size the latency budget against the PASTE case, not the typing case** (doc 05 §6.3). Doc 01 §4
   annotates the cache-miss branch *"rare path"* — **it is rare across all sends and universal on the
   sends that matter.** Every typed prompt is debounce-scanned, so the cache is warm by construction.
   **Paste is the only way to fill a composer in one event — and doc 00 §6 calls accidental paste the
   dominant real-world leak case.** The cache is cold by definition on the threat we exist for. **U6's
   stakes are higher than doc 01 §4's "~95% clean hit" implies.**
2. **The runtime multiple** (doc 03 §4.4 — weights ≠ RAM; ~1.5–2× is a rule of thumb doc 03 **refuses**
   to assert). **Measure it.** If the budget lands **below ~140 MB of weights, §6.2's distillation risk
   becomes a Phase 0 requirement** — and its fallback depends on **C3**, the least-confident assumption
   in the package.
3. **The int8 path** (dynamic vs. static, per-channel vs. per-tensor) — **it degrades BM/ZH accuracy
   first. The wedge is what quantization eats.**
4. 🔴 **Dead-engine degradation — specify it, don't inherit it** (doc 02 §8). Slow fails to friction and
   self-clears; **dead does not resolve at all.** The obvious patch — a timeout that lets the send
   through — is a **silent fail-open**. Degrade to **advisory** (decision #3's existing mode), surfaced
   to user **and** admin as *"protection degraded."* **Doc 05 §3.3 adds two more triggers for the same
   mode** (broken adapter, unresolvable surface): **one degradation state, three triggers.** Doc 06
   owns the **timeout value** (derive from U6 — no number invented) and the **fail-open/fail-closed**
   call, which doc 01 §7 assigns here.
5. **U15** (WebGPU under enterprise Chrome policy) — materially affects the budget; enterprise policy
   may disable it **on exactly the fleet we target.** ⚠️ **§6.3: the offscreen document is a Window
   context, so it PRESERVES WebGPU** — do not write doc 06 on the opposite assumption.
6. **U6 must include the content-script → offscreen hop** (ADR 0006 — *inside* the budget, not beside
   it). Worst case: **a cold offscreen document during a send-gate cache miss** (doc 05 §5.2).
7. **Doc 03 §6's falsifiable prediction:** trimming should cut **memory ~50%, latency barely at all**
   (embedding is lookup, backbone is compute). ~~**Doc 06 is where it gets falsified.**~~
   ✅ **ANSWERED — doc 06 §4.4: true *per token*, silent on *token count*. Falsified in scope, not in
   fact.** **Do not read this line as still open. → §6.2 and §8.4.**
8. **No tokens/sec until measured or cited.** Docs 03 and 05 both held this line and produced none.
   ~~**Doc 06 is where the pressure to break it is highest**~~ — ✅ **and it held.** **Doc 07 inherits
   the line.**
9. **Vault TTL × token TTL interact** (doc 05 §5.3, §6.4) and neither has a value.

### 8.6 Superseded — the doc 05 brief (kept for the reasoning, not the task)

**Doc 05 is done. This section is retained only because its framing of U12 survived and is binding on
the spike.**

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

---

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
- 🔴 **Recompute every number independently before committing — and do NOT trust this line's own
  history.** It used to read: *"Doc 03's parameter and probability arithmetic was re-derived from
  scratch and matched."* **It did not match. `86M + 190M` was published as `280M` and shipped for
  three commits** — a sum that does not add, in the doc whose first line is that it *"does arithmetic
  rather than argument."* **Corrected 2026-07-17; the true total is ~279M, derived, and the model card
  states no total at all.** *(Full account: `ASSUMPTIONS.md` §5 · doc 03 §4.1.)*

  **Three lessons, and the third is the one that will save you:**
  1. **A claimed check is not a check.** This very line asserted the verification had happened. **The
     assertion was the only evidence, and it was false.** If a number matters, recompute it **now**,
     in a shell, even if the docs say someone already did.
  2. 🔴 **Audit the Source column, not just the number.** `280M` was sourced to *"Model card."* **The
     card contains no total.** Checking whether a source *says what you cite it for* is the §5 rule —
     **and it applies to external sources too**, which is where we finally broke it.
  3. **The error survived because it was nearly right.** ~279M vs 280M is **0.5%**. **Plausible
     numbers do not get checked. Implausible ones do.** So the numbers most likely to be wrong in this
     package are **the ones that look fine** — and a two-second `python -c` is cheaper than the
     credibility of every other number in the package (`ASSUMPTIONS.md`'s own framing).
