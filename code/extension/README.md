# `extension/` — the skeleton

> ⬜ **STUBS. Nothing here runs.** The live code is [`../spikes/`](../spikes/), and
> [`../README.md`](../README.md) explains why the U12 harness is deliberately not built on this.
>
> **This directory is the shape of [doc 01 §2](../../docs/01-hld.md), so that a reader can see the
> architecture is real. It is not an implementation, and it does not pretend to be one** — per
> `../CLAUDE.md` §1 this repo is *"documents and a code skeleton, **not a running product**."*

## The map — doc 01 §2, one file per node

```
src/
  entrypoints/
    background.ts      SW · ephemeral, 30s idle (U10 ✅ cited)
                       · webRequest observer — LOG ONLY, NEVER ABORTS (ADR 0012)
                       · offscreen document lifecycle (ADR 0006 — Chrome may reclaim it)
    content.ts         ISOLATED world · document_start · the gate's home (ADR 0005)
    offscreen/         ONE engine, all tabs (ADR 0006). Window context → WebGPU IS available here
  gate/                capture @ window (ADR 0010) · composedPath() not target (ADR 0005)
  adapters/            per-surface. Doc 05 §3.1 ships NO selectors, deliberately
  detection/l1/        regex + structural validation + Aho-Corasick. NO CHUNKING, NO MODEL
  vault/               hash(value) → PERSON_1. FORWARD-ONLY (doc 04 §2.2)
```

**There is no `main-world/` directory, and its absence is a decision.** ADR 0012: **Phase 0 injects
nothing into the MAIN world.** *(The one MAIN-world file in this repo is the U12-c probe, which is a
measuring instrument for a week-long spike. Its header says so.)*

## The four things most likely to be got wrong by someone filling these in

1. 🔴 **The vault is forward-only. There is no `PERSON_1 → John Tan` direction** (doc 04 §2.2). Not a
   hard path — **no path.** If you find yourself writing a reverse lookup, you are rebuilding the
   artifact the rehydration kill deleted. **And it is still sensitive at rest** (doc 04 §2.3): we hold
   the salt and names are a small keyspace. **Hashing is blast-radius reduction, not a boundary.**
2. 🔴 **The placeholder counter is a SEPARATE RECORD from the mappings, with a different lifetime**
   (ADR 0011). This looks like something to tidy up into one object. **Tidying it up silently restores
   the conflation bug** — `PERSON_1` meaning two people in one thread, i.e. *"confident, wrong output
   about identifiable people."* **ADR 0011 exists because it is two records.**
3. 🔴 **The verdict cache is monotonic toward dirty** (ADR 0013). L1 may write `DIRTY`. **Only a
   completed L1+L2 scan may write `CLEAN`.** Without this the L1 short-circuit is **a silent
   fail-open** — the control reporting a clean scan of a prompt it never finished scanning.
4. 🔴 **L1 masks placeholders before L2 runs** — `\b(PERSON|IC|ORG|CODENAME|…)_\d+\b` (doc 05 §6.2,
   doc 07 §6.1). Without it **L2 tags our own `PERSON_1` as a person** and the pipeline eats its own
   tail. **The approval token hides the loop for its whole TTL, so testing misses it.** The type list
   must be **generated from doc 04's minter, not typed twice.**

## What does not exist here on purpose

**No numbers.** No timeout (doc 06 §7.1), no token TTL (doc 05 §6.4), no vault TTL (ADR 0011), no
precision floor (doc 07 §1.5), no IME suppression window (doc 05 §1.3). **Every one is refused by the
doc that owns it, and a constant in a config file looks decided.** They are derived from U6-b, U12-b
and the B3 interviews — or they do not exist.

**No selectors.** Doc 05 §3.1, deliberately: they are stale by the time you read them (**D4**), and a
committed selector reads as a spec. The **adapter contract** is the artifact; the selectors are
per-surface and belong with the self-test that watches them fail (doc 05 §3.3).
