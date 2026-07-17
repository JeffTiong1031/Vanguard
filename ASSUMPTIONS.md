# Assumptions Register

**Status:** living document. Every downstream doc is built on these. If one is wrong, the "Blast
radius" column tells you what to go re-open.

## How to use this

Three kinds of statement appear in this package, and they are not interchangeable:

| Kind | Meaning | Where it lives |
|---|---|---|
| **Decision** | Resolved by the founder in interrogation. Not re-litigated without new evidence. | Plan + §1 below (pointer only) |
| **Assumption** | I had to pick something to proceed. **Correcting one is cheap now and expensive later.** | §2 below |
| **Unverified claim** | A factual statement I believe but have not confirmed. **Never treated as load-bearing without a check.** | §3 below |

The rule of engagement is *"a gap over a fabrication."* §3 is where the gaps are kept honest. If an
investor's ML advisor finds a confidently-stated number that turns out invented, every other number
in the package loses its credit. §3 exists to make that impossible.

---

## 1. Decisions (not assumptions — do not edit here)

These were resolved directly with the founder. Listed for orientation only; the plan is canonical.

1. Buyer = enterprise compliance officer
2. Privacy posture = hybrid, split by workload (prompt on-device always; files cloud under DPA)
3. Gate = admin-enforced block; advisory for solo
4. Beachhead = EN/BM/ZH code-switching (Malaysia/SEA)
5. Audit log = redacted finding + salted-hash reference; raw value never leaves the device
6. Deployment = self-install now, managed force-install later
7. Phase 0 = text prompt only; files Phase 1
8. No auto-submit, ever

**Decisions #2 and #8 are coupled.** On-device scanning is what allows the send-gate to decide
*synchronously* off a warm cache; a cloud scan would force stop-and-replay, and replay *is* the
auto-submit that #8 forbids. Neither can be revisited alone.

---

## 2. Assumptions

Confidence is my own, and deliberately not flattering.

### A. Team and runway

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| A1 | **2–3 engineers**, no dedicated ML hire | Low — never asked | **HIGH.** At 1 engineer, Phase 0 drops to one surface and **L1-only** (no L2 model at all) — which is still demoable but changes doc 00's differentiation claim. At 4+ with an ML hire, the distillation risk in doc 08 downgrades from Top-3 to Top-10. |
| A2 | **~18 months runway** | Low — never asked | **MEDIUM.** Drives doc 08 phase lengths and how aggressively kill criteria should bite. Under 12mo, Phase 2 comes out of the roadmap entirely. |
| A3 | No in-house **security/compliance** counsel; DPA and SOC 2 work is outsourced | Medium | **MEDIUM.** Doc 02's compliance posture assumes buying this expertise, not building it. It's a cost line, not a headcount line. |

### B. Market and customer

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| B1 | **No design partner and no willingness-to-pay evidence today** | Medium — implied, not confirmed | **HIGH.** Doc 00 argues positioning from first principles because there's no customer evidence to cite. If a design partner exists, doc 00 should lead with them and doc 08's kill criteria become measurable instead of hypothetical. |
| B2 | Beachhead customer = **Malaysian/SEA mid-market enterprise, ~50–500 seats**, with an existing compliance function and regulated-ish data (banking, healthcare, telco, BPO) | Low | **HIGH.** Sets the entity taxonomy priority in doc 07 and the sales motion in doc 00. A large-enterprise (5000+) target changes the deployment story to procurement-led and adds ~9 months to first revenue. |
| B3 | Customers can **force-install** the extension by Phase 1 | **Low** (unchanged after mitigation — see B3 expanded) | **HIGH.** Decision #6 defers the real control to force-install. If the beachhead segment won't deploy it, **the enterprise control story never becomes real** and the product is permanently a nudge. Arguably the single most dangerous assumption in this document. |
| B4 | Buyer's fear is concentrated on **public LLM chat UIs**, not IDE copilots or API traffic | Medium | **MEDIUM.** If the fear is really in the IDE, the browser extension is the wrong surface entirely and doc 00's form-factor argument has to be reopened. |

#### B3 — expanded (deployment hurdle vs. sales hurdle)

**Founder research (2026-07-16), CTO concurring:** the target segment is characterised by high
Workspace/M365 adoption, near-zero *active* browser governance, and an IT function of 1–2
generalists. A search turned up nothing contradicting this. **Provenance: this is the founder's
informed read, not verified data, and not mine — I asked for it rather than producing it.** I concur
for a specific reason: buying Workspace/M365 is a procurement act, whereas governing a browser is an
operational practice, and mid-market IT almost never staffs the latter. That reasoning is *why* the
read is plausible; it is not evidence that it's true. **Stays Low until primary research lands.**

**Mitigation — the deployment hurdle is far lower than "they need Chrome Enterprise Core."**
My original framing implied force-install requires a cloud-managed browser estate. That was wrong.
Chrome reads `ExtensionInstallForcelist` from **OS-level machine policy**, with no cloud enrollment
and no Chrome Enterprise Core licence. This has always been how Chrome policy works.

| Platform | Mechanism | Weight | Confidence |
|---|---|---|---|
| **Windows** (primary — matches the beachhead segment) | `HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` via registry write or GPO | Genuinely a **5-minute script**. One registry key. | **High** — well-established behaviour |
| **macOS** (secondary) | Signed **configuration profile** (`.mobileconfig`) — *not* a plain shell command. No MDM required, but must be installed and user-approved. | Heavier: authoring + signing + an approval click per machine | **Medium** — see U16; the specifics have shifted across macOS versions |

Both paths require **local admin rights**, which a 150-seat BPO's IT generalist has. Admin rights are
not the obstacle.

**Why this does not raise the confidence rating.** The mitigation solves the *deployment* hurdle. It
says nothing about the *sales* hurdle, which is the one that actually gates revenue:

