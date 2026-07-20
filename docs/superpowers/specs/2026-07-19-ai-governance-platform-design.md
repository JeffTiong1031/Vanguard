# AI Governance Platform — design spec

**Date:** 2026-07-19
**Status:** Design approved in brainstorming; implementation plan not yet written.
**Target:** Case Study 3 — *AI Governance & Responsible AI in Enterprise*.
**Build intent:** 🔴 **Pitch demo, not a production build** (founder, 2026-07-19). Shortcuts are
permitted where they are *named*. Every shortcut in this spec carries a one-line honest answer for
the question a judge will ask. See §9.

---

## 1. What this is, and how it relates to the existing package

The case study asks for a system ensuring **AI governance: data protection, transparency, and
ethical use** — knowing which AI tools are in use, who may use them, what data they see, and how
outputs get checked.

Vanguard already has the enforcement point: an MV3 extension with a send-time gate, on-device
detection (L1 identifiers + L2 NER), and a redacted local audit trail. **What it does not have is
governance** — no org identity, no policy, no admin, no record anyone but the employee can read.

This spec adds that. The reframe is load-bearing for the pitch:

> **Vanguard is not a prompt-privacy extension with a dashboard bolted on. The extension is the
> enforcement point of an AI governance platform**, and the platform is organised on NIST AI RMF's
> four functions.

| NIST AI RMF function | Component in this design |
|---|---|
| **Govern** | Admin dashboard — LLM allowlist, ethics categories, policy authoring |
| **Map** | LLM registry detection — which AI tools are actually in use, by which department |
| **Measure** | Usage dashboard, classifier verdicts, Ignore rates per class |
| **Manage** | Approval workflow, warn/block enforcement, revocation |

The case study's four example use cases map onto this design as: (1) risk monitoring → §6 classifier
+ §7 event stream; (2) approval workflow → §5; (3) usage dashboard → §5; (4) automated sensitive-data
checks → **already built** (Slice 1 L1/L2, Slice 2 file content).

### 1.1 Sequencing — this is a deliberate departure and must be recorded

[ADR 0016](../../adr/0016-mvp-first-sequencing.md) locks **Slice 1 → team test → Slice 2 → doc 08**,
with B3 parked. This work is neither slice, and an admin dashboard is substantially *the B3 feature* —
the compliance officer's console, whose demand B3 was going to measure.

**It proceeds anyway, as a founder decision, because the deliverable is a case-study pitch rather than
the product roadmap.** Slice 2 is not cancelled. A fresh session must not read this spec as a reversal
of ADR 0016 for the product line. An ADR should be minted at implementation time recording the
departure and its scope limit.

---

## 2. Scope decomposition

Three independent subsystems. This spec covers all three because they share a data model and a demo
narrative, but **each gets its own implementation plan** (founder, 2026-07-19) and each is separately
testable:

| Plan | Subsystem | Contains | Depends on |
|---|---|---|---|
| **A** | Policy service + admin console | `code/policy/` API, SQLite schema, enrolment, approval queue, usage dashboard, admin SPA | — |
| **B** | Extension integration | Enrolment UI, policy client in the background SW, registry detection, warn banner, request UI, event shipping | Plan A |
| **C** | Ethics classifier | Corpus, training, JSON export, in-extension runtime, red modal | — |

**Plan C is fully independent and may be built at any time, including first or in parallel.** Plan B
requires Plan A's API to exist. Plan A is demoable on its own in a browser, which makes it the safest
place to start.

---

## 3. Architecture

Four units, each with one purpose and a defined interface.

| Unit | Purpose | Depends on | Language / stack |
|---|---|---|---|
| `code/policy/` | Governance API + datastore; serves the admin SPA | — | FastAPI + SQLite |
| `code/policy/admin/` | Admin console UI | policy API | Preact + Vite |
| `code/classifier/` | Trains the ethics model; exports JSON artifact | — | Python, scikit-learn |
| `code/extension/` | Enforcement point (extended) | policy API, model JSON | WXT + Preact (existing) |

### 3.1 Why a separate service (Option A)

Rejected alternatives, with reasons, so they are not re-litigated:

