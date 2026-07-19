# U30 PDF redaction spike

> **Slice 2's second stop condition.** Can we redact a PDF in place, keeping its images?
> Raw probe, no backend — same rationale as the U12/U27 harnesses: answer the library question
> before building on it.

## Install and run

```bash
cd code/spikes/u30-pdf-redact
pip install pymupdf pikepdf pdfminer.six
python build_smoke_samples.py

# PyMuPDF probe (original)
python probe.py samples/smoke_text.pdf "880101-14-5566" "Ahmad bin Ali"
python probe.py samples/smoke_text_image.pdf "880101-14-5566" "Ahmad bin Ali"
python probe.py samples/smoke_multipage.pdf "880101-14-5566" "Ahmad bin Ali"

# pikepdf alternate probe (MPL-2.0 + MIT only — no PyMuPDF in probe)
python probe_pikepdf.py samples/smoke_text.pdf "880101-14-5566" "Ahmad bin Ali"
python probe_pikepdf.py samples/smoke_text_image.pdf "880101-14-5566" "Ahmad bin Ali"
python probe_pikepdf.py samples/smoke_multipage.pdf "880101-14-5566" "Ahmad bin Ali"
```

Each probe writes `<input>.redacted.pdf` or `<input>.pikepdf.redacted.pdf` beside the source and
prints a result dict.

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

Synthetic fixtures in `samples/` — built by `build_smoke_samples.py` (PyMuPDF generator only),
labelled as smoke, **not** real corpus. Fake NRIC `880101-14-5566` and name `Ahmad bin Ali` only.

| File | probe | missed | still_present | images (before→after) |
|---|---|---|---|---|
| `smoke_text.pdf` | PyMuPDF | none | none | 0→0 |
| `smoke_text.pdf` | pikepdf | none | none | 0→0 |
| `smoke_text_image.pdf` | PyMuPDF | none | none | 1→1 |
| `smoke_text_image.pdf` | pikepdf | none | none | 1→1 |
| `smoke_multipage.pdf` | PyMuPDF | none | none | 0→0 |
| `smoke_multipage.pdf` | pikepdf | none | none | 0→0 |

Smoke run **2026-07-19**: both probes hit every span, zero `still_present`, images preserved where
present. Chrome/Acrobat manual check not run on smoke fixtures — required for real corpus PASS.

## pikepdf spike results

**Smoke verdict: PASS (mechanism on fixtures only).**

| Metric | Result |
|---|---|
| `still_present` | `[]` on all three smoke files |
| `missed` | `[]` |
| Images | preserved (`1→1` on `smoke_text_image.pdf`) |
| Residual check | pdfminer.six text extraction (not PyMuPDF) |

**How it works:** `parse_content_stream` → edit or drop text-showing operators (`Tj`/`TJ`/…) whose
operands contain target span literals → `remove_unreferenced_resources` → save. No mature redact API;
this is best-effort content-stream surgery.

**Honest limits — why smoke PASS ≠ product PASS:**

| Limit | Consequence |
|---|---|
| No `search_for` / glyph-position redact | Cannot locate spans split across operators, kerning arrays, or non-literal encodings |
| Literal-string assumption | Real PDFs use subset fonts, ToUnicode gaps, hex strings, Form XObject text — common on Word/LaTeX exports |
| No annotation/form/metadata scrub | Annotations, widgets, embedded file attachments may retain text pikepdf never sees |
| Maintainer guidance | pikepdf docs state comprehensive redaction needs more than stream edits; subset fonts can leak letter sets |

**Real-corpus verdict: PENDING** — founder must run `probe_pikepdf.py` on ≥8 real work PDFs before
calling pikepdf the ship path.

## Licensing (founder lock — 2026-07-19)

Recorded as a product decision, not legal advice.

| Phase | Library | Position |
|---|---|---|
| **Try first** | **pikepdf** (MPL-2.0) + pdfminer.six (MIT) | Preferred for PDF→PDF mask if real corpus PASSes |
| **Pitch + Load-unpacked team test** | **PyMuPDF** (AGPL-3.0 or commercial) | **Provisional fallback** if pikepdf cannot reliably remove text while keeping images on real work PDFs — acceptable for coworker testing, **not** for ship |
| **Ship gate** | Before Chrome Web Store / paying customers / commercial launch | **Buy PyMuPDF commercial licence OR stay on pikepdf** — but only if pikepdf **PASSed the real corpus** (zero `still_present`, images kept, opens cleanly). Load-unpacked team testing does **not** satisfy the ship gate. |
| **Other formats** | DOCX / CSV / TXT | Unchanged — this lock applies to PDF masking only |

Prior options on total PDF failure remain: (i) commercial PyMuPDF licence · (ii) PDF-only `.txt`
fallback disclosed · (iii) defer PDF masking. Do not pick (ii) silently — Global Constraint 15.

## Task 5B recommendation

**Wire `redact/pdf.py` with PyMuPDF for the pitch / Load-unpacked team-test MVP**, with the AGPL
position recorded and the ship gate above enforced before any commercial distribution.

**Rationale:** PyMuPDF has the only mature in-place redact route (`search_for` +
`add_redact_annot` + `apply_redactions` + `PDF_REDACT_IMAGE_NONE`). pikepdf **PASSed smoke** via
content-stream editing but has **no equivalent API** and is expected to **FAIL or degrade on real
producer PDFs** — run `probe_pikepdf.py` on the founder corpus in parallel; if it unexpectedly
PASSes all eight, Task 5B can switch implementation to pikepdf before ship without a licence purchase.

## Stop condition

If U30 **FAIL**s on the real corpus, STOP and escalate to the founder. Do not work around it by
silently downgrading to `.txt`. Task 5B's PDF branch is gated on this spike.

## Files

| File | Role |
|---|---|
| `probe.py` | PyMuPDF redaction probe — `search_for` + `add_redact_annot` + `apply_redactions` |
| `probe_pikepdf.py` | pikepdf alternate — content-stream span removal; pdfminer residual check |
| `build_smoke_samples.py` | Reproducible smoke PDF generator (PyMuPDF for fixtures only) |
| `samples/` | Smoke fixtures only |
