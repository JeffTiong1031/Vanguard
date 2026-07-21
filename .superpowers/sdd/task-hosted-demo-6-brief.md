### Task 6: Docs — demo brief, warm-before-demo, deploy order

**Files:**
- Modify: `README.md` (add a "Hosted demo backend (no terminal)" subsection under the team-test quick start)
- Modify: `code/extension/ACCEPTANCE.md` (Slice 2 prerequisites note the hosted-URL option)

**Interfaces:**
- Consumes: nothing.
- Produces: instructions a tester/founder follows — the token brief, the `/healthz` warm step, and the deploy order.

- [ ] **Step 1: Add the hosted-backend subsection to `README.md`**

In `README.md`, immediately after the `### 2. Start the file-checking API (needed for Slice 2 / attachments)` section of the **team test** quick start, insert:

```markdown
#### Option: hosted demo backend (no terminal)

For demos where nobody should run Python/Docker, the file-checking API is hosted
on Render (Path A demo host — **not** the production/residency path). The committed
extension build already points at it, so testers just **clone → Load unpacked → use it**.

- **Testers:** you do not paste anything. The demo bearer token is baked into the build.
  Before a live demo, open `https://vanguard-extract.onrender.com/healthz` once to **wake
  the server** (free tier sleeps after ~15 min idle; first hit can take ~50s). It should show
  `{"ok":true}`.
- **If a file says "couldn't reach the file-checking service":** the host was asleep or is
  waking — wait a few seconds and attach again. The file is never sent to the AI unchecked.
- **Founder (one-time deploy):** Render dashboard → New → Blueprint → connect this repo
  (reads `render.yaml`); set `VANGUARD_DEMO_TOKEN` in the service env; then wire the real URL
  + token into the build (see the plan's Task 7). No terminal on any demo machine.

> This host is demo scaffolding only. It is not in-region, has no DPA, and is not the
> compliance story. Production (Path B) keeps files in Malaysia (`ap-southeast-5`),
> zero-retention, under DPA.
```

- [ ] **Step 2: Note the hosted option in `ACCEPTANCE.md`**

In `code/extension/ACCEPTANCE.md`, in the Slice 2 **Prerequisites** line (currently pointing at local `uvicorn`/compose + Options URL), add a sentence:

```markdown
Alternatively, use the hosted demo backend (Path A): the committed build points at it and the demo token is baked in — no local API needed. Warm `https://vanguard-extract.onrender.com/healthz` before the session (free tier sleeps).
```

- [ ] **Step 3: Verify the docs render / links resolve (visual check)**

Run: `grep -n "onrender.com/healthz" README.md code/extension/ACCEPTANCE.md`
Expected: matches in both files.

- [ ] **Step 4: Commit**

```bash
git add README.md code/extension/ACCEPTANCE.md
git commit -m "docs: hosted demo backend — warm-before-demo, token brief, deploy order"
```

---