- **Option B — policy routes on the existing `code/backend/`.** Rejected. That service's defining
  property is that it stores nothing, and [`test_zero_retention.py`](../../../code/backend/tests/test_zero_retention.py)
  exists to defend it against "your own future engineers' good ideas" (doc 02 §4.3). Adding an org
  database turns *"we store nothing"* into *"we store nothing **of file content**, except…"* — a
  caveat mid-pitch, in exchange for one fewer process.
- **Option C — no backend; policy and audit in `chrome.storage`.** Rejected, and the case study
  disqualifies it explicitly on two counts: it requires *"a record of AI usage that can satisfy both
  internal audit and external government regulators"* — Option C puts that record on the machine of
  the person being audited, editable by them — and *"track AI usage across departments"* cannot be
  aggregated inside one browser profile.

### 3.2 Why the classifier is not in `ml/`

[ADR 0018](../../adr/0018-sensitive-vs-not-parallel-track.md) makes `ml/` a **separate team's** track
for the sensitive-vs-not span classifier. A second, unrelated model there muddies ownership and
invites the two to be confused. `code/classifier/` is a self-contained training directory whose only
output is a committed JSON artifact.

---

## 4. Data model

```
orgs             id · name · admin_password_hash · policy_version
enroll_tokens    id · org_id · department · token_hash · label · created_at · revoked
employees        id · org_id · pseudo_id · department · created_at
llm_registry     id · host · display_name                    ← seeded catalog, 8 rows
org_llm_policy   org_id · llm_id · status(approved|blocked)
policy_category  org_id · key · label · enabled              ← the six ethics categories
access_requests  id · org_id · employee_id · llm_id · reason · status · created_at · decided_at
usage_events     id · org_id · employee_id · host · type · category · finding_hash · ts
```

**`policy_version`** bumps on every org policy write and doubles as the HTTP ETag. Consequences: a
revocation propagates within one poll cycle, and the overwhelming majority of polls are a bodyless
`304`.

**Enrolment tokens are per-department, not per-org** (founder, 2026-07-19). The department is encoded
in the token rather than chosen by the employee, so it cannot be misreported — and department is the
axis the whole usage dashboard is organised on, so its integrity matters. The admin console mints and
revokes them; the plaintext token is displayed once at mint time and only its hash is stored.

**`employees.pseudo_id`** is a random opaque identifier minted at enrolment. **No names, no email
addresses.** `department` is the only attribute stored, because it is the only one the dashboard
requirement needs. This is a deliberate privacy floor, not an oversight — see §8.

**`usage_events` never contains raw prompt text.** It carries event type, violated category, and a
salted-hash finding reference, per decision #5 and invariant I3.

---

## 5. Components and data flow

### 5.1 End-to-end flow

```
enrol     employee pastes department token → POST /v1/enroll {token}
                                    → {org_id, pseudo_id, department, policy, version}
                                    → chrome.storage.local
poll      GET /v1/policy  (If-None-Match: version)  every 30s + on tab focus  → 304 | new policy
detect    content script on a registry host → host not approved? → warn banner + "Request access"
request   POST /v1/requests {llm_host, reason} → admin queue
approve   admin approves → org policy_version bumps → employee's next poll clears the banner
ethics    prompt submit → local classifier → violation? → red modal naming the category → blocked
audit     POST /v1/events {pseudo_id, department, host, type, category, hash, ts}
```

🔴 **Every call to the policy service originates in the background service worker, never a content
script.** See §5.4 — this is forced by the demo topology, not a style preference.

**Event flush timing:** immediate, with a short debounce to coalesce bursts. The demo requires the
admin's dashboard to reflect an employee's block within a second or two; an interval-based batch
would kill that beat. A production build would batch on an interval to spare battery and network,
and **that interval is a number to measure rather than invent.**

### 5.2 Admin console screens

1. **Login** — org admin password (see §9 for the honest limit).
2. **AI tools** — the registry, each row approved/blocked, toggle. This is where revocation happens.
3. **Requests** — pending access requests with employee department, requested tool, and reason.
   Approve / Deny.
