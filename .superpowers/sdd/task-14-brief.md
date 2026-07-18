### Task 14: end-to-end acceptance on real ChatGPT and Claude

**Files:**
- Create: `code/extension/ACCEPTANCE.md`

**Interfaces:** none — this is the manual acceptance gate that defines "Slice 1 accepted."

> No log can judge the visual criterion (doc 05 §1.2). This checklist is run by a human on both live surfaces. **It is the Slice 1 acceptance definition.**

- [ ] **Step 1: Write `ACCEPTANCE.md` with this checklist and run it on BOTH surfaces**

```markdown
# Slice 1 acceptance — run on chatgpt.com AND claude.ai

## Setup
- [ ] `npm run build && npm run check:dist` — dist is in sync
- [ ] Load `dist/chrome-mv3` unpacked (Developer mode)
- [ ] First use downloads + hash-verifies weights once (watch the SW console for the verify log)

## The real flow (REAL chapters 1-4 of the chronology)
- [ ] Type `Please call Ahmad about the deal.` → the send is blocked; the modal shows PERSON: 1 and the rewrite `Please call PERSON_1 about the deal.`
- [ ] Approve → the composer now holds the rewrite, caret at end, focus in the composer
- [ ] Press Enter (or click Send) yourself → the message sends (the token matches; the gate does not stop it)
- [ ] Paste `IC 890101-14-5555 and email me at a@b.com` → blocked; modal shows NRIC: 1, EMAIL: 1
- [ ] Type `explain Einstein's theory` → blocked (stock NER PERSON); Ignore-with-reason "public figure" → sends unrewritten. **This FP is expected and is the measurement (ADR 0017 §Consequences).**
- [ ] Type `what is 1 + 1` → NOT blocked (the guardrail holds)
- [ ] Compose in Chinese via Microsoft Pinyin → Enter commits candidates normally; only a send-intent Enter is gated (U12-b)
- [ ] Kill the offscreen document (chrome://extensions → inspect → close) mid-session → next send degrades to advisory ("protection degraded"), does NOT hang (ADR 0014)

## The invariants (must all hold)
- [ ] No network request carries prompt text (DevTools → Network, filter by your typed string → zero hits except the model CDN on first run)
- [ ] `chrome.storage.local` contains NO raw names/NRICs — only classes, counts, salted fingerprints (Application tab)
- [ ] The original value is never written back into the page after a rewrite (E2)
- [ ] On a second machine, the same name gets `PERSON_1` independently — there is no shared/synced map (trivially true: no backend)
```

- [ ] **Step 2: Commit**

```bash
git add code/extension/ACCEPTANCE.md
git commit -m "docs(ext): Slice 1 end-to-end acceptance checklist"
```
