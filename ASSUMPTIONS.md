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
| B3 | Customers have **managed Chrome** (or can adopt it) by Phase 1 | Low | **HIGH.** Decision #6 defers the real control to force-install. If the beachhead segment doesn't run managed browsers, **the enterprise control story never becomes real** and the product is permanently a nudge. This is arguably the single most dangerous assumption in this document. |
| B4 | Buyer's fear is concentrated on **public LLM chat UIs**, not IDE copilots or API traffic | Medium | **MEDIUM.** If the fear is really in the IDE, the browser extension is the wrong surface entirely and doc 00's form-factor argument has to be reopened. |

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
| E2 | **De-pseudonymization of LLM responses is designed (doc 04) but not built until Phase 1** | Medium | **LOW–MEDIUM.** It's the demo's most impressive moment, so there's pressure to pull it forward. Resist: it's also the most fragile DOM work in the product. |
| E3 | The **improvement loop is not live in Phase 0** — feedback is captured, not trained on | High | **LOW.** Doc 07 designs it; nothing depends on it running during the demo. |

### F. Legal and compliance

| ID | Assumption | Confidence | Blast radius if wrong |
|---|---|---|---|
| F1 | **No regulatory claims made.** Positioned as a control, not a certification. No "helps you meet PDPA." | Medium | **MEDIUM.** Claiming compliance raises the bar to audited controls, DPAs, and residency on day one. Sales will push for the claim; doc 02 explains why granting it is expensive. |
| F2 | **Malaysian PDPA is the primary regime**; GDPR applies only where an EU data subject's data transits | Medium | **MEDIUM.** Doc 02's compliance section is ordered PDPA-first. A European first customer inverts that ordering. |
| F3 | Phase 1 file scanning lands in **ap-southeast-1 (Singapore)** with in-Malaysia residency as a later upgrade | Low | **MEDIUM.** Cross-border transfer is real friction in a Malaysian enterprise sale. See §3 — AWS Malaysia region availability is unverified. |
| F4 | **Zero-retention is contractually assertable** — we can commit to not persisting scanned file content | Medium | **HIGH.** This is doc 02's central compliance promise. If any part of the pipeline needs to persist content (e.g., for async retry or debugging), the promise weakens to "short retention," which is a materially worse answer on a security questionnaire. |

---

## 3. Unverified claims register

Every one of these appears somewhere downstream. **None may be stated as fact until checked.** Each
carries the doc that must resolve it.

| ID | Claim | Basis | Resolve in |
|---|---|---|---|
| U1 | Malaysian NRIC has **no check digit**; validation is structural (date validity + birth-state code table), not arithmetic | My belief; contrasts with Luhn for cards | doc 03 |
| U2 | Malaysian IC format is `YYMMDD-PB-###G` where `PB` is a birth-state code and the final digit encodes gender | My belief | doc 03 |
| U3 | Other MY formats — old-format IC, passport, LHDN tax number, EPF/KWSP, company registration (ROC/ROB and 12-digit) | Not yet checked. **Each will be marked verified/unverified individually in doc 03, not asserted as a block.** | doc 03 |
| U4 | mDeBERTa-v3-base ≈ **86M backbone + ~192M embedding** (250k vocab × 768 hidden) | Arithmetic from published vocab/hidden sizes — the *arithmetic* is sound, the *inputs* need confirming | doc 03 |
| U5 | Vocabulary trimming to EN/BM/ZH (~60–80k tokens) cuts embedding params ~70%, landing ~278M → ~135M (~135 MB int8) | Estimate derived from U4. **Direction is reliable; magnitude is not.** | doc 03 |
| U6 | On-device L2 inference on a few hundred tokens = 30–100 ms on D2 hardware | **Estimate with no measurement behind it.** This number is load-bearing for the gate's synchronous-cache design — if it's 500ms, the typing-time cache is too often cold and the zero-friction path degrades. **Highest-priority number to measure.** | doc 03 / doc 06 |
| U7 | Tesseract.js OCR ≈ 1–3 s/page on D2 hardware | Widely repeated, not measured by us | doc 05 (Phase 1) |
| U8 | Chrome Enterprise Premium ships native DLP on paste/upload events | Believed true; central to doc 00's commoditization argument | doc 00 |
| U9 | Microsoft Purview provides endpoint DLP covering browser upload paths | Believed true | doc 00 |
| U10 | MV3 service workers terminate after ~30 s idle | Believed true; behavior has changed across Chrome versions | doc 05 |
| U11 | **`declarativeNetRequest` cannot inspect request bodies** | Believed true — and if so it's *dispositive*: the log-only fetch observer must be a MAIN-world patch, since dNR structurally cannot see prompt content | doc 05 |
| U12 | Capture-phase `document` listeners fire before React 17+ root-container delegation, and `stopImmediatePropagation()` reliably prevents React's synthetic handler | Believed true — **the entire gate depends on this.** Must be empirically proven against each target surface, not reasoned about. | doc 05 / code |
| U13 | AWS `ap-southeast-5` (Malaysia) exists and is generally available | Believed true | doc 02 |
| U14 | No usable public EN/BM/ZH code-switched PII corpus exists (see C2) | Assumption masquerading as a fact — treat with suspicion | doc 07 |
| U15 | WebGPU availability under enterprise Chrome policy | Unknown. Materially affects doc 06's budget. | doc 06 |

**U6 and U12 are the two that can kill the design**, not merely dent it. U12 invalidates the gate
mechanism; U6 invalidates the zero-friction path that makes the gate tolerable. Both are cheap to
test and should be tested in week 1 of Phase 0, before anything else is built. Doc 08 carries them
as ranked risks.

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
| — | — | — | — | — |