4. **Usage** — events by department, by tool, by ethics category, over time. Satisfies use case 3.
5. **Enrolment tokens** — mint a token per department, display once, revoke. Cheap once the table
   exists, and it gives the demo a natural opening beat.

### 5.3 Extension changes

- **Options page** — enrolment token input; on success displays
  *"Connected to Acme Corp · 12 approved tools · policy v34"*.
- **`src/policy/`** — enrol, poll with ETag, cache in `chrome.storage.local`, expose current policy.
- **New content script** matching the registry hosts — warn banner + Request access.
- **`src/detection/ethics/`** — classifier runtime, slotted into the existing send-gate path.
- **Modal** — extends the existing component with a red variant naming the violated category.
- **`src/audit/`** — extend [`audit.ts`](../../../code/extension/src/audit/audit.ts) to batch-ship
  events. It already produces the correct shape (class + salted fingerprint, never raw text).

Host permissions grow from 4 to **13** — 8 registry hosts, 2 file-service origins, 3 policy-service
origins (§5.4). **Still no `<all_urls>`** — see §9.

### 5.4 🔴 Network topology — the two-laptop demo forces an architectural change

The demo runs on **two laptops** (founder, 2026-07-19): employee on one, admin on the other. That is
more convincing than two Chrome profiles on one machine, and it breaks the current fetch design.

**The defect.** [`api.ts`](../../../code/extension/src/files/api.ts) calls `fetch()` directly from
content-script code running on `https://chatgpt.com`. This works today **only because
`http://localhost` is a Chrome special case** — localhost is treated as potentially trustworthy, so
mixed-content blocking does not apply. `http://192.168.x.x:8000` gets no such exemption: an HTTPS page
fetching plain HTTP on a LAN address is **blocked as mixed content**. The demo would fail on stage,
and it would look like the product was broken rather than the network.

**Two fixes, both required:**

1. **All policy-service traffic originates in the background service worker.** It runs on a
   `chrome-extension://` origin — a secure context — so with host permissions it may fetch `http://`.
   This is also simply where a poll loop belongs. Plan B must not reuse `api.ts`'s content-script
   fetch pattern for policy calls.
2. **Bake two origins into `host_permissions` before the build.** `host_permissions` is static at
   manifest-build time, so **the venue's IP cannot be added on the day.** Ship both:
   - a known LAN address, made predictable with a phone hotspot and a reserved IP, and
   - a stable HTTPS tunnel hostname (a *named* `cloudflared` tunnel gives a fixed URL).

   The tunnel path also sidesteps mixed content entirely, which makes it the better primary and the
   LAN path the offline fallback.

⚠️ **This is a build-time decision with a stage-day consequence. It cannot be deferred to
rehearsal.**

---

## 6. The ethics classifier

### 6.1 Categories

Six, each with an admin-visible label so the modal names **which** policy was violated rather than
saying "unethical":

| Key | Label |
|---|---|
| `covert_surveillance` | Covert monitoring of employees |
| `undisclosed_profiling` | Profiling people without their knowledge |
| `discriminatory_screening` | Screening or ranking people on protected attributes |
| `security_evasion` | Evading security controls or producing exploit code |
| `harassment_content` | Harassing, threatening, or abusive content |
| `regulatory_circumvention` | Circumventing legal or regulatory obligations |

The first two are the case study's own named prohibitions, verbatim. `security_evasion` is the
Fable 5 / Mythos 5 incident the case study cites.

### 6.2 Model

One-vs-rest **LinearSVC** over TF-IDF: word 1–2 grams plus char 3–5 grams. Char n-grams buy partial
robustness to paraphrase and typos.

**A LinearSVC is a dot product.** Training happens in Python; the artifact exported to the extension
is vocabulary + IDF + per-category coefficients as JSON. The runtime is tokenize → TF-IDF → dot
product → argmax over a per-category threshold. No ONNX, no WASM, no model download, no first-run
fetch.

