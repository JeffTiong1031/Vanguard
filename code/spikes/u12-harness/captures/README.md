# The U12 / U20 captures — 2026-07-17

**Real runs, on the founder's own authenticated ChatGPT and Claude sessions, Windows, Microsoft
Pinyin.** These are the evidence behind `ASSUMPTIONS.md`'s U12-a / U12-b / U12-c / U20 rows. They are
committed because **doc 00 §7's underclaiming argument needs the artifact, not the assertion**: *"we
tested the thing that could kill it, first, and it held"* is only worth saying if a reader can check.

| File | What it evidences |
|---|---|
| `u12b-chatgpt-1.json` | **U12-b PASS** — focused capture, `keydown(code:"Enter", key:"Process", isComposing:true)` → `compositionend` → `keyup`. `focusedCapture: true`. |
| `u12b-claude.json` | **U12-b PASS** — same shape, same verdict. |
| `u20-chatgpt.json` | **U20 → HTTP.** `POST /backend-api/f/conversation`, **1882 B**. `webSocketFrames: 0`. |
| `u20-claude.json` | **U20 → HTTP.** `POST /api/organizations/…/completion`, **6576 B**. `webSocketFrames: 0`. |

## 🔴 Two things a reader must know before quoting these

**1. `armedStops: 0` in all four, and that is CORRECT, not a failure.** U20 requires an **unarmed**
run — an armed harness suppresses the send, and then there is no prompt body to size. **So the
armed-click PASS (U12-a, both surfaces) is the founder's live observation and is NOT evidenced by any
file here.** `ASSUMPTIONS.md` records it as exactly that. **Untested is not passed, and unsaved is not
evidenced.**

**2. The largest HTTP body is NOT the prompt, on either surface.** ChatGPT's is **2669 B of
`/ces/v1/t`** analytics; Claude's is **15486 B of `/api/v2/rum`**. **Analytics beacons are routinely
bigger than prompts.** U20 resolves on **a prompt-sized body on a conversation path** — attributed by
**path**, by a human. It does **not** resolve on `max(bodyBytes)`, and the analyser used to claim
otherwise.

## What was redacted, and what wasn't

**Claude's conversation path carried the founder's org UUID and conversation UUID.** This repo is
**public**. They are replaced with `<redacted-uuid>`; **the path shape — the whole of the U20
evidence — is preserved.** Nothing else was altered.

> 🔴 **And a tension worth stating rather than discovering later: the harness logs raw `key` values.**
> Here that is `n,i,h,a,o` and a `v` from `Ctrl+V` — harmless. **But I3 is "classes and counts, never
> values", and this instrument logs values.** It is **acceptable for a spike on two machines for a
> week** and it is **the exact shape the product's telemetry must never take.** `main-probe.js`'s
> header makes the same point about MAIN-world patching. **Nothing in this directory ships.**

## 🔴 The two files that used to be here were ZERO BYTES, and they were committed as evidence

**`Chat.json` and `claude.json` were committed empty in `fd03582` — a commit whose subject line is
*"Record the U12 run."*** They recorded nothing. Removed 2026-07-17.

> **This is CLAUDE.md §2 ledger #11's shape, and I shipped it in the commit where I was writing #10
> up.** The analyser bugs were *an honest verdict on a log that had been silently emptied.* **This was
> an honest commit message on an artifact that had been silently emptied** — and the failure was
> identical: **nobody checked that the record contained the run.** `ls -l` would have caught it. It
> takes one second and it was never run, because a filename that exists looks like a file that has
> something in it.
>
> **The rule that falls out: an artifact's existence is not its content, exactly as a claimed check is
> not a check.** Before committing evidence, **open it.**
