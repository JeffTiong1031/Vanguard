# U30 PDF redaction spike

> **Slice 2's second stop condition.** Can we redact a PDF in place, keeping its images?
> Raw probe, no backend — same rationale as the U12/U27 harnesses: answer the library question
> before building on it.

## Install and run

```bash
cd code/spikes/u30-pdf-redact
pip install pymupdf
python build_smoke_samples.py
python probe.py samples/smoke_text.pdf "880101-14-5566" "Ahmad bin Ali"
python probe.py samples/smoke_text_image.pdf "880101-14-5566" "Ahmad bin Ali"
python probe.py samples/smoke_multipage.pdf "880101-14-5566" "Ahmad bin Ali"
```

The probe writes `<input>.redacted.pdf` beside the source file and prints a result dict.

## What this tests (U30)

For a set of **real work PDFs**, every accepted span can be located and **removed** (not merely
covered), the output opens cleanly in Chrome's viewer and Acrobat, and embedded images survive.

🔴 **Generated/smoke PDFs are NOT the real corpus.** They prove the harness runs; they do **not**
constitute a PASS. Real producers introduce ligatures, hyphenation across lines, spans split across
text-showing operators, rotated layout, and vector-drawn text — none of which smoke fixtures cover.

## Results table (real corpus — founder must supply)

| File | missed | still_present | images kept | opens cleanly |
|---|---|---|---|---|
| *(founder corpus #1 — e.g. invoice)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #2 — e.g. payslip)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #3 — e.g. bank statement)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #4 — e.g. Word export)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #5 — e.g. scanner/OCR)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #6 — e.g. LaTeX paper)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #7 — e.g. slide export)* | PENDING | PENDING | PENDING | PENDING |
| *(founder corpus #8 — e.g. government form)* | PENDING | PENDING | PENDING | PENDING |

**PASS requires all four across every real file:**

1. Zero `still_present` (span located but survived removal — the fatal failure mode)
2. `images_after == images_before`
3. Every output opens in Chrome and Acrobat without a repair prompt
4. A licence position exists (see Licensing below)

`missed` is not automatically a FAIL — a span we cannot locate is a span we cannot redact, but if
the pipeline detects the miss and refuses rather than saving a file it believes is clean, the failure
is loud and safe. **`still_present` is the fatal one.**

## Smoke (not PASS)

Synthetic fixtures in `samples/` — built by `build_smoke_samples.py`, labelled as smoke, **not**
real corpus. Fake NRIC `880101-14-5566` and name `Ahmad bin Ali` only.

| File | missed | still_present | images kept | opens cleanly |
|---|---|---|---|---|
| `smoke_text.pdf` | none | none | yes (0→0) | yes (PyMuPDF) |
| `smoke_text_image.pdf` | none | none | yes (1→1) | yes (PyMuPDF) |
| `smoke_multipage.pdf` | none | none | yes (0→0) | yes (PyMuPDF) |

Smoke run 2026-07-18: all spans hit, zero `still_present`, images preserved where present.
Chrome/Acrobat manual check not run on smoke fixtures — required for real corpus PASS.

## Licensing

PyMuPDF is **AGPL-3.0 or commercial**. Shipping AGPL code in a distributed product is a diligence
finding if nobody decided it on purpose. **Licensing is part of the U30 verdict, not a footnote.**

**Founder choice: UNDECIDED**

| Option | Description |
|---|---|
| **(i)** | Commercial PyMuPDF licence |
| **(ii)** | PDF-only `.txt` fallback, disclosed in the UI |
| **(iii)** | PDF masking deferred to backlog; PDFs offer only Ignore-or-remove in v1 |

A PASS requires both technical success on the real corpus **and** one of the above chosen deliberately.
Do not pick (ii) silently — Global Constraint 15 exists because `.txt` is the tempting quiet default.

## Stop condition

If U30 **FAIL**s on the real corpus, STOP and escalate to the founder. Do not work around it by
silently downgrading to `.txt`. Task 5B's PDF branch is gated on this spike.

## Files

| File | Role |
|---|---|
| `probe.py` | PyMuPDF redaction probe — `search_for` + `add_redact_annot` + `apply_redactions` |
| `build_smoke_samples.py` | Reproducible smoke PDF generator (not real corpus) |
| `samples/` | Smoke fixtures only |