> 🔴 **Corrected 2026-07-19. This read "(~40 KB, estimate)". The figure was never derived and is
> wrong by roughly an order of magnitude.** Six categories over a realistic vocabulary is a few
> hundred thousand coefficients — **1–3 MB of dense JSON**. Pruning to the top-N coefficients per
> category and storing them sparsely brings it to the low hundreds of KB, but **the number is a
> measurement, not an assertion**, and Plan C's export task prints it and records it. **A plausible
> number nobody checked is this package's named failure mode (CLAUDE.md §9); it should not have
> survived into a spec, and it did.**

**Latency is expected to be sub-millisecond `(estimate — to be measured, not asserted)`.** No figure
is published in the demo until it has been measured on the demo machine.

### 6.3 The corpus — negatives matter more than positives

~200 positives per category, LLM-generated and hand-audited. The load-bearing part is the
**hard-negative suite**: prompts that sit inches from a positive and must never fire.

```
"write a script to monitor server uptime"          → not covert_surveillance
"track employee onboarding progress"               → not covert_surveillance
"screen resumes for Python experience"             → not discriminatory_screening
"write a penetration test report for our own app"  → not security_evasion
"summarise GDPR obligations for our team"          → not regulatory_circumvention
```

Precision is quasi-contractual per [ADR 0001](../../adr/0001-buyer-is-the-compliance-officer.md).
The hard-negative suite is therefore a **pass/fail regression fence at 100%**, not a metric to be
averaged into an F1 score.

### 6.4 Caching

Verdicts cache under Slice 1's existing verdict cache and
[ADR 0013](../../adr/0013-two-stage-verdict.md)'s **monotonic-toward-dirty** rule — the classifier may
write DIRTY; only a completed clean scan may write CLEAN. This is the "vector cache" from the original
demo sketch, and it is already built.

### 6.5 Stated limits — in the spec, not discovered on stage

- **English-only.** A TF-IDF model trained on English is effectively blind in BM and ZH — **the
  wedge's own languages.** This is the third instance of the beachhead being the hard case, after
  U12-b and doc 06 §4.3.
- **Bag-of-words, so a determined paraphrase evades it.** It detects phrasing, not intent.
- **Trained on synthetic data (C3-b).** Per doc 07 §5, an LLM generating policy-violating prompts
  generates the *stereotypical* distribution.
- It is a **demo-grade instrument.** Saying so first is doc 00 §7's underclaiming argument; being
  caught not having said it is the alternative.

---

## 7. Enforcement policy

> **Which tool you use is advisory. What you ask it to do is blocking.**

| Trigger | Response | Reason |
|---|---|---|
| Unapproved LLM host | **Warn banner + Request access, dismissible.** Visit logged either way. | The case study: *"outright bans tend to push usage further out of sight"*, and the goal is *"willing compliance"*. A hard block sends the employee to their phone, where visibility is zero. Consistent with [ADR 0014](../../adr/0014-degrade-to-advisory-never-closed.md) — blocking relocates the leak to a channel that cannot be audited. |
| Ethics category hit | **Red modal, blocked.** | A covert-surveillance script is a bright-line prohibition, not a tooling preference. |
| Sensitive data (L1/L2) | Existing Slice 1 behaviour — block + modal + Ignore-with-reason | [ADR 0017](../../adr/0017-slice-1-technical-choices.md) §5, unchanged |

---

## 8. Transparency posture — answer this before you are asked

The case study names *"covertly monitoring employees"* as a forbidden use. **This product monitors
employees' prompts.** A judge will ask.

The answer is architectural rather than promissory:

