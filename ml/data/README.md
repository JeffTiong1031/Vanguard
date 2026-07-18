# Data policy

- **Commit:** tiny `llm_synthetic` fixtures under `fixtures/` only (safe, for CI).
- **Do NOT commit:** the human-authored eval exam, full LLM dumps, weights, ONNX, or any `real` prompt.
- `human_simulated` = human-written realistic office prompts with SYNTHETIC/replaced names and INVENTED
  ID digits (privacy-clean). Kept off git (large + is the exam), but not a counsel event.
- `real` = real unmodified personal prompts. NOT in scope this phase. If ever introduced: ADR 0015 /
  U25 counsel + retention STOP, and it stays on the local MY machine / MY-region infra — never Colab.
- The `eval` split is the exam: never merged into a training split (see `sens.residency`).
