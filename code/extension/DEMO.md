# Two-laptop demo runbook

**Laptop A — admin.** Runs the policy service and the console.
**Laptop B — employee.** Runs Chrome with the extension loaded unpacked.

## Before the day

🔴 **`host_permissions` is baked at build time.** Decide the addresses now.

1. Reserve a LAN IP for laptop A on the hotspot you will use, or set up a named
   `cloudflared` tunnel with a fixed hostname.
2. Put both in `wxt.config.ts` (Task 8), then `npm run build`.
3. Verify from laptop B's browser that `http://<laptop-A>:8001/healthz` returns
   `{"ok": true}` **before** you need it on stage.

## Setup

Laptop A:
```bash
cd code/policy
.venv/Scripts/python scripts/seed.py            # prints the department tokens
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Laptop B: load `code/extension/dist/chrome-mv3` unpacked, open the options page,
set the policy address to laptop A, paste the **Engineering** token.
Expected: *"Connected to Acme Corp · Engineering · 2 approved tools"*.

## The run

| # | Laptop | Action | What the audience sees |
|---|---|---|---|
| 1 | A | Open the console, sign in as `Acme Corp` / `vanguard` | Eight AI tools, two approved |
| 2 | B | Open `gemini.google.com` | Amber banner: not approved at Acme Corp — **and the page still works** |
| 3 | B | Click Request access, type a reason, send | "Request sent" |
| 4 | A | Requests screen | The row appears within ~3s, with the department |
| 5 | A | Approve | — |
| 6 | B | Do nothing | **The banner disappears on its own within ~5s.** This is the beat. |
| 7 | B | Paste a prompt with an NRIC into ChatGPT | Existing Slice 1 modal blocks it |
| 8 | A | Usage screen | Events by department, tool, and category |

## If the network fails

The extension falls back to its **cached** policy (ADR 0014 — degrade to
advisory, never fail closed), so nothing blocks and nothing crashes. Say so; it
is a designed behaviour, not a save.
