# v1 — LLM span-label generation prompt

Use this prompt when drafting training rows for `ml/data/llm_draft/` (gitignored).
Output is **augmentation only** — never the eval set. A human audit of a stratified sample follows
before any row enters training.

## Output format

Emit **JSONL**: one `Example` object per line, no markdown fences, no commentary.

Required fields per line:

| Field | Value |
|---|---|
| `id` | Unique string, e.g. `draft-einstein-keep-001` |
| `text` | Full prompt text |
| `lang` | `"en"`, `"bm"`, `"zh"`, or `"mixed"` |
| `spans` | Array of span objects (may be empty) |
| `provenance` | `"llm_synthetic"` |
| `source` | `"llm_v1"` |
| `split` | `"train"` |
| `tags` | Optional string array (see tag cases below) |

Each span object:

```json
{"start": 8, "end": 16, "surface": "Einstein", "entity_type": "PER", "label": "KEEP"}
```

- `start` / `end` — half-open Python slice indices into `text` (`text[start:end]` must equal `surface`)
- `entity_type` — `"PER"` or `"ORG"` only
- `label` — `"MASK"` or `"KEEP"` per the rubric below
- Spans must not overlap

## Label rubric (Task 3)

Classify each NER-proposed PERSON/ORG span using **surrounding prompt context**, not fame alone.
The **same surface** may appear as KEEP in one line and MASK in another.

- **KEEP** — general knowledge, public discussion, historical/fictional topic, or entity used merely as a topic
- **MASK** — private working, customer, employee, contractual, financial, or transactional relationship revealed by context
- **Ambiguous** (no disambiguating context) → **KEEP** (precision-first tie-break only; tag `ambiguous_keep`)

### PERSON examples

| Prompt | Span | Label |
|---|---|---|
| Explain Einstein's theory | Einstein | KEEP |
| Einstein from accounting has not sent the invoice | Einstein | MASK |

### ORG examples

| Prompt | Span | Label |
|---|---|---|
| Summarise Apple's earnings | Apple | KEEP |
| Chase payment from X Sdn Bhd; they owe us RM50,000 | X Sdn Bhd | MASK |

### Honorifics (MASK PERSON)

When a PERSON is MASK, the **title is inside the span** — `Encik Rahman`, `Dato' Seri Ali`, `张先生`
mask as one span, not just the bare name.

## Coverage requirements

Generate a diverse batch covering:

1. **Languages:** EN, BM, ZH, and at least some code-switched (`lang:"mixed"`) lines
2. **Entity types:** both PER and ORG spans
3. **Labels:** both KEEP and MASK spans
4. **Same surface, opposite labels:** emit the same entity name (e.g. Einstein, Apple) in a public-topic line (KEEP) and a private-transactional line (MASK) — **two separate JSONL lines**

## Tag cases (required in every batch)

| Tag | Requirement |
|---|---|
| `math_no_mask` | A line with ordinary math or a year (e.g. `1 + 1`, `2024`) and **no spans** |
| `ambiguous_keep` | A bare short name with no disambiguating context → KEEP |
| `id_digit_line` | A line containing NRIC/SSM/TIN-shaped digits; label PER/ORG spans only — **never** label the digit string |

## Out of scope — do NOT emit spans for

- NRIC / SSM / TIN and other ID-shaped digit strings (L1 owns them)
- LOC entities (dropped at integration)
- Ordinary math / non-PII numbers as spans

## Quality checks before saving

1. Every `surface` equals `text[start:end]`
2. No overlapping spans within a line
3. `provenance` is always `"llm_synthetic"`
4. Rows are for **train split only** in this draft pass

Save output under `ml/data/llm_draft/` — that directory is gitignored.
