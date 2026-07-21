# Explainable enforcement & appeals — design

**Date:** 2026-07-21 · **Status:** proposed, awaiting founder review
**Tackles:** Case Study 3 challenge **3b — Transparency & redressal for affected people**, which the
2026-07-21 self-evaluation scored **2/10** (Vanguard's biggest conceptual gap).
**Surfaces touched:** `code/extension` (block modals, options page, background) and `code/policy`
(new appeal object, admin review). **No new services.**

---

## 1. Why this exists

The case study's third challenge asks that *someone affected by an AI-assisted decision can find out
AI was involved, get a plain-language explanation, and open a redressal pathway.* Vanguard scored
2/10 here: it governs **inputs** to AI and has no concept of decisions made about people.

**The reframe that makes this fit Vanguard (founder, 2026-07-21):** the AI-assisted decisions that
affect employees are **Vanguard's own automated enforcement actions** — the on-device classifier
**blocking a prompt** for an ethics violation, the detector **redacting sensitive data**, the policy
**blocking an unapproved tool**. The affected person is the employee, and they are already present in
the extension at the moment the decision is made. Today they are simply blocked. This feature makes
each decision **explain itself** and, for the content decisions, **be contestable**.

This is a much better fit than a generic "log decisions about people" system: the decision is
captured automatically (it already happens), the affected person is already identified by their
enrolment `pseudo_id`, and it grounds entirely in flows that already exist.

## 2. Goal & non-goals

**Goal.** Every enforcement decision the employee sees carries a plain-language explanation that makes
clear a machine decided it on-device; and for content decisions (ethics, PII) the employee can
contest it, a human reviews it in the console, and the employee sees the outcome — without breaking
Vanguard's "prompt text never leaves the device" posture.

**Non-goals (deliberate, each with a reason):**

| Excluded | Why |
|---|---|
| Real-time unblock on a successful appeal | Review is asynchronous; an ethics block is fail-closed and holds in the moment. Appeal = review + record + feedback, **not** a retroactive send. |
| Employee login / accounts | Employees stay pseudonymous — the `pseudo_id` from enrolment is the handle, as it is for events and access requests today. |
| Server-side / admin-editable explanation catalog | Approach A ships the wording in the extension. Editable server-side wording (Approach B) is a later evolution nobody has asked for. |
| Email / push notifications | The employee polls for outcomes from the options page, reusing the existing poll channel. |
| A `review_requested` usage event on the dashboard | Optional nice-to-have; left out of core to keep scope tight. May be added later, I3-shaped (class + count). |
| Contest path for tool-access blocks | The existing **Request access** flow already *is* the redressal — once the employee knows a tool is unapproved they request approval. Tool blocks get an explanation only. |

## 3. Design

### 3.1 Architecture

Three parts, two existing surfaces, one new object:

1. **Explanation (extension, local).** A static catalog maps every decision to plain-language text.
   Rendered in the three places blocks already surface. Pure local lookup — instant and offline,
   because the send-gate is **synchronous** and cannot wait on the network.
2. **Appeal (policy service, new).** For ethics/PII decisions, a *Request a review* action posts an
   appeal through the background service worker — the same path all policy traffic already takes —
   into a new `decision_appeals` table.
3. **Review (admin console, new screen).** A *Reviews* queue mirroring the existing Requests screen:
   the admin decides **Upheld / Overturned** and adds a note.

**Data flow:**
```
Employee hits a block in the extension
   ├─ [transparency] modal/banner renders the plain-language explanation (local catalog)
   └─ [redressal, ethics/PII only] "Request a review" → reason (+ opt-in prompt disclosure)
          → background SW → POST /v1/appeals → decision_appeals (status: pending)
                  │
   Admin console "Reviews" ── GET /v1/admin/appeals ──┘
          └─ decide Upheld/Overturned + note → status updated
                  │
   Extension options "My reviews" ← GET /v1/appeals?pseudo_id ← employee sees outcome + note
```

### 3.2 Transparency — the explanation

**New module `code/extension/src/detection/explanations.ts`** — a static catalog keyed by what the
extension already knows at block time:

- **6 ethics categories** (`covert_surveillance`, `discriminatory_screening`, `harassment_content`,
  `regulatory_circumvention`, `security_evasion`, `undisclosed_profiling`) → `{ title, why }`
- **PII / entity classes** (`NRIC`, `SSM`, `TIN`, `EMAIL`, `CARD`, `PERSON`, `ORG`) → `{ title, why }`
- **tool-block** → one generic entry
- **fallback** → a generic entry for any unknown key, so the UI never shows a blank.

Every entry pairs its specific *why* with a shared, load-bearing line that satisfies 3b's "find out AI
was involved + plain explanation" requirement literally:

> **"Decided automatically on your device by Vanguard's classifier — no person read your prompt."**

It renders by enriching (not replacing) the three existing surfaces:

| Surface | File | Change |
|---|---|---|
| **Ethics modal** | `src/ui/ethics-modal.ts` | + the *why* + the on-device note + a **Request a review** button (§3.3) |
| **PII send-review** | `src/ui/modal.tsx`, `src/ui/review-panes.ts` | + per-class *why* ("Looks like a Malaysian IC — masked so it never reaches the AI provider") + the on-device note + a **Report a wrong flag** action (§3.3) |
| **Tool-warn banner** | `src/ui/warn-banner.ts` | + *why* unapproved ("hasn't been reviewed for how it handles company data"). Redressal stays the existing Request access. |

**Content principle:** plain language, no jargon, honest — name the category, say a machine decided it
on-device, make clear a human did not read the prompt.

### 3.3 Redressal — the appeal

**Triggers (extension):**
- **Ethics modal → "Request a review"** — ethics is a *hard* block, so this is the only recourse and
  matters most.
- **PII send-review → "Report a wrong flag"** — for false-positive redactions.
- Tool-block → no appeal (uses the existing Request access).

**The contest form** (opens inside the modal):
- **Reason** — required free text ("Why do you think this was wrong?"), mirroring the existing
  access-request `reason`.
- **Opt-in checkbox, default OFF** — *"Include the exact text I was blocked on, so a person can review
  it."*

**The appeal payload — the privacy crux:**
- **Always sent:** `pseudo_id`, `decision_type` (`ethics`|`pii`), `category`, `reason`, `ts`.
- **Only if opt-in is ON:** `disclosed_text` (the prompt for ethics; the matched span for PII).
- **Never automatic:** the prompt text. The default is *class + reason* — invariant I3 stays intact.
  The opt-in is the employee **consensually** disclosing their **own** text to the company's **own**
  governance server (never the AI provider), purpose-limited to their appeal. It is the one
  legitimate exception to "prompt text never leaves the device," and it is consent-gated by
  construction.

**Flow:** form → background SW → `POST /v1/appeals` → `decision_appeals` row (`status: pending`) →
admin decides **Upheld / Overturned** + note → the extension **options page** gains a **"My reviews"**
section that polls appeal status by `pseudo_id` and shows the outcome + note. The loop closes with the
employee still pseudonymous.

**Two properties worth stating:**
- An **overturned** appeal is a **labelled false positive** — a high-value, explicit signal for tuning
  the classifier (stronger than doc 07's Ignore-rate signal).
- **Appeal ≠ unblock** (restating §3.1): review is asynchronous; the block held in the moment. The
  employee gets a voice, a recorded outcome, and — if overturned — an acknowledgement, not a
  retroactive send.

### 3.4 Data model & API

**New table `decision_appeals`** (mirrors `access_requests`), in `code/policy/app/db.py`:
```
id            TEXT PRIMARY KEY
org_id        TEXT NOT NULL
employee_id   TEXT NOT NULL           -- resolved from pseudo_id, like usage_events
decision_type TEXT NOT NULL           -- 'ethics' | 'pii'
category      TEXT NOT NULL           -- 'covert_surveillance' | 'NRIC' | …
employee_reason TEXT NOT NULL         -- free text, ≤500
disclosed_text  TEXT                  -- NULL unless the employee opted in
status        TEXT NOT NULL DEFAULT 'pending'   -- 'pending' | 'upheld' | 'overturned'
admin_note    TEXT                    -- NULL until decided
created_at    TEXT NOT NULL
decided_at    TEXT                    -- NULL until decided
```

**New API routes** (consistent with existing style):

| Route | Caller | Behaviour |
|---|---|---|
| `POST /v1/appeals` | extension SW | `AppealCreate{pseudo_id, decision_type, category, reason, disclosed_text?}`, `extra="forbid"`; unknown `pseudo_id` → **401** (like events); inserts row; returns `{id, status}`, **201** |
| `GET /v1/appeals?pseudo_id=` | extension SW | returns the caller's **own** appeals only → `id, decision_type, category, status, admin_note, created_at, decided_at` (for "My reviews") |
| `GET /v1/admin/appeals` | admin (session) | the review queue for the org, department joined (like `/v1/admin/requests`), including `disclosed_text` when present |
| `POST /v1/admin/appeals/{id}` | admin (session) | `AppealDecision{decision:'upheld'|'overturned', note?}`; sets `status`, `admin_note`, `decided_at`; **409 if already decided** (reuse the requests re-decide guard) |

**Wire models** (`code/policy/app/models.py`), both `extra="forbid"`:
- `AppealCreate`: `pseudo_id: str`, `decision_type: Literal['ethics','pii']`, `category: str`,
  `reason: str = Field(max_length=500)`, `disclosed_text: Optional[str] = Field(default=None,
  max_length=4000)`.
- `AppealDecision`: `decision: Literal['upheld','overturned']`, `note: Optional[str] =
  Field(default=None, max_length=500)`.

The existing app-wide 422 handler already strips echoed `input`, so a rejected field never reflects its
value back.

### 3.5 Admin console — the Reviews screen

- **New screen `code/policy/admin/src/screens/Reviews.tsx`**, added to the nav after Tokens
  (`main.tsx`), with a new icon in `icons.tsx` and row types in `api.ts`.
- Pending queue shows: decision type · category · department · the employee's reason · the
  `disclosed_text` **if** they chose to share it (clearly labelled "employee chose to share") ·
  timestamp.
- **Uphold / Overturn** buttons + a note field — a direct reuse of the Requests decide pattern
  (`decide()` + 3s poll + stale-response guard).

### 3.6 Extension — "My reviews"

- The options page (`entrypoints/options/main.tsx`) gains a **My reviews** section that, given the
  enrolment `pseudo_id`, polls `GET /v1/appeals` via a new background message and lists each appeal's
  status + admin note.
- New message kinds in `src/policy/messages.ts` — `appeal-submit` and `appeals-get` — handled in
  `entrypoints/background.ts`; a small `src/policy/appeals.ts` client (`submitAppeal`, `fetchAppeals`)
  called from the background worker only (same origin rule as the rest of the policy client).
- **`entrypoints/content.ts` is the call site** that must pass the decision's `category`/`class` into
  each modal (so the catalog can be looked up and the appeal built) and wire the *Request a review* /
  *Report a wrong flag* action to `appeal-submit`. Today it calls `showEthicsModal({ label, orgName,
  onEdit })` with no category — it gains `category` and an `onRequestReview` handler.

**Files at a glance.** *Create:* `src/detection/explanations.ts`, `src/policy/appeals.ts`,
`code/policy/app/routes/appeals.py`, `code/policy/admin/src/screens/Reviews.tsx`. *Modify (extension):*
`src/ui/ethics-modal.ts`, `src/ui/modal.tsx`, `src/ui/review-panes.ts`, `src/ui/warn-banner.ts`,
`src/policy/messages.ts`, `entrypoints/background.ts`, `entrypoints/content.ts`,
`entrypoints/options/main.tsx`. *Modify (policy):* `app/db.py`, `app/models.py`, `app/routes/admin.py`,
`app/main.py`. *Modify (console):* `admin/src/main.tsx`, `admin/src/api.ts`, `admin/src/icons.tsx`.

## 4. Privacy invariants (binding)

- **Default appeal carries no prompt text** — class + reason only. I3 intact.
- **`disclosed_text` is the only path raw prompt text can reach the server, and only via the opt-in
  checkbox** — consent-gated, company-server-only, purpose-limited to the appeal.
- **The employee stays pseudonymous** (`pseudo_id`), consistent with events and access requests.
- **Overturned = labelled false positive**, retained as a classifier-improvement signal.

## 5. Error handling

- The explanation always renders from the local catalog; an unknown category falls back to the
  generic entry — the UI never shows a blank "why".
- An appeal `POST` failure surfaces a "couldn't submit — retry" in the modal and never blocks or loses
  the enforcement decision itself (the block already happened; the appeal is best-effort).
- If the admin never decides, the appeal simply stays `pending`; "My reviews" shows `pending`.

## 6. Testing

**Policy service (pytest, `code/policy/tests/test_appeals.py`):**
- `POST /v1/appeals` creates a row; unknown `pseudo_id` → 401.
- `AppealCreate` `extra="forbid"` rejects a smuggled prompt field → 422, and the 422 body does not
  echo the value.
- 🔴 **Load-bearing privacy test:** an appeal submitted **without** opt-in stores `disclosed_text =
  NULL`.
- `GET /v1/appeals` returns only the caller's `pseudo_id` appeals.
- Admin review routes refuse an unauthenticated caller; a decision sets status + note + `decided_at`;
  a second decision on the same appeal → 409.

**Extension (vitest):**
- `explanations` returns the correct text for each category/class and the generic fallback for an
  unknown key.
- 🔴 **Load-bearing privacy test:** the appeal payload builder omits `disclosed_text` unless the opt-in
  flag is set.
- The `appeal-submit` / `appeals-get` message contract round-trips.

**Console:** the Reviews screen renders a queue and the decide flow updates status (light coverage,
consistent with the other screens).

## 7. Acceptance

A teammate, on the running stack:

1. Types an ethics-violating prompt → the modal now explains **why** in plain language and states it
   was decided on-device by a classifier. → **Request a review**, gives a reason, leaves the opt-in
   **off**, submits.
2. Admin console → **Reviews** → the appeal appears with category + department + reason and **no
   prompt text**. Admin **Overturns** with a note.
3. Extension options → **My reviews** → the appeal now shows **overturned** + the note.
4. Repeat with the opt-in **on** → the disclosed text appears in the admin queue, labelled as shared
   by the employee.
5. A sensitive-data (PII) redaction shows a per-class explanation and a **Report a wrong flag** path.
6. An unapproved-tool banner shows **why** it is unapproved; its redressal is the existing **Request
   access** (unchanged).

**Overall pass:** every enforcement decision explains itself; ethics/PII decisions are contestable end
to end; and a default appeal provably carries no prompt text.

## 8. Risks & open questions

- **Coverage depends on the employee choosing to appeal** — like all of Vanguard's willing-compliance
  design, this is a feature, not a bug, but doc 08 should note that appeal volume measures friction,
  not correctness.
- **`disclosed_text` is real prompt text at rest on the company server.** It is opt-in and
  purpose-limited, but it is retained; a production build would want a retention limit and to fold it
  into the DPA. Out of scope for the demo, flagged here.
- **The `pseudo_id` is a bearer handle** for `GET /v1/appeals` (same trust model as events). Adequate
  for the team test; a production build would bind it to the enrolment session.
