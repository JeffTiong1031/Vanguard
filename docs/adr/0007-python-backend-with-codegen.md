# ADR 0007 — Python backend with generated TS types, not a unified TS stack

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Depends on:** A1

## Context

The extension is TypeScript. The obvious move is a TypeScript backend: one language, shared types for
free, no codegen, one toolchain, and a team of 2–3 (A1) that can context-switch cheaply. The brief
even asks for a "shared types package," which a TS backend gives you literally.

We rejected it. This ADR exists because the decision looks wrong on day one and reviewers will ask.

## Options

1. **Node/TypeScript backend** — unified language, free type sharing.
2. **Python + FastAPI** — codegen for types.
3. **Go** — fast, strongly typed.

## Decision

**Option 2 — Python + FastAPI + Pydantic, with Pydantic → OpenAPI → generated TS client.**

The argument is about **month four, not day one.**

Phase 1 brings the file pipeline (Tika/unstructured, OCR) and cloud L3. Both are Python-native. Under
Option 1, the Phase 1 backend becomes: a Node service, **plus** a Python service, **plus** the glue,
**plus** two deployment stories, **plus** two dependency ecosystems. At A1 headcount that is not a
tax, it's a tarpit. Choosing TS now means adding Python by Phase 1 **anyway** — so Option 1 doesn't
avoid the second language, it just defers it until the schedule is tightest and pairs it with a
migration.

Option 3 rejected: Go is excellent at the Phase 0 backend (policy, dictionary, audit ingest — a CRUD
service) and then fights the entire ML ecosystem the moment Phase 1 starts. Optimizes for the easy
part.

> **The codegen tax is smaller than the two-language-ML tax, and it's the one that doesn't compound.**

Codegen is a one-time build-pipeline cost that stays constant forever. Two backend languages is a
cost paid on every feature, every hire, every deploy, and every debugging session, and it grows.

## Consequences

**Accepted:**
- A build step: Pydantic models → OpenAPI schema → generated TS client, checked into `shared/`.
- **The generated client must be generated in CI and diffed**, not hand-edited. A hand-edit to
  generated types is a silent contract break, and it will happen at least once unless CI fails on it.
- Phase 0's backend is thin (policy, dictionary, audit ingest) — Python is arguably overkill *for
  Phase 0 alone*. That's the point: we're not choosing for Phase 0.
- Two toolchains from day one (pnpm + uv/poetry). Accepted deliberately, and it's the honest version
  of a cost Option 1 would have hidden until Phase 1.

**Costs:**
- Type changes require a regeneration step, so the feedback loop across the API boundary is slower
  than a monorepo TS project.
- Engineers must be comfortable in both. At A1, with no dedicated ML hire, everyone touches Python
  eventually anyway — which is itself an argument for the decision.

**Revisit if:** Phase 1's file pipeline gets outsourced to a third-party API rather than built (which
would remove the Python-native gravity entirely and make Option 1 correct in hindsight). Worth a
serious look before Phase 1 starts — if we're buying file parsing rather than building it, this ADR
should be reopened, not honoured out of consistency.
