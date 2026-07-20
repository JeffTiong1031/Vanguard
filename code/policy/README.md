# `policy/` — AI governance service

Org identity, AI-tool policy, approval workflow, and usage events. Serves the
admin console at `/`.

**Spec:** [`docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md`](../../docs/superpowers/specs/2026-07-19-ai-governance-platform-design.md)

## The boundary with `backend/` — do not merge these

`backend/` parses files and keeps nothing;
[`test_zero_retention.py`](../backend/tests/test_zero_retention.py) defends that
in executable form. This service is the opposite: org state is its whole job.

Note that `backend/README.md` describes itself as *"policy, dictionary, and
hashed audit ingest"* — that is **this** service. What was built under
`backend/` is the file pipeline. The split is deliberate, not accidental.

## Run it

```bash
python -m venv .venv && .venv/Scripts/pip install -e ".[dev]"
cd admin && npm install && npm run build && cd ..
.venv/Scripts/python scripts/seed.py          # prints the department tokens
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

`--host 0.0.0.0` is required for the two-laptop demo (spec §5.4).

## Standing constraints

- 🔴 **I3: classes, counts, salted hashes. NEVER prompt text.** `UsageEvent` sets
  `extra="forbid"`, so an event carrying a `prompt` field is **rejected**, not
  ignored. `tests/test_events.py` is that rule in executable form.
- 🔴 **Admin authority is server-side, on every request.** The console is a view.
- 🔴 **The 422 handler in `app/main.py` is a privacy control, not a formatting
  nicety.** Pydantic's `RequestValidationError.errors()` embeds the rejected
  value verbatim under `input` — for a `missing`-field error that can be the
  **entire request body**. FastAPI's default handler serialises `errors()`
  straight into the response, so a prompt sent to `/v1/events` under the wrong
  key would come straight back out in the 422 body. The handler strips `input`
  (and `ctx`) before responding. **Do not "simplify" this back to FastAPI's
  default handler — the default is the vulnerability it exists to close.**
- **Employees are pseudonymous.** No name or email column exists in `employees`.
- **Every policy write calls `bump_policy_version()`.** It is the ETag; a missed
  bump is a client that never refreshes.
- 🔴 **Revoking an enrolment token blocks FUTURE enrolments only.** It does not
  deprovision employees who already enrolled with that token — there is no
  per-employee revocation in this system. The Tokens screen states this in the
  UI; this is the same fact stated here.
- **Demo-grade.** SQLite, one admin password per org, no SSO. Spec §9 carries the
  honest answer for each.
