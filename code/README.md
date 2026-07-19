# `code/` — the scaffold

> **Read [`../CLAUDE.md`](../CLAUDE.md) §4 first.** This directory is **deliberately two artifacts
> with two different jobs**, and conflating them is how the week-1 spike slips.

| | What | State |
|---|---|---|
| [`spikes/u12-harness/`](spikes/u12-harness/) | 🔴 **U12-a/b/c against real ChatGPT + Claude.** Raw MV3, **zero build, zero dependencies.** | ✅ **LIVE. Run it.** |
| [`spikes/u21a-fertility/`](spikes/u21a-fertility/) | 🟢 **U21-a — stock-vocabulary fertility.** Public raw text, an afternoon. | ✅ **LIVE. Verified end-to-end.** |
| [`spikes/u27-file-capture/`](spikes/u27-file-capture/) | 🔴 **U27/U28/U29 — attach-time file interception + synthetic re-attach.** Raw MV3, zero build. | ✅ **LIVE. PASS 2026-07-18** — captures in `captures/` |
| [`spikes/u30-pdf-redact/`](spikes/u30-pdf-redact/) | 🔴 **U30 — format-preserving PDF text redaction.** Python spike; real corpus still owed. | ✅ **LIVE (smoke).** Ship gate: commercial licence or pikepdf real-corpus PASS |
| [`extension/`](extension/) | Slice 1 chat-text + **Slice 2 file checking** (WXT). L1 + L2, committed `dist/`. | 🔴 **SLICE 2 IN PROGRESS** — live acceptance: [`extension/ACCEPTANCE.md`](extension/ACCEPTANCE.md) |
| [`backend/`](backend/) | ADR 0007 FastAPI — **`/v1/extract` + `/v1/redact` only** (parse + format-preserving mask; **no detection**). | ✅ **LIVE (extract/redact).** Team test: local `uvicorn` (see [`../README.md`](../README.md)) |

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

## Order of operations — REWRITTEN 2026-07-17. The ordering reversed.

> 🔴 **Read [`../docs/adr/0016-mvp-first-sequencing.md`](../docs/adr/0016-mvp-first-sequencing.md)
> first.** This section used to open with *"B3 — 5–10 phone calls. **Not code.**"* and rank the spikes
> by blast radius. **All four spikes have now RUN and HELD** (U12-a ✅ Enter **and** click · U12-b ✅ ·
> U12-c ✅ · U20 ✅ — evidence in [`spikes/u12-harness/captures/`](spikes/u12-harness/captures/)), **and
> the founder has parked B3 in favour of a team test of a working MVP.**
>
> ⚠️ **The old ordering's argument was never refuted — it was overruled.** Do not re-derive it from
> doc 00 §3 and mistake that for diligence. **ADR 0016 records the dissent so it does not have to be
> re-argued.**

| | | |
|---|---|---|
| ~~1~~ ✅ | **U12-a / U12-b / U12-c / U20** | **All PASS, 2026-07-17, real ChatGPT + Claude.** The rework trigger did not fire. 🔴 **Four harness bugs produced three wrong answers along the way and a human caught every one by reading raw logs** — see [`spikes/u12-harness/README.md`](spikes/u12-harness/README.md). |
| ~~2~~ ✅ | **Slice 1 — the chat-text extension, L1 + L2** | Team-test build shipped. Residual live boxes: [`extension/ACCEPTANCE.md`](extension/ACCEPTANCE.md) Slice 1 section. |
| **2** | **Team test (Slice 1)** | Not a public release. |
| 🟢 **2′** | **U21-a** — [`spikes/u21a-fertility/`](spikes/u21a-fertility/) | **May run in parallel.** Free, an afternoon, **one-sided: a fail is final.** |
| ~~3a~~ ✅ | **U27 / U28 / U29 spikes** — [`spikes/u27-file-capture/`](spikes/u27-file-capture/) | **PASS 2026-07-18, both surfaces.** Slice 2 rework trigger did not fire. |
| 🟠 **3b** | **U30 real-corpus PDF redaction** — [`spikes/u30-pdf-redact/`](spikes/u30-pdf-redact/) | Smoke PASS; **≥8 real work PDFs still owed** before full U30 PASS. Ship gate unchanged. |
| 🔴 **3** | **Slice 2 — file CONTENT checking** | **In progress** — plan: [`../docs/superpowers/plans/2026-07-18-slice-2-file-content.md`](../docs/superpowers/plans/2026-07-18-slice-2-file-content.md). ADRs [0027](../docs/adr/0027-cleaned-extract-replaces-attachment.md) · [0028](../docs/adr/0028-backend-parses-extension-detects.md). Live checklist: [`extension/ACCEPTANCE.md`](extension/ACCEPTANCE.md). |
| **4** | **Doc 08** | Only after both slices. |
| 🟠 **PARKED** | **B3** · force-install · **U6-b's threshold** · marketing/GTM · doc 08 | Everything that needs a design partner. |

> 🟢 **Slice 1 produces U6-b's CURVE for free** — the curve was always ours (doc 06 §3.3); only the
> **threshold** is design-partner-blocked. **A working extension on the team's machines measures
> paste → verdict on real hardware, on real prompts.**
>
> 🔴 **`spikes/` is now HISTORY, not a queue.** It stays because the captures are the evidence behind
> U12/U20 in `../ASSUMPTIONS.md`, and because its README carries the four instrument bugs — **the most
> transferable thing in this directory.** **Nothing in `spikes/` ships** (ADR 0012; and **U26**: the
> harness logs raw `key` values, which the production extension must not inherit).


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