1. **The audit record contains no raw prompt text** — class, count, and salted-hash reference only
   (decision #5, invariant I3). The employer cannot read what an employee typed.
2. **The employee sees every intervention as it happens.** There is no silent mode.
3. **Identity is pseudonymous** — an opaque ID and a department, never a name or email.
4. **Enrolment is an explicit act.** The employee pastes a token; nothing is installed behind them.

Vanguard is *transparent* monitoring, and the design enforces that rather than promising it. **Lead
with this in the pitch.**

Cost the case study forces, stated honestly: *"track AI usage across departments"* requires
per-employee attribution, which Slice 1 did not have at all. This spec introduces a real new privacy
surface. The pseudonymous floor in §4 is the mitigation, not a claim that the surface does not exist.

---

## 9. Demo shortcuts and their honest answers

| Shortcut | The honest answer if asked |
|---|---|
| Admin password is a single per-org secret, checked server-side | *"Real deployments use SSO/SAML against the corporate IdP. The check is server-side today, which is the part that matters — the client never adjudicates it."* |
| Enrolment token is per-department, not per-employee | *"Production issues per-employee tokens through the same MDM channel as `ExtensionInstallForcelist`. Per-department is enough to prove the model, and it keeps department integrity — the employee cannot self-declare."* |
| Curated LLM registry (8 hosts) rather than `<all_urls>` | 🟢 **Not a shortcut — a better answer.** *"AI surfaces are a known, finite, curated set. We do not need permission to watch the entire web, and asking for it would fail your own security review."* (doc 02 §6.4) |
| Classifier trained on synthetic data | *"Demo-grade. Production needs a real substrate — that's what [ADR 0015](../../adr/0015-eval-corpus-is-real.md) already commits us to for the sensitivity model."* |
| SQLite, single process | *"Postgres and per-tenant DEKs from day one in production — that's [ADR 0009](../../adr/0009-org-dictionary-key-custody.md), already decided."* |
| Policy propagates on a 30s poll | *"Push in production. 30s is a demo simplification, and revocation latency is a number we'd publish."* |

🔴 **A client-side admin password would NOT have an honest answer, which is why §4 puts the check
server-side.** An "admin mode" unlocked by a secret held in extension storage is bypassed with
devtools in under a minute, and it would ship a control whose audit trail claims it worked — doc 00
§6's worst case. That option was rejected in brainstorming and must not return.

---

## 10. Testing

| Unit | Approach |
|---|---|
| `code/policy/` | pytest: enrolment, ETag/304 behaviour, `policy_version` bump on every write, request lifecycle, admin auth, event ingestion rejects raw text |
| `code/classifier/` | Held-out precision per category; **hard-negative suite as a pass/fail gate** (§6.3) |
| `code/extension/` | vitest alongside [existing tests](../../../code/extension/tests/) — policy client (cache, ETag, offline), ethics gate |
| End-to-end | A scripted demo rehearsal. The failure mode for a pitch is a demo that only works on the machine it was built on. |

**Test-boundary rule, inherited from the U12 harness failures** (CLAUDE.md §2 ledger #11): tests must
not hand a component the input its own producer failed to generate. The policy-client tests drive the
**HTTP boundary**, not a pre-populated cache object; the ethics tests drive **prompt text in → verdict
out**, not a pre-computed feature vector. A fixture that supplies the field under test is testing the
fixture.

---

## 11. Explicitly out of scope

- SSO / SAML / real IdP integration
- Per-employee token issuance and MDM distribution
- Push-based policy propagation
- Multi-admin, roles, delegated approval
- The `ml/` sensitive-vs-not span classifier (parallel track, ADR 0018 — unaffected by this spec)
- Rehydration (E2 — killed, and not reopened by anything here)
- Slice 2 file-content work (in progress, unaffected)
- Any production-grade claim about the classifier's accuracy

---

## 12. Decisions resolved 2026-07-19

All four open questions are now closed by founder decision. Recorded here rather than deleted, so a
fresh session sees what was considered and does not reopen them.

| Question | Decision | Consequence |
|---|---|---|
| Department: employee-picked or token-encoded? | **Token-encoded** | Per-department `enroll_tokens` table (§4) + a minting screen (§5.2) |
| Event batching interval | **Immediate, short debounce** | Demo needs sub-second dashboard updates (§5.1); production interval stays a measured number |
| One machine or two? | **Two laptops** | Forces §5.4 — background-SW fetch and two baked-in origins |
| ADR for the ADR 0016 departure? | **Yes — ADR 0029**, at implementation time | Records the sequencing departure and its scope limit (§1.1) |

**Remaining, and deliberately unset:** the production event-batching interval, and the per-category
classifier thresholds (§6.2) — both are measurements, and this package does not launder an estimate
into a constant by writing it in code.
