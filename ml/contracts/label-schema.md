# Label schema — sensitive (MASK) vs keep (KEEP)

The model classifies each NER-proposed PERSON/ORG span using the SURROUNDING PROMPT CONTEXT, not the
entity's fame or surface text alone. The SAME name can be labelled differently in different contexts.

## Rule
- KEEP — general knowledge, public discussion, historical/fictional discussion, or the entity used
  merely as a TOPIC.
- MASK — a private working, customer, employee, contractual, financial, or transactional relationship
  revealed by context.
- Genuinely ambiguous (no disambiguating context) → KEEP. This is a precision-first tie-break ONLY.
  It is NOT permission to predict KEEP broadly.

## PERSON
| Prompt | Span | Label |
|---|---|---|
| Explain Einstein's theory | Einstein | KEEP |
| Einstein from accounting has not sent the invoice | Einstein | MASK |
| What is Anwar's position on X? | Anwar | KEEP |
| Ask Anwar from accounts to send the customer file | Anwar | MASK |

## ORG
| Prompt | Span | Label |
|---|---|---|
| Summarise Apple's earnings | Apple | KEEP |
| What does Sdn Bhd mean? | Sdn Bhd | KEEP |
| Chase payment from X Sdn Bhd; they owe us RM50,000 | X Sdn Bhd | MASK |
| A public employer name in clearly private/internal/transactional context | (that org) | MASK |

Public status ALONE does not decide it. A public employer named in an internal/transactional context
may be MASK.

## Honorifics / titles (doc 04 §4.3)
When a PERSON is MASK, the **title is INSIDE the MASK span** — `Encik Rahman`, `Dato' Seri Ali`,
`张先生` mask as one span, not just the bare name. Leaving `Dato' Seri ____` is a re-identification
pointer, which is a compliance failure, not a cosmetic one. When a PERSON is KEEP, the title is KEEP too.
(Author the span offsets to include the title.)

## Out of scope for this model
- NRIC / SSM / TIN and other ID-shaped digits are owned by L1 (written, not trained). They may appear
  in a prompt, but they are NEVER spans this model classifies. `entity_type` is only PER or ORG.
- Ordinary math / non-PII numbers ("1 + 1", a year, a quantity) must not force MASK.
- LOC is out of scope (CLAUDE.md §8.1): stock NER's LOC conflates public geography with addresses;
  Slice 1 does not mask it and this model does not classify it. NER label mapping at integration:
  `PERSON→PER`, `ORG/ORGANIZATION→ORG`, `LOC→dropped` (also stated in `export-contract.md`).
