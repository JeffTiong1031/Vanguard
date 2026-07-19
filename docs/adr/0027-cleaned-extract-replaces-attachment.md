# ADR 0027 — Masks are applied to the original file; the extract is a decision surface, not the output

**Status:** Accepted · **Date:** 2026-07-18 (amended before implementation) · **Decider:** the founder
**Related:** decision #8 · [ADR 0008](0008-hybrid-split-by-workload.md) · [ADR 0014](0014-degrade-to-advisory-never-closed.md) · [ADR 0025](0025-send-time-per-span-review.md) · F4 (doc 02 §4.3) · doc 00 §1.4 · ASSUMPTIONS **U30**

## Context

Decision #8 means the user presses Send, so the file must be cleaned before it goes. The review UI
shows an extracted readable copy because that is the only way to underline a span and offer
Accept/Ignore. **The question this ADR settles is what happens to that text afterwards.**

The plan's first draft defaulted to converting the reviewed extract into the outgoing file —
`name.redacted.txt`. The founder overruled that **before implementation started** (2026-07-18). This
ADR records the amended decision and lists the rejected option so a fresh session does not re-derive
it and mistake that for diligence.

## Options

| | Option | Verdict |
|---|---|---|
| **A** | Convert the reviewed extract into the outgoing file — `name.redacted.txt` | ❌ **Rejected (founder, 2026-07-18).** It is the cheap path and it was this plan's first draft. It hands a compliance officer a `.txt` where they attached a report: tables, headings and every image are gone, and the model's answer degrades for reasons the user cannot see. **We would be damaging the document in order to protect it.** |
| **B** | **Apply accepted masks onto the original bytes; return the same format** | ✅ **Chosen.** DOCX → DOCX with `word/media/` intact. PDF → PDF with image XObjects intact. CSV/TXT → text, because there is nothing else in them. |
| **C** | Block the send when a file is dirty | ❌ [ADR 0014](0014-degrade-to-advisory-never-closed.md) — never fail-closed. Pushes the user to the desktop app (doc 00 §1.4). |

## Decision — B, with four rules

1. **Nothing accepted → the original `File` object, byte-identical.** No round trip, no rewrite, no
   degradation. There is no privacy reason to touch a file we are not changing.
2. **Anything accepted → `POST /v1/redact` with the original bytes + the accepted spans.** Output is
   the same format, renamed `name.redacted.<ext>`.
3. **The extract is hash-bound.** The redact call carries the extract's SHA-256; the backend re-parses
   and **refuses on mismatch**. Offsets reviewed against one parse are never applied against another.
4. 🔴 **Failure attaches nothing and says so.** Not the original (a leak), not a `.txt` (a surprise
   edit into a format nobody chose). **Both alternatives are ways of misreporting what happened**,
   and the audit trail saying it worked is the failure this whole product exists to prevent.

## The stated gaps — these belong in the UI, not only in this ADR

- 🔴 **Keeping images is not cleaning them.** A secret that exists only inside a photo, a screenshot,
  or a scanned page **ships untouched**. `coverage.not_read` renders *"N embedded images (kept
  as-is, not checked — no OCR)"* in the File pane. **OCR is backlog, not MVP.**
- 🔴 **PDF redaction removes every occurrence of an accepted span, not only the one the user
  hovered** — it locates by string search (U30). Over-redaction is the fail-safe direction, but it is
  a **semantic difference** and the UI must not imply per-span precision it does not have.
- **Pixel-identical layout is not promised.** The bar is **same format + images kept + accepted text
  masked**. A placeholder is a different length than the value it replaced, so reflow is expected.
- **CSV/TXT produce text because they are text.** That is not the option-A fallback returning by the
  back door.

## Consequences

- ~8–11 engineer-days over option A *(estimate)*, a second endpoint, an offset map through the DOCX
  parser, and a PDF library with a licence question (U30). **The original bytes are re-uploaded on
  Proceed** because the backend retained nothing (F4, doc 02 §4.3) — a real cost, and the right one.
- The File review pane shows **extract text**; the attachment the user sends is **format-preserving
  output** from `/v1/redact` when any span is accepted.
- Row **7a** of [`code/extension/ACCEPTANCE.md`](../../code/extension/ACCEPTANCE.md) is **conditional
  on U30 real-corpus PASS** — smoke alone is not product acceptance.

## Revisit if

- **U30 fails** → founder chooses among licence / PDF-only `.txt` fallback / defer.
- **The team reports that reflow after masking makes documents unusable** → in-place
  *style-preserving* rewriting is a scoped feature with evidence behind it rather than a guess.
