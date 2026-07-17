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
| ~~U4~~ | ✅ **RESOLVED — TRUE, and the estimate was ~1% off.** mDeBERTa-v3-base = **86M backbone + 190M embedding (250K vocab) = 280M total.** *(Est. was 86M + ~192M ≈ 278M.)* **68% of the model is a lookup table.** | [Microsoft model card](https://huggingface.co/microsoft/mdeberta-v3-base); founder-verified directly | ✅ doc 03 §4.1 |
| ~~U5~~ | ✅ **RESOLVED — CONFIRMED on both axes.** Trim to ~70K → embedding **190M → ~54M (−72%)**, total **280M → ~140M (~140 MB int8)**. *(Est. was ~70% cut → ~135M/~135 MB.)* 🔴 **But it exposed a floor U5 never mentioned: the 86M backbone is irreducible by trimming.** Below ~130 MB requires **distillation** — unbudgeted. **New doc 08 risk.** ⚠️ **60–80K is still judgement, not measurement — and the trim spike is blocked on the corpus (U14/C2).** | Arithmetic on the confirmed U4 figures | ✅ doc 03 §4.2/§4.3 |
| U6 | On-device L2 inference on a few hundred tokens = 30–100 ms on D2 hardware | **Estimate with no measurement behind it.** This number is load-bearing for the gate's synchronous-cache design — if it's 500ms, the typing-time cache is too often cold and the zero-friction path degrades. **Highest-priority number to measure.** | doc 03 / doc 06 |
| U7 | Tesseract.js OCR ≈ 1–3 s/page on D2 hardware | Widely repeated, not measured by us | doc 05 (Phase 1) |
| U8 | Chrome Enterprise Premium ships native DLP on paste/upload events | Believed true; central to doc 00's commoditization argument | doc 00 |
| U9 | Microsoft Purview provides endpoint DLP covering browser upload paths | Believed true | doc 00 |
| U10 | MV3 service workers terminate after ~30 s idle | Believed true; behavior has changed across Chrome versions | doc 05 |
| U11 | **`declarativeNetRequest` cannot inspect request bodies** | Believed true — and if so it's *dispositive*: the log-only fetch observer must be a MAIN-world patch, since dNR structurally cannot see prompt content | doc 05 |
| U12 | **From the ISOLATED world** (content script, `document_start`), a capture-phase `document` listener fires before React 17+ root-container delegation, **and `stopImmediatePropagation()` crosses the world boundary** to suppress the page's own handler | Believed true — content scripts and page scripts share one DOM event dispatch, having separate JS contexts but not separate event systems. **The entire gate depends on this** (ADR 0005). Well-established but under-documented. **Must be proven empirically, per surface — not reasoned about.** If it fails, the gate mechanism needs rework, not tuning. | doc 05 / code — **week 1** |
| ~~U13~~ | ✅ **RESOLVED 2026-07-16 — TRUE.** AWS Asia Pacific (Malaysia), `ap-southeast-5`, **GA since 2024-08-22**, three AZs. | [AWS launch announcement](https://aws.amazon.com/blogs/aws/now-open-aws-asia-pacific-malaysia-region/) | ✅ doc 02 §6.2 — **corrects F3** |
| U14 | No usable public EN/BM/ZH code-switched PII corpus exists (see C2) | Assumption masquerading as a fact — treat with suspicion | doc 07 |
| U15 | WebGPU availability under enterprise Chrome policy | Unknown. Materially affects doc 06's budget. | doc 06 |
| U16 | **macOS force-install specifics**: that a `.mobileconfig` must be *signed* (vs. merely installable-with-warning), and that root-owned `/Library/Preferences/com.google.Chrome.plist` is no longer an accepted policy source | Founder claim, CTO not confident. Requirements have moved across macOS versions. **Windows path (HKLM) is High confidence and unaffected** — this gap only touches the secondary platform. | doc 05 |
| U17 | **`ap-southeast-5` per-service availability** for the Phase 1 stack (ECS/Fargate, S3, KMS, RDS). Not every AWS service ships in every region, and this one is young. | Core services near-certain; something in the file pipeline may not be there. **Must be checked before doc 08 sizes Phase 1** — the residency decision (F3, doc 02 §6.2) assumes the stack can actually run there. | doc 08 (before Phase 1 sizing) |
| U18 | **PDPA DPO appointment threshold and qualification requirements.** The obligation itself is confirmed (in force 2025-06-01, binds controllers **and processors**); the *threshold* sits in supplementary guidelines and is not yet read. | Amendment confirmed via counsel-grade secondary sources; the guidelines themselves not read. **We may already be non-compliant on a date that has passed.** | doc 08 (cost line) |
| U19 | **`chrome.storage.managed` can carry a tenant key** of the size and shape ADR 0009's Phase 1 design needs, delivered via the same machine policy as `ExtensionInstallForcelist` | Believed true — it is the documented mechanism for admin-set config. **ADR 0009's entire Phase 1 key-custody upgrade rests on it**, and that upgrade is what turns I4 from a contractual control into a mathematical one. | doc 05 |

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
