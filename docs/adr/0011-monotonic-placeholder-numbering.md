# ADR 0011 — Placeholder numbering is monotonic; the vault is evictable

**Status:** Accepted (2026-07-17) · **Deciders:** founder + CTO · **Resolves:** doc 04 §8's vault
correctness bug · **Depends on:** ADR 0006, doc 04 §2.4

## Context

Doc 04 §8 handed doc 05 a bug:

> *"What happens to a live conversation's vault when the offscreen doc is reclaimed mid-thread? If it's
> lost, placeholder numbering restarts and **the model sees `PERSON_1` meaning two different people in
> one thread.** Doc 05 owns the state machine; **this is a correctness bug, not a performance one.**"*

It is real. Turns 1–4 establish `John Tan → PERSON_1`, `Mary Lim → PERSON_2`. Chrome reclaims the
offscreen document (ADR 0006 says it may). Turn 5 mentions Mary first, so she is minted `PERSON_1`.
**The thread now contains `PERSON_1` meaning two people and the model cannot tell.** It will attribute
turn 1–4's facts about John to Mary. **That is not degraded output — it is confident, wrong output about
identifiable people**, which is a bad failure for a product sold on handling identifiable people
carefully.

**And the two obvious fixes are in tension with two documents.** Persisting the vault fixes coherence,
but doc 04 §2.4 says exposure duration should be *"as short as coherence allows"*, and doc 04 §2.3 says
the vault at rest is **hashes + placeholders + a salt we hold** — *"less catastrophic, not safe."*
Evicting the vault aggressively honours §2.4 and reintroduces the bug.

**Rebuilding the vault is not available and it is worth recording why**, because it is the first thing
anyone proposes: the prior turns in the DOM contain **placeholders**, not the original values — we
replaced them before sending. There is no `PERSON_1 → John Tan` direction anywhere (doc 04 §2.2 —
that artifact deliberately does not exist). **Nothing can reconstruct the mapping from the page.**

## Options

| | Approach | Coherence | Exposure |
|---|---|---|---|
| 1 | Vault in offscreen memory only | ❌ **The bug** | Minimal |
| 2 | Persist the vault to IndexedDB, evict on doc 04 §2.4's rule | ✅ Within TTL | Mappings on disk for the TTL |
| 3 | Rebuild the vault from the page | — | **Impossible** (above) |
| 4 | **Persist the vault, and make the counter monotonic and outlive it** | ✅ Within TTL, **and safe after eviction** | **Same as 2** |

## Decision

**Option 4.** The vault persists to IndexedDB (doc 01 §6 already routes it there) and is evictable on
doc 04 §2.4's rule — tab close, navigation away, or TTL. **The per-conversation placeholder counter is
monotonic and outlives the mappings.**

### The asymmetry nobody costed, which is the whole decision

Doc 04 §8 named one failure. There are two, and they are **not the same severity**:

| Vault is lost and… | The model sees | Severity |
|---|---|---|
| **numbering restarts at 1** | `PERSON_1` = John **and** Mary. **Two people conflated into one token.** | 🔴 **Wrong.** Facts migrate between people |
| **numbering continues** | John = `PERSON_1` **and** `PERSON_5`. **One person split into two tokens.** | 🟠 **Degraded.** The model hedges or treats them separately |

> **Conflation is a correctness failure. Splitting is a quality failure.** Doc 04 §8 named only the
> first and then reasoned as though the fix had to be durability. **It doesn't.**
>
> **The counter is an integer.** It carries no value, no hash, and no salt — **it is not sensitive at
> all**, so keeping it costs nothing on the axis doc 04 §2.4 cares about. And keeping it **converts the
> dangerous failure into the benign one**, unconditionally, whether or not the mappings survive.

### Why this stops the tension rather than splitting the difference

Doc 04 §2.4 wants the mappings gone as fast as coherence allows. §5.3 wants them durable for
correctness. **Separating the counter from the mappings gives both, because they are sensitive for
different reasons and only one of them is sensitive at all:**

- **The mappings** — `hash(value) → placeholder` plus the salt — are the sensitive half. **Evict them
  on the tightest schedule coherence tolerates.** Their loss now costs coherence only.
- **The counter** — one integer per type per conversation — is the safety half. **Keep it for the
  conversation's life.** It cannot leak anything, because it isn't derived from any value.

**The worst outcome after eviction is a model that thinks John Tan is two people. That is a bad answer,
not a false one** — and the distinction is the product's, not a stylistic preference. A tool sold to a
compliance officer that hands back **wrong facts about named individuals** has failed at the thing it
is bought for. One that hands back a hedged, duplicated answer has merely been unhelpful, visibly, in a
way the user can see and correct.

## Consequences

**Accepted:**
- **The vault is on disk**, so its exposure duration exceeds doc 04 §2.4's ideal. Per doc 04 §2.3 this
  is **blast-radius reduction, not a boundary** — we hold the salt beside it, and a determined local
  reader recovers names from a small keyspace. **It stays in B3, I2 still binds, and the honest
  statement is that correctness bought this and the cost is real.**
- **Eviction is now a coherence decision, not a correctness one.** That is what makes an aggressive TTL
  affordable — it was not affordable when eviction meant conflation.
- **No TTL value is set here.** It interacts with doc 06's measured budget and doc 05 §6.4's token TTL.
  **Inventing one would silently decide how long sensitive material sits on a user's disk.**
- **Monotonicity is per conversation, per type.** Placeholder identifiers therefore need not start at 1
  in a resumed thread, and **nothing may assume `PERSON_1` exists.**

**Costs:**
- A counter that outlives its mappings is a **small piece of state with a different lifetime from the
  thing it indexes** — an easy thing for a future engineer to "clean up" into a single record, which
  would silently restore the conflation bug. **This ADR is the reason it is two records.**

**Revisit if:** doc 06's measurement shows offscreen reclamation is rare enough that the persisted
mappings are never actually read after a reclaim — in which case Option 1 plus the monotonic counter
becomes viable, **and it is strictly better on privacy**: no mappings on disk at all, and the failure
mode is already the benign one. **That is the outcome to hope for, and it depends on a number we do not
have.**