> Will a 150-seat BPO's lone IT generalist — who has never written a browser policy, has no budget
> line for browser governance, and is measured on ticket closure — actually run this script for a
> pre-seed vendor's extension?

That is a question about organisational will, not technical feasibility, and a registry key does not
answer it. **B3 stays Low.** Resolving it requires **primary research: 5–10 interviews with IT leads
in the target segment.** That is doc 08's **#1 pre-Phase-0 validation item** — ranked above every
engineering task, including the U6/U12 spikes, because those two ask *"can we build it?"* while this
one asks *"will anyone deploy it?"* — and the second question is cheaper to answer and more likely
to be fatal.

### C. Data

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| C1 | **No access to real prompts or labeled data at t=0** | Medium — implied | **MEDIUM.** Doc 07's entire cold-start (public corpora + synthetic + LLM-as-labeler + human audit) is built on this. If a partner shares a corpus, cold start gets much easier — but you inherit a **DPA obligation before you have a product to sell**, which is a real trap, not a gift. |
| C2 | **No usable public EN/BM/ZH code-switched PII corpus exists** | Low — *this is a research task, not a fact* | **MEDIUM.** If one exists, doc 07's synthetic-generation effort shrinks materially. Flagged in §3 for verification; do not let this assumption harden by repetition. |
| C3 | Synthetic BM/ZH PII can be generated at sufficient quality by an LLM with a human audit loop | Low | **HIGH.** This is the load-bearing assumption of the whole beachhead. If synthetic BM data is too unrealistic to train on, decision #4 (multilingual beachhead) has no cheap path and doc 08 gains a Top-3 risk. |

### D. Technical environment

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| D1 | **Chromium only** (Chrome + Edge), Manifest V3 | High — founder-adjacent | **LOW–MEDIUM.** Firefox's MV3 differs (persistent background pages; blocking webRequest survives). Safari is a separate product. Deferred, not designed around. |
| D2 | **Target hardware = mid-range corporate laptop:** ~4-core x86, 8–16 GB RAM, integrated graphics, **no discrete GPU**. Realistically ~1–2 GB addressable by our extension before the user notices. | Medium | **HIGH.** Every number in docs 03 and 06 is derived from this. A 16 GB/discrete-GPU floor would make the model budget comfortable; an 8 GB floor makes vocabulary trimming mandatory rather than optional. **This assumption should be replaced with a real device survey from the first design partner.** |
| D3 | **WebGPU is not reliably available.** Assume CPU/WASM inference is the baseline; treat WebGPU as an optimization, never a requirement. | Medium | **MEDIUM.** If WebGPU is dependable in the target fleet, doc 06's latency budget loosens considerably. Enterprise Chrome policy may disable it — see §3, this is unverified and matters. |
| D4 | Provider chat UIs **churn their DOM structure on roughly a weekly cadence** | Low — folklore, not measured | **MEDIUM.** Doc 05's adapter layer and selector-breakage strategy are sized for this. If churn is monthly, the maintenance tax is smaller than doc 00 claims; if it's daily, the adapter needs to be self-healing, not just self-reporting. |

### E. Product scope

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| E1 | **Phase 0 surfaces = ChatGPT + Claude** | Medium | **LOW.** Adding Gemini is ~1 adapter. The count matters more than the identity. |
| E2 | ~~De-pseudonymization is designed (doc 04) but not built until Phase 1~~ → **De-pseudonymization is KILLED. Not an assumption — a closed decision** (founder, 2026-07-16). Doc 04 designs the mechanism and documents the kill's implications; it does not re-decide. | **N/A — closed.** Confidence is not a meaningful axis for a decision. *(Was: Medium — a rating scored while the feature was still pending review.)* | **N/A — closed.** *(Was: LOW–MEDIUM.)* Nothing downstream may assume rehydration ships. **To reopen requires a mechanism that keeps plaintext out of the provider's persisted DOM entirely** — not a mitigation, a different architecture. See "reopening E2" below. |
| E3 | The **improvement loop is not live in Phase 0** — feedback is captured, not trained on | High | **LOW.** Doc 07 designs it; nothing depends on it running during the demo. |

#### Reopening E2 — what it would actually take

E2 sat in this table as an assumption because it *was* one: the earlier framing had rehydration
designed-but-deferred, pending doc 04's verdict. **That framing is dead.** It is recorded here as a
closed decision so that no downstream doc re-derives it as an open question.

**The reason matters more than the verdict, because the wrong reason reopens it.** Rehydration does
**not** violate invariant **I1** (doc 01 §5) — nothing crosses B3 → B4. A reader checking it against
the invariant table finds no violation and concludes it's safe. **That reasoning is wrong.**
Rehydration writes plaintext back into the provider's **persisted, server-synced** DOM (B2 → B1),
where their *legitimate* features — edit-message, rich-text copy handlers, autosave, analytics — can
re-serialize it to their server. It doesn't break I1; **it defeats I1's purpose**, and it falsifies
the scoped claim doc 02's compliance story rests on.

**A reopening therefore requires an architecture, not a mitigation.** Specifically: a way to show the
user the rehydrated answer *without* the plaintext ever entering the provider's DOM — e.g. rendering
it in our own shadow-DOM surface composited over theirs, which is a different feature with a different
fragility profile, not a patch to this one. **Pressure to reopen will come from the demo** (it's the
most impressive moment in the product). That pressure is not a reason.

