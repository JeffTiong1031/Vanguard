# Vanguard

Pre-seed **prompt-privacy** design package and Slice 1 Chrome extension (Manifest V3).

Stops employees leaking sensitive data into third-party LLM chat UIs (ChatGPT, Claude) via typing-time L1 hints, a send-time gate (L1 + on-device L2 NER), and context-preserving pseudonymization. **The user always presses Send** — no auto-submit. Raw prompts never leave the device for scanning.

This repo is primarily **documents + a working team-test extension**, not a shipping product. Buyer = enterprise compliance officer ([ADR 0001](docs/adr/0001-buyer-is-the-compliance-officer.md)).

---

## Quick start — load the extension (team test)

Branch: `slice-1-chat-text-extension`

1. Clone the repo and check out that branch.
2. **No toolchain required for the team test** — `dist/` is committed.
3. Chrome → `chrome://extensions` → Developer mode → **Load unpacked**
4. Select:

```text
code/extension/dist/chrome-mv3
```

5. Open [chatgpt.com](https://chatgpt.com) or [claude.ai](https://claude.ai) and try the flows in [`code/extension/ACCEPTANCE.md`](code/extension/ACCEPTANCE.md).

First scan downloads on-device model weights from a public CDN (hash-verified). That can take a minute on a cold cache.

### Developers (rebuild)

```bash
cd code/extension
npm install
npm test
npm run build          # refreshes dist/ + drift stamp
npm run check:dist     # fails if committed dist ≠ source
```

---

## What you get in Slice 1 / 1.5

| Surface | Behavior |
|---------|----------|
| **While typing** | L1-only rose underlines (NRIC, email, TIN, card, …) — advisory, never blocks Send ([ADR 0024](docs/adr/0024-slice-1-5-l1-composer-hints.md)) |
| **On Send** | Hard gate: Review before send — per-span Accept / Ignore-with-reason, Accept all, Proceed when all resolved ([ADR 0025](docs/adr/0025-send-time-per-span-review.md)) |
| **After Proceed** | Rewrite (or ignored originals) written into the composer; **you** press Send again |
| **Engine down** | Degrades to advisory — never fail-closed ([ADR 0014](docs/adr/0014-degrade-to-advisory-never-closed.md)) |

Not in Slice 1: file upload scanning (Slice 2), sensitive-vs-not classifier (parallel `ml/` track), rehydration of originals into the page (killed — E2), force-install / B3.

---

## Repo map

| Path | Role |
|------|------|
| [`ASSUMPTIONS.md`](ASSUMPTIONS.md) | Locked decisions + unverified claims register |
| [`docs/00`–`07`](docs/) | Critique → HLD → privacy → ML → LLD → perf → training |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records (0001–0025+) |
| [`CLAUDE.md`](CLAUDE.md) | Session briefing for agents / CTO context |
| [`code/extension/`](code/extension/) | **Slice 1 extension** (WXT, committed `dist/`) |
| [`code/spikes/`](code/spikes/) | U12 / U21-a measurement harnesses (evidence, not product) |
| [`code/backend/`](code/backend/) | Stub — Phase later |
| [`docs/team/`](docs/team/) | Briefs for parallel tracks (e.g. sensitive-vs-not) |

---

## Sequencing (do not reorder casually)

See [ADR 0016](docs/adr/0016-mvp-first-sequencing.md):

1. **Slice 1** chat text (this branch) → team acceptance  
2. **Slice 2** file **content** checking (scope argued first)  
3. Integrate sensitive-vs-not from the parallel ML track  
4. **Doc 08** roadmap/risks — only after both slices  

B3 (force-install interviews), U6-b threshold, and marketing stay **parked** until both slices land.

---

## Privacy posture (one line)

Prompt text is scanned **on-device**. We do not claim the provider’s page JS never sees composer text — we claim sensitive values **do not reach the provider’s servers / training set** after a rewrite. Never write originals back into the page after masking.

---

## License / status

Private pre-seed work. Not an open-source release. Contact the founder for team-test access.
