# ADR 0023 — ML-track compute and data-residency gates

**Status:** Accepted · **Date:** 2026-07-18 · **Decider:** the founder
**Related:** [ADR 0015](0015-eval-corpus-is-real.md) (residency), [ADR 0022](0022-human-simulated-substrate-and-counsel-waiver.md), doc 02 §6.2 (`ap-southeast-5`)

## Context

The parallel ML track ([ADR 0018](0018-sensitive-vs-not-parallel-track.md)) trains a multilingual
model and evaluates it, on a team with a single **RTX 5070 (32 GB RAM)** machine plus Google Colab.
Two things must not drift: (a) unit tests must stay CI-runnable without a GPU or torch, and (b) real
Malaysian personal data (if ever introduced) must not leak to non-MY cloud infrastructure.

## Options

Considered but rejected: assume-GPU-everywhere (breaks CI), and allow-any-cloud (breaks residency).
The decision below is the pragmatic split.

## Decision

**Encode these as explicit gates in the plan and in `sens.residency`:**

- **CI / unit tests / tiny-fixture smoke = CPU-only, no torch import required to pass.** The committed
  test suite runs without the `[train]` extra.
- **`llm_synthetic` training may use Google Colab.** Synthetic data is privacy-clean and location-free.
- **`real`-provenance data stays on the local MY machine (RTX 5070) / MY-region infra — never Colab or
  non-MY cloud** (`assert_upload_allowed` refuses it). `human_simulated` eval runs on CPU or the local
  RTX 5070; it needs no cloud.
- **A held-out `eval` split is never used for training** ("don't train on the exam") —
  `assert_no_eval_in_train` guards every training load.
- **Retraining on real-eval failures happens locally** (RTX 5070 / MY-region), not on Colab.
- **End-user inference target = CPU/WASM baseline, WebGPU optional** — stated in the export contract; no
  model is trained that requires a discrete GPU to run.

## Consequences

- CI stays fast and green on any machine; training is an explicit off-CI step with its own extras.
- Residency is enforced in code, not just in prose — the guard fails loudly rather than trusting an
  operator to remember. `ap-southeast-5` GA (U13 ✅) makes MY-region infra available if `real` data
  ever enters scope.
- The train/exam separation is a code invariant, so a misconfigured run cannot silently score the model
  on data it trained on.