### F. Legal and compliance

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| F1 | **No regulatory claims made.** Positioned as a control, not a certification. No "helps you meet PDPA." | Medium | **MEDIUM.** Claiming compliance raises the bar to audited controls, DPAs, and residency on day one. Sales will push for the claim; doc 02 explains why granting it is expensive. |
| F2 | **Malaysian PDPA is the primary regime**; GDPR applies only where an EU data subject's data transits | Medium | **MEDIUM.** Doc 02's compliance section is ordered PDPA-first. A European first customer inverts that ordering. |
| F3 | ~~Phase 1 file scanning lands in **ap-southeast-1 (Singapore)** with in-Malaysia residency as a later upgrade~~ → **CORRECTED (doc 02 §6.2).** Phase 1 files land **in-country (`ap-southeast-5`) for Malaysian tenants from day one.** Residency is a **per-tenant config**, not a global choice; `ap-southeast-1` serves non-MY tenants. | **High** on the premise (U13 resolved: `ap-southeast-5` GA 2024-08-22); **Medium** on execution (U17 — per-service availability unverified) | **LOW, and it moved in our favour.** The old assumption implied a Transfer Impact Assessment in every Malaysian deal, forever (PDPA s129's whitelist is repealed — transfers now need a lawful ground + TIA, 3-year validity). Landing in-country means the question is **never asked**. Residual risk is **operational, not legal**: multi-region ops at A1, and U17. |
| F4 | **Zero-retention is contractually assertable** — we can commit to not persisting scanned file content | Medium | **HIGH.** This is doc 02's central compliance promise. If any part of the pipeline needs to persist content (e.g., for async retry or debugging), the promise weakens to "short retention," which is a materially worse answer on a security questionnaire. |

---

## 3. Unverified claims register

Every one of these appears somewhere downstream. **None may be stated as fact until checked.** Each
carries the doc that must resolve it.

| ID | Claim | Basis | Resolve in |
|---|---|---|---|
| ~~U1~~ | ✅ **RESOLVED — TRUE.** No documented NRIC checksum; validation is structural. ⚠️ **New finding: a hobbyist repo claims ISO 7064 Mod 11,2 by trial-and-error fitting. KILLED — do not implement.** A phantom checksum silently rejects *valid* ICs: a **recall collapse**, failing invisibly, in the layer whose value is being deterministic. | [Wikipedia](https://en.wikipedia.org/wiki/Malaysian_identity_card); founder-verified independently | ✅ doc 03 §2.1 |
| ~~U2~~ | ✅ **RESOLVED — TRUE.** `YYMMDD-PB-###G` confirmed; **full PB code table obtained**; **exactly 14 of 100 codes unassigned** (`00`, `17`–`20`, `69`, `70`, `73`, `80`, `81`, `94`–`97`). ⚠️ **Residual gap: the gender digit's odd/even rule is NOT confirmed** — widely repeated, unverified. **Do not gate on it.** | [Wikipedia](https://en.wikipedia.org/wiki/Malaysian_identity_card); code count founder-verified | ✅ doc 03 §2.1 |
| ~~U3~~ | ✅ **RESOLVED individually, never as a block** (doc 03 §2.4): **LHDN TIN** ✅ verified (`IG` + 9–11 digits; legacy `SG`/`OG` unified 2023-01-01) · **SSM 12-digit** ✅ verified (`YYYY`+`XX`+`NNNNNN`, from 2019-10-11) · **Passport** ⚠️ medium (letter + 8 digits) · **Old-format IC** ❌ **unverified — not shipping Phase 0** · **EPF/KWSP** ❌ **8 bare digits — not L1-detectable at all** | OECD TIN sheet, SSM announcements, MS Purview entity defn | ✅ doc 03 §2.4 |
| ~~U4~~ | ✅ **RESOLVED — TRUE, and the estimate was nearly exact: 0.28% off, not the "~1%" this entry used to claim.** The card states **86M backbone** + **190M embedding** (250K vocab) — **and NO total.** Derived from `config.json` (`vocab_size: 251000` × `hidden_size: 768`): **192.8M embedding + 86M = 278.8M ≈ ~279M** — vs. the **278M** estimate. **~69% of the model is a lookup table.** 🔴 **Corrected 2026-07-17:** this entry read *"= 280M total"* sourced to the model card. **86 + 190 = 276, and the card states no total** — the figure was neither the sum nor the citation it claimed. **Our arithmetic was right and got marked down against an invented number.** Nothing downstream moves: the 86M floor and every trimmed row stand. | Model card *(86M · 190M · 250K only)* · **[`config.json`](https://huggingface.co/microsoft/mdeberta-v3-base/raw/main/config.json) for the exact figures** · **total is DERIVED, not cited** | ✅ doc 03 §4.1 |
| ~~U5~~ | ✅ **RESOLVED — CONFIRMED on both axes.** Trim to ~70K → embedding **192.8M → ~54M (−72%)**, total **~279M → ~140M (~140 MB int8)** *(stock total corrected 2026-07-17 — see U4)*. *(Est. was ~70% cut → ~135M/~135 MB.)* 🔴 **But it exposed a floor U5 never mentioned: the 86M backbone is irreducible by trimming.** Below ~130 MB requires **distillation** — unbudgeted. **New doc 08 risk.** ⚠️ **60–80K is still judgement, not measurement — and the trim spike is blocked on the corpus (U14/C2).** | Arithmetic on the confirmed U4 figures | ✅ doc 03 §4.2/§4.3 |
| ~~U6~~ | 🔴 **RE-SPECIFIED 2026-07-17 by doc 06 §3 — NOT resolved. Split into U6-a and U6-b.** The claim read: *"On-device L2 inference on a few hundred tokens = 30–100 ms on D2 hardware."* **It was specified against the workload where latency does not matter.** Typing is debounced and keystrokes are ~100–200 ms apart *(estimate)*, so **the scan runs in the gap the user's own hands create and the cache warms for free.** *"A few hundred tokens"* is a typed prompt. **Paste is one event followed by Enter — the only input on the critical path — and U6 never mentioned it.** | Doc 06 §2 · doc 05 §6.3 | ✅ **re-specified**, see U6-a / U6-b |
| U6-a | **Per-debounce scan latency on a typed prompt**, D2 hardware | **Governs CPU and battery, not the gate** (doc 06 §2.1). A missed debounce has **no user-visible cost** — the next one supersedes it. **Deprioritized: measure it, don't gate on it.** If it fails we are a CPU hog, which is a real problem and a fixable one, not a design failure. | doc 06 / code |
| U6-b 🔴 | **Time from the `paste` event to a gate-usable verdict**, at P50/P95 paste length, on D2 | **The number the gate actually lives on, and the package's highest priority.** The cache is **cold by construction** on doc 00 §6's dominant threat (*"dumps a spreadsheet row or a customer record"*). Latency is `ceil(tokens/512) × per-chunk` (**512 cited**, doc 06 §4.2), **not one forward pass.** ⚠️ **Its pass criterion is B3-blocked:** the deadline is the user's measured `Ctrl+V` → `Enter` interval, which needs a **design partner on real work** — **no number invented** (doc 06 §3.3). **The latency-vs-pasted-tokens curve is ours and needs no human; the threshold on it is the partner's.** **Mitigated but not removed by [ADR 0013](docs/adr/0013-two-stage-verdict.md)'s L1 short-circuit** — L1 gates the *dangerous* paste sub-ms; **U6-b governs the wait to say *"clean."*** | doc 06 / code — **week 1 for the curve, B3 for the threshold** |
| U7 | Tesseract.js OCR ≈ 1–3 s/page on D2 hardware | Widely repeated, not measured by us | doc 05 (Phase 1) |
| U8 | Chrome Enterprise Premium ships native DLP on paste/upload events | Believed true; central to doc 00's commoditization argument | doc 00 |
| U9 | Microsoft Purview provides endpoint DLP covering browser upload paths | Believed true | doc 00 |
| ~~U10~~ | ✅ **RESOLVED — TRUE. Exactly 30 seconds**, and the belief that "behavior has changed across Chrome versions" is no longer load-bearing: *"After 30 seconds of inactivity. Receiving an event or calling an extension API resets this timer."* **Bonus fact ADR 0006 wanted: messages from an offscreen document reset the timer** (Chrome 109+) — so the two lifecycles ADR 0006 treats separately are **coupled in our favour.** Also: a single event/API call > 5 min, or a `fetch()` response > 30 s, kills the SW. | [Chrome SW lifecycle docs](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) | ✅ doc 05 §5.1 |
| ~~U11~~ | ✅ **RESOLVED — TRUE. 🔴 And its inference is STRUCK.** The **claim** holds: dNR matches on URL, resource type, method, domains, tab, response headers — **never bodies**, by design (*"extensions modify network requests without intercepting them and viewing their content"*). **The conclusion recorded here — *"dispositive: the observer must be a MAIN-world patch"* — was a non-sequitur** and it drove the design for three docs. dNR is **not the only observational API**: `chrome.webRequest` survived MV3 for observation (*"Aside from `webRequestBlocking`, the webRequest API is unchanged and available for normal use"*) and `onBeforeRequest` still supplies `requestBody`. **Eliminating dNR never selected MAIN-world.** → [ADR 0012](docs/adr/0012-observer-uses-webrequest.md) reverses the mechanism. | [Chrome dNR docs](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) · [Chrome webRequest docs](https://developer.chrome.com/docs/extensions/reference/api/webRequest) | ✅ doc 05 §4.1 |
| U12 | **From the ISOLATED world** (content script, `document_start`), a capture-phase `document` listener fires before React 17+ root-container delegation, **and `stopImmediatePropagation()` crosses the world boundary** to suppress the page's own handler | Believed true — content scripts and page scripts share one DOM event dispatch, having separate JS contexts but not separate event systems. **The entire gate depends on this** (ADR 0005). Well-established but under-documented. **Must be proven empirically, per surface — not reasoned about.** If it fails, the gate mechanism needs rework, not tuning. | doc 05 / code — **week 1** |
| ~~U13~~ | ✅ **RESOLVED 2026-07-16 — TRUE.** AWS Asia Pacific (Malaysia), `ap-southeast-5`, **GA since 2024-08-22**, three AZs. | [AWS launch announcement](https://aws.amazon.com/blogs/aws/now-open-aws-asia-pacific-malaysia-region/) | ✅ doc 02 §6.2 — **corrects F3** |
| U14 | No usable public EN/BM/ZH code-switched PII corpus exists (see C2) | Assumption masquerading as a fact — treat with suspicion | doc 07 |
| U15 | WebGPU availability under enterprise Chrome policy | Unknown. Materially affects doc 06's budget. | doc 06 |
| U16 | **macOS force-install specifics**: that a `.mobileconfig` must be *signed* (vs. merely installable-with-warning), and that root-owned `/Library/Preferences/com.google.Chrome.plist` is no longer an accepted policy source | Founder claim, CTO not confident. Requirements have moved across macOS versions. **Windows path (HKLM) is High confidence and unaffected** — this gap only touches the secondary platform. | doc 05 |
| U17 | **`ap-southeast-5` per-service availability** for the Phase 1 stack (ECS/Fargate, S3, KMS, RDS). Not every AWS service ships in every region, and this one is young. | Core services near-certain; something in the file pipeline may not be there. **Must be checked before doc 08 sizes Phase 1** — the residency decision (F3, doc 02 §6.2) assumes the stack can actually run there. | doc 08 (before Phase 1 sizing) |
| U18 | **PDPA DPO appointment threshold and qualification requirements.** The obligation itself is confirmed (in force 2025-06-01, binds controllers **and processors**); the *threshold* sits in supplementary guidelines and is not yet read. | Amendment confirmed via counsel-grade secondary sources; the guidelines themselves not read. **We may already be non-compliant on a date that has passed.** | doc 08 (cost line) |
| ~~U19~~ | ✅ **RESOLVED on mechanism — and the size worry was never proportionate.** Confirmed: `managed` is **read-only** (*"trying to modify this namespace results in an error"*) and populated by admins *"using a developer-defined schema and enterprise policies"* — exactly ADR 0009's assumption. **Chrome documents no quota for `managed`** (it does for `local` 10 MB, `sync` 100 KB / 8 KB per item, `session` 10 MB) — **but the payload is a ~32-byte key, and `sync`'s 8 KB per-item floor clears it ~256×** *(derived)*. **The residual is schema + delivery, i.e. B3 — which was always the real risk and is not a `chrome.storage` question.** 🔴 **The finding ADR 0009 didn't ask for:** *"`storage.managed` is exposed to content scripts, but this behavior can be changed by calling `setAccessLevel()`"* — **the tenant key defaults to B2, not B3.** Third instance of the letter-vs-purpose trap. | [Chrome storage docs](https://developer.chrome.com/docs/extensions/reference/api/storage) | ✅ doc 05 §8.2 |
| U20 | **Each Phase 0 surface submits prompts as an HTTP request, not a WebSocket frame** | **New, raised by [ADR 0012](docs/adr/0012-observer-uses-webrequest.md).** `webRequest` sees the WS **handshake**, never the frames — so a surface that moved prompt submission onto an open WebSocket would be **invisible to the observer**. Not believed likely (both surfaces are understood to POST + stream a response) but **unverified, and it is the one thing that would force a MAIN-world `WebSocket.send` patch *in addition* for that surface.** Observable during the U12 spike at zero marginal cost. | doc 05 / code — **with the U12 spike** |
| U21 🟠 | **Tokens-per-character for BM/ZH under the trimmed vocabulary** | **New, raised by doc 06 §4.3.** Chunk count is set by **tokens**; the user pastes **characters**. **CJK produces far more tokens per character than English** — doc 06 estimates **~3×**, so **the same paste box is ~9 chunks in Chinese vs ~3 in English** *(estimate)*. **Direction is certain** (Chinese has no whitespace; doc 03 §3.3 already says CJK "sequence length explodes"); **the ratio is unverified and it sets the paste budget in the wedge's own language.** 🔴 **Same measurement as doc 03 §4.2's fertility spike** — one experiment settles **accuracy, latency and chunk count** (doc 06 §4.4). **One hour with a tokenizer and a corpus — and it is blocked on the corpus (U14/C2 → C3).** | doc 06 / doc 07 |
| U22 | **COOP/COEP via manifest → `SharedArrayBuffer` → ONNX Runtime Web multi-threading** in an offscreen document | **New, raised by doc 06 §6.4.** The offscreen document is **our own page**, so we may be able to set the headers ourselves and get threaded WASM. **Unlike WebGPU (U15) this does not depend on the customer's Chrome policy** — which makes it the more dependable lever on exactly the managed fleet where U15 is most likely to be disabled. **Both the manifest keys and ORT's threading requirements are unverified.** §4.2's chunks are embarrassingly parallel, so the payoff lands on the paste path. | doc 06 / code |

**U6-b and U12-a are the two that can kill the design**, not merely dent it. **U12-a** invalidates the
gate mechanism *(and per doc 05 §1, U12 is **three** sub-tests with three blast radii — never test or
report it as one claim)*. **U6-b** invalidates the zero-friction path that makes the gate tolerable —
*(and note it is **U6-b**, not U6-a: doc 06 §3 found the original claim was specified against the
typing workload, where the user's own keystroke gaps hide the latency)*.

**Both are cheap and both should be tested in week 1, before anything else is built** — with one
honest caveat added 2026-07-17: **U6-b's *curve* is ours and needs no human, but its *threshold* is
B3-blocked**, because the deadline is the user's measured `Ctrl+V` → `Enter` interval and that needs a
design partner on real work (doc 06 §3.3). **This couples the package's #1 engineering number to its #1
validation item.** Doc 08 carries them as ranked risks.

---

## 4. Deliberate non-assumptions

Things I am explicitly **refusing** to assume, because assuming them is how this category of product
usually dies:

- **That users want this.** They don't. The buyer wants it; the user experiences it as friction.
  Every UX decision is made under that constraint, not in denial of it.
- **That detection quality will be good enough at v1.** It won't. Doc 07 sets a precision floor and
  designs around being wrong, rather than assuming accuracy arrives on schedule.
- **That the extension can't be removed.** In Phase 0 it can, trivially. Doc 00 states this plainly
  rather than implying a control that doesn't exist.
- **That a determined insider is in scope.** They aren't, and no browser extension will ever stop
  someone photographing their screen. Doc 00's threat model says so in the first section.
- **That LLM providers are neutral about our existence.** Auto-submit and body-rewriting are exactly
  the behaviors that attract ToS attention. Decision #8 exists partly for this reason.

---

## 5. Correction log

Record founder corrections here as they arrive, so downstream docs can be re-derived rather than
re-argued.

| Date | ID | Was | Now | Docs to re-open |
|---|---|---|---|---|
| 2026-07-17 | 🔴 **U6 — specified against the wrong workload** | *"On-device L2 inference on a few hundred tokens = 30–100 ms on D2."* Called *"the highest-priority number to measure"* and one of *"the two that can kill the design."* Doc 01 §4's gate diagram annotates the cache-miss branch *"rare path · costs one extra Send."* | **The priority was right. The input was wrong, and so was "rare."** **Typing is not on the critical path** — keystrokes are ~100–200 ms apart *(estimate)* and the debounced scan runs **in the gap the user's own hands create**, so the cache warms for free. *"A few hundred tokens"* **is** the typing case. **Paste is one event followed by Enter: no gap, nothing to hide the scan behind — and per doc 00 §6 it is the *dominant* real-world leak case.** So: **paste is rare among sends and universal among the sends we exist to catch. The cache is cold by construction on precisely the threat the product is sold against.** → **U6-a** (typing · CPU/battery · deprioritized) and **U6-b** (paste · the number the gate lives on · **B3-blocked pass criterion**, doc 06 §3.3). **Rescued structurally, not by optimizing:** [ADR 0013](docs/adr/0013-two-stage-verdict.md)'s **L1 short-circuit** gates the *dangerous* paste in **sub-ms** — a spreadsheet row is **structured identifiers**, which is L1's job — so **the full L2 wait is only ever paid to say *"clean,"* on a prose paste, where nothing was at stake.** **Doc 00 §1.2's inversion ("best at the detections that matter least") pays us back for once.** | doc 06 §2/§3 (**done**), ADR 0013 (**new**), `ASSUMPTIONS.md` U6 (**split**). **Doc 01 §4's *"rare path"* annotation is true-across-all-sends and misleading-about-the-ones-that-matter — flagged, not rewritten.** |
| 2026-07-17 | 🔴 **Doc 03 §6's trimming prediction — true per token, silent on token count** | Doc 03 §6: *"Vocabulary trimming should cut memory ~50% and latency **barely at all** (embedding is lookup, backbone is compute)."* Doc 03 §4.2 names fertility as **the trim metric**, framed purely as an **accuracy** risk. | **The prediction's reasoning is correct and its scope is narrower than it reads.** Trimming removes embedding rows, embedding is a lookup → **per-token cost is unchanged.** ✅ **But trimming changes the tokenizer, and therefore the token count.** Drop entries BM/ZH was using and those words fall back to shorter pieces or bytes → **fertility rises → the sequence lengthens → the backbone runs on more tokens.** **Per-token latency is flat; per-*scan* latency is not.** 🔴 **And with `max_position_embeddings` = 512 (cited — doc 03 never recorded it), longer sequences cross the window sooner, so fertility does not merely lengthen the sequence: it adds whole chunks** (`ceil(tokens/512)` forward passes). **So the memory fix taxes the latency budget, in the wedge's languages specifically.** **Doc 03 §4.2's fertility spike is simultaneously the accuracy metric, the latency metric and the chunk-count metric — one experiment, three budgets** (doc 06 §4.4). **It also gives the distillation risk a second entrance that never involves a memory decision**: if fertility forces a *larger* vocabulary, we never get the halving and miss ~140 MB. ⚠️ **Still blocked on the corpus (U14/C2 → C3)** — which now blocks the **latency** budget too, raising C3's blast radius. | doc 06 §4.4/§6.2 (**done**), new **U21** (tokens-per-char BM/ZH). **Doc 03 §6's prediction stands as written and is now scoped** — flagged, not rewritten: it was never wrong, only narrower than it reads. Doc 08: **one risk, two entrances.** |
| 2026-07-17 | 🔴 **U4 / doc 03 §4.1's total — the one fabrication that shipped** | Doc 03 §4.1's parameter table carried a **Total** row of **280M** with its Source column reading **"Model card"**, and the prose read *"The card says 86M + 190M = 280M."* Propagated to U4, U5, doc 03 §0/§4.2/§6/§7/Sources, and CLAUDE.md §6.2. CLAUDE.md §9 recorded that doc 03's parameter arithmetic *"was re-derived from scratch and matched."* | **Two defects, and the second is the serious one.** (1) **86 + 190 = 276, not 280** — a sum that does not add, in the document whose first line is that it *"does arithmetic rather than argument."* (2) 🔴 **The model card states no total at all.** Verbatim, the card's entire parameter claim is: *"It has 86M backbone parameters with a vocabulary containing 250K tokens which introduces 190M parameters in the Embedding layer."* **So the Source column read "Model card" beside a number the card does not contain.** That is **not** an arithmetic slip — **it is the confident fabrication the §How-to-use rule exists to prevent**, committed against an *external* source after this package had found the same defect four times against its own *internal* ones. **The truth, derived from [`config.json`](https://huggingface.co/microsoft/mdeberta-v3-base/raw/main/config.json) (`vocab_size: 251000` × `hidden_size: 768`): 192.8M + 86M = 278.8M ≈ ~279M.** **The total is ours to derive and ours to own — it can never be cited.** **Everything load-bearing survives:** the 86M floor, the trim table (**every trimmed row recomputes exactly — they were computed, not cited**), and the lookup-table thesis (**~69%**, not 68% — the old figure came from dividing the card's rounded 190M by the invented 280M). **Two ironies to keep:** our **278M estimate was 0.28% off**, i.e. **more accurate than the "citation" that marked it down**; and **~279M is within 0.5% of 280M**, which is exactly why it survived — **the wrong number looked right, and the one-second check was never run.** **Two gaps closed in passing:** vocab is **251,000** (the *"precise token count is unverified"* hedge is retired) and **`max_position_embeddings` = 512** — **doc 06 cannot budget the paste path without it**, since a long paste chunks to `ceil(tokens/512)` forward passes. | doc 03 §0/§4.1/§4.2/§6/§7/Sources (**done**), `ASSUMPTIONS.md` U4/U5 (**done**), CLAUDE.md §6.2 (**done**) and **§9 (done — its "re-derived and matched" claim was false and is now the standing warning)**. **Doc 06 inherits the 512 window.** |
| 2026-07-17 | **New: U11's inference / the observer mechanism** | U11 recorded the claim *and a conclusion*: dNR cannot inspect request bodies — *"and if so it's **dispositive**: the log-only fetch observer **must** be a MAIN-world patch, since dNR structurally cannot see prompt content."* Doc 01 §2 and §5 place the observer in the MAIN world / **B1** accordingly. | **The claim is TRUE. The inference is a non-sequitur, and it had been driving the design.** It runs *dNR can't see bodies → no extension API can → patch the page*; **the middle step is false.** `chrome.webRequest` survived MV3 for observation (*"Aside from `webRequestBlocking`, the webRequest API is unchanged and available for normal use"*) and `onBeforeRequest` still supplies `requestBody` *(cited)*. **Eliminating dNR never selected MAIN-world.** And the option it skipped is **better**, on two grounds *(amended 2026-07-17 — this entry first argued "an independent check must fail independently," which the founder pressed and which overstated it: the gate fails on **DOM** changes, a patch fails on **transport** changes, so they coincide only in a narrow corner. Right instinct, wrong argument)*. **(a) Enumeration is where silent misses come from.** A MAIN-world patch sees only the transports we thought to enumerate — `fetch`, XHR, `sendBeacon`, `WebSocket`, **and `fetch` inside a Web Worker, which a `window.fetch` patch never touches because a worker has its own global.** **Unbounded, silent blind-spot set.** `webRequest` enumerates nothing over HTTP; its blind spot is **exactly one** (WS frames — **U20**), known and testable in week 1. **The observer exists to catch silent misses and must not have an open-ended set of its own.** **(b) A MAIN-world patch can break the provider's app** — force-installed estate-wide, it must never throw; *"your DLP tool broke ChatGPT for 150 people"* ends the account. `webRequest` is passive and structurally cannot. → **[ADR 0012](docs/adr/0012-observer-uses-webrequest.md).** **Found by reading the claim's *inference* rather than its *verdict* — an entry in our own register is a cross-reference like any other.** | doc 05 §4 (**done**), ADR 0012 (**new**), `ASSUMPTIONS.md` U11 (**done — verdict kept, inference struck**). 🔴 **doc 01 §2 + §5 put the observer in B1 and are now wrong — FLAGGED, not touched.** New gap **U20**. |
| 2026-07-17 | **New: doc 04 §8's two handoffs to doc 05** | (1) *"**Deterministic rewrite** is load-bearing: … **the same input must always produce the same output**, or the token never matches."* (2) The vault bug: a reclaimed offscreen document restarts numbering, so *"the model sees `PERSON_1` meaning two different people in one thread."* | **Both are narrower than stated, and doc 05 found it by building them — the same shape as doc 04 correcting doc 03 §2.3.** **(1) The token cannot mismatch: we hash the string we wrote.** Determinism only enters if the rewrite is computed *twice*, so **compute once and carry the string** retires it by construction. **The property actually load-bearing is *idempotency*** — `rewrite(rewrite(x)) == rewrite(x)` — which doc 04 never names and which bites: **L2 is a NER model and `PERSON_1` is exactly the shape it tags as a person**, so the pipeline eats its own tail, **and the token masks the loop for 60 s so testing misses it.** Fix is one L1 placeholder-grammar mask, using the L1-masks-before-L2 ordering we already have. **(2) The failure modes are asymmetric and doc 04 named only one.** Restarting numbering **conflates two people into one token** — *wrong* output about named individuals. A **monotonic counter** **splits one person into two tokens** — *degraded* output. **The counter is an integer: no value, no hash, no salt, no exposure — and it converts the dangerous failure into the benign one** → **[ADR 0011](docs/adr/0011-monotonic-placeholder-numbering.md).** **Doc 04 §2.4's aggressive eviction and doc 05 §5.3's durability requirement stop competing.** | doc 05 §5.3 + §6.2 (**done**), ADR 0011 (**new**). **doc 04 §8 — dated note FLAGGED, not written.** doc 07 inherits the L1 placeholder rule as a **detection** requirement. |
| 2026-07-17 | **New: the rehydrate column in the form-factor argument** | **Doc 00 §3** and **ADR 0002** both justified the extension form factor with a comparison column **"Can pseudonymize + rehydrate"**, extension marked **"✅ only option"**, and prose arguing a proxy *"cannot rehydrate the model's reply on the way back."* **Doc 00 §2.3** argued against Layer 2 with *"it cannot pseudonymize-and-rehydrate."* | **Rehydration is killed** (doc 01 §5, founder-closed 2026-07-16) — **and not because the extension can't do it.** So the form-factor argument **credited the extension with a capability this package concluded is a liability, and then used it as a reason to choose the extension.** Separately, **"only option" was contradicted by the same table's enterprise-browser row**, which also scores ✅; the prose below always knew — the advantage over an enterprise browser is **deploy cost, never capability.** **Verdict unchanged, and the argument gets stronger:** it now rests only on **typing-time detection** and **in-composer pseudonymization**, both of which ship. The claim narrows from *"DOM access, uniquely"* to *"DOM access, cheaply"* — weaker, true, and still sufficient. **Found by the §5 cross-reference audit during doc 05's required reading: no research, only re-reading.** Note the shape — **doc 00 §6 carried the kill correctly and nobody returned to §3**, the same orphaned-pointer failure as the E2 entry below. | doc 00 §2.3 + §3 (**corrected, dated notes**), ADR 0002 (**corrected, dated note**). **doc 05 unaffected** — it never depended on the claim. |
| 2026-07-16 | **New: I2 / the mapping vault** | Doc 01 §5's **I2** described the vault as holding `PERSON_1 → John Tan` and called it **"the de-pseudonymization key."** | **The artifact isn't built** (doc 04 §2.2). That row was written while **rehydration was still a feature**, and rehydration was the **reverse map's only consumer**. Pseudonymization only ever queries `value → placeholder`, which a **salted hash** answers — so there is **no path** from `PERSON_1` back to a name. **Killing rehydration didn't just close the hole I2 guards; it deleted the asset that made the hole worth exploiting.** ⚠️ **But the table is still sensitive at rest** — we hold the salt and names are a small keyspace, so hashing is **blast-radius reduction, not a security boundary** (doc 04 §2.3 — the same reasoning ADR 0009 killed for codenames, and it nearly recurred while writing that section). **I2 still binds**, as defense-in-depth. | doc 01 §5 I2 row (**corrected, dated note**), doc 04 §2.2/§2.3/§7. **Doc 05** inherits vault eviction vs. the offscreen lifecycle — **losing a live vault mid-thread is a correctness bug**, not a perf one. |
| 2026-07-16 | **New: doc 03 §2.3's UI resolution** | Doc 03 §2.3 resolved the NRIC/SSM ambiguity by *"let the modal ask the human."* | **Superseded by doc 04 §5.2. The finding is unchanged** — collision real, day filter defeated by construction, ~86% holds. **Only the resolution moves.** Asking the user hands the hardest classification in the product to the person with the **least incentive to get it right** (doc 00 §4) — **doc 00 §1.6's "active poisoning" in a new costume.** And it's usually **irrelevant**: the class only matters **if tenant policy differs between NRIC and SSM.** **Ambiguity is a policy question, not a user question** — default to the more restrictive class, let the **admin** configure, leave **Ignore+reason** as the escape hatch. | doc 03 §2.3 (**corrected, dated note → doc 04 §5.2**), doc 04 §5.2 |
| 2026-07-16 | **New: the fragmentation argument** | Doc 00 §5 argued the multilingual wedge from **tokenization of identifiers**: *"an English-first tokenizer shreds `890101-14-5555` into digit soup."* Doc 01 §3 repeated the framing. | **Wrong on two counts** (doc 03 §3). (1) **Multilingual tokenizers split digit runs too** — it's standard practice, not an English-first pathology. (2) **L1 masks the IC before L2 ever sees it** — so the tokenizer's digit handling is irrelevant to the very example used to argue for it. **Doc 01 §3 stated the refutation in the same sentence that cited the claim.** **The wedge survives and relocates** to **BM/ZH text NER** — Malay morphology, Chinese without whitespace, code-switched context — which is a **stronger** argument because it survives contact with the architecture. **ADR 0003 unaffected:** *"head start, not moat"* was never a tokenizer claim. | doc 00 §5 (**corrected, dated note**), doc 01 §3 (**corrected, dated note**), doc 03 §3/§3.4. **Neither doc silently patched.** |
| 2026-07-16 | F3 / U13 | Phase 1 files land in **Singapore** (`ap-southeast-1`), Malaysia residency "a later upgrade"; U13 (does the Malaysia region exist?) unverified. Cross-border transfer flagged as real, permanent friction in every MY sale. | **Premise was stale.** `ap-southeast-5` has been **GA since 2024-08-22** — the "later upgrade" was already available before the assumption was written. **Files land in-country for MY tenants from day one; residency becomes a per-tenant config.** This deletes a Transfer Impact Assessment from every Malaysian deal rather than scheduling one. Cost moves from a **per-deal legal tax** to a **bounded ops tax** (~$100–200/mo fixed, multi-region at A1). New gap: **U17** (per-service availability in a young region). | doc 02 §6.2 (**done, this commit**), doc 08 (Phase 1 sizing must use U17; multi-region ops is a cost line) |
| 2026-07-16 | **New: PDPA** | Docs assumed PDPA 2010 as the baseline regime, processors bound only via contract. | **The statute moved and we hadn't noticed.** Act A1554 (2024) phased in across 2025: **processors are directly liable under the Security Principle since 2025-04-01** (up to RM1m and/or 3 years); **DPO appointment + breach notification since 2025-06-01**, binding processors too; **s129 cross-border whitelist repealed**, replaced by a risk-based framework (5 grounds, TIA valid 3 years). **Net: strengthens the §1.2 dissolution argument** — our processor promise now carries criminal exposure in the buyer's own jurisdiction, which beats any attestation. **But it obliges us to appoint a DPO and be breach-ready against dates already past.** | doc 02 §6.1 (**done**), doc 08 (**cost line, overdue**), new gap **U18** (DPO threshold) |
| 2026-07-16 | E2 | Rehydration recorded as an **assumption**: "designed (doc 04) but not built until Phase 1," Medium confidence, LOW–MEDIUM blast radius. Doc 01 §5 called it a "genuine, unresolved leak vector" and deferred the verdict to doc 04; doc 01 §7 made it "Phase 1, **if doc 04 clears it**." | **Not an assumption — a closed decision.** Founder killed rehydration 2026-07-16. Not deferred, not pending assessment, not scheduled for any phase absent a strong new reason. Confidence/blast-radius are **N/A — closed**; both prior ratings were scored while the feature was still under review and carried a false implication that the question was live. Doc 04 documents the mechanism and this kill's implications; **it does not re-decide.** *Carry-forward note: doc 00 §6 already stated the kill correctly and pointed at doc 01 §5 — but §5 didn't carry it, leaving the pointer dangling. This entry closes that gap.* | doc 01 §5/§7/§8 (**done, this commit**), ASSUMPTIONS E2 (**done**). Doc 00 §6 verified — **no change needed.** Doc 02 must not claim rehydration as a capability. Doc 04 inherits the kill as a premise. |
| 2026-07-16 | B3 | CTO implied force-install requires Chrome Enterprise Core / cloud-managed browser estate | **Wrong.** `ExtensionInstallForcelist` works from OS-level machine policy with no cloud enrollment or licence. Windows = one registry key. macOS = signed config profile, heavier. Deployment hurdle materially lower than stated; **sales hurdle unchanged, so confidence stays Low.** | doc 00 (form-factor argument must not overstate the deployment barrier), doc 05, doc 08 |

*A1/A2 (2–3 engineers, 18 months) were confirmed as-is by the founder, not corrected — the constraint
is deliberate: solo would collapse the multilingual edge into regex-chasing, and more headcount would
let the performance budget go soft. No entry required.*
