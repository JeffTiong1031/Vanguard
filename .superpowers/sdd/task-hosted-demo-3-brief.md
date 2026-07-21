### Task 3: Render blueprint

**Files:**
- Create: `render.yaml` (repo root — Render only reads it there)

**Interfaces:**
- Consumes: `code/backend/Dockerfile` (via `rootDir`).
- Produces: a one-click Blueprint deploy that builds the backend image on Render's free plan, health-checks `/healthz`, and exposes `VANGUARD_DEMO_TOKEN` as a dashboard-set env var.

- [ ] **Step 1: Create the blueprint**

Create `render.yaml` at the repo root:

```yaml
# Path A demo host for the Slice 2 file-checking backend.
# Deploy: Render dashboard -> New -> Blueprint -> connect this repo.
# NOT production: production file path is Malaysia + DPA + zero-retention (Path B).
services:
  - type: web
    name: vanguard-extract
    runtime: docker
    rootDir: code/backend
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /healthz
    envVars:
      - key: VANGUARD_DEMO_TOKEN
        sync: false   # set in the Render dashboard; never committed
```

- [ ] **Step 2: Validate it is well-formed YAML**

Run: `cd "C:/Jeff/UM AI/Y1 Sem break/HackAttack" && python -c "import yaml,sys; yaml.safe_load(open('render.yaml')); print('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add render.yaml
git commit -m "chore: Render blueprint for Slice 2 demo file-backend"
```

---

