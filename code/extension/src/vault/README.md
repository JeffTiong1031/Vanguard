# The mapping vault

**STUB.** Doc 04 §2, ADR 0011. Lives in the offscreen document (B3), persisted to IndexedDB.

## The two rules that a reasonable engineer will break

### 1. 🔴 It is FORWARD-ONLY. There is no `PERSON_1 → John Tan` direction.

```
salted_hash(value)  →  PERSON_1        ✅ the only direction that exists
PERSON_1            →  value           ❌ NOT "hard". NOT "restricted". NO PATH.
```

Doc 04 §2.2: every step of the outbound path queries `value → placeholder`. **The reverse map had
exactly one caller — rehydration — and rehydration is a settled kill** (doc 01 §5, founder-closed
2026-07-16). *"Killing rehydration didn't just close the hole I2 guards; **it deleted the asset that
made the hole worth exploiting.**"*

**If you find yourself writing a reverse lookup, you are rebuilding the artifact the kill deleted.**

### 2. ⚠️ …and it is STILL SENSITIVE. Hashing is not a boundary.

Doc 04 §2.3, and **ADR 0009 killed this identical reasoning three commits earlier**:

> `John Tan` is drawn from a keyspace of common given names × common surnames — **a few million
> combinations at the outside, and we hold the salt.** Anyone who can read the vault can read the
> salt beside it.

| Claim | True? |
|---|---|
| No plaintext names in the vault | ✅ |
| No leak via crash dump / log line / errant `JSON.stringify` | ✅ **a real, common leak class** |
| No `PERSON_1 → John Tan` direction to exfiltrate | ✅ **structurally** |
| **Therefore the vault is not sensitive** | ❌ **NO.** hashes + placeholders + salt = names |

**Blast-radius reduction and defense in depth. Not a security boundary.** **I2 still binds.**

---

## 🔴 The counter is a SEPARATE RECORD. Do not tidy it up.

**ADR 0011.** The vault persists and is **evictable** on doc 04 §2.4's rule (tab close, navigation
away, TTL). **The per-conversation placeholder counter is monotonic and OUTLIVES the mappings.**

| Vault lost and… | The model sees | Severity |
|---|---|---|
| **numbering restarts at 1** | `PERSON_1` = John **and** Mary — **two people conflated into one token** | 🔴 **WRONG.** Facts migrate between named individuals |
| **numbering continues** | John = `PERSON_1` **and** `PERSON_5` — one person split in two | 🟠 **Degraded.** The model hedges |

> **Conflation is a correctness failure. Splitting is a quality failure.** The counter is **an
> integer** — no value, no hash, no salt, **not sensitive at all** — so keeping it costs nothing on
> the axis doc 04 §2.4 cares about, **and it converts the dangerous failure into the benign one,
> unconditionally.**

⚠️ **ADR 0011's named cost, and it is why this README exists:**

> *"A counter that outlives its mappings is **a small piece of state with a different lifetime from
> the thing it indexes** — an easy thing for a future engineer to 'clean up' into a single record,
> **which would silently restore the conflation bug.** This ADR is the reason it is two records."*

**Rebuilding the vault from the page is impossible and it is the first thing anyone proposes:** the
prior turns in the DOM contain **placeholders**, not values — we replaced them before sending, and
there is no reverse direction anywhere. **Nothing can reconstruct the mapping from the page.**

---

## Scope

- **Per-conversation. Cross-conversation consistency is REJECTED** (doc 04 §2.4) — **the model has no
  memory across conversations**, so `PERSON_1` in Tuesday's thread means nothing in Wednesday's.
  It makes placeholders stable **for an audience that cannot perceive the stability**, and costs a
  **persistent local index of every sensitive value the user has ever typed.** *"Not a trade-off; a
  straight loss."*
- **No TTL value here** (ADR 0011). It interacts with doc 06's measured budget and doc 05 §6.4's
  token TTL. **Inventing one would silently decide how long sensitive material sits on a user's
  disk.**
- **Nothing may assume `PERSON_1` exists** — monotonicity is per conversation, per type, so a resumed
  thread need not start at 1.

## Placeholders (doc 04 §3)

**Numbered typed placeholders: `PERSON_1`, `IC_1`, `ORG_1`, `CODENAME_1`.**

❌ **Never surrogates** (`John Tan → Ahmad Bin Ali`). Doc 04 §3.2: **the kill makes them dangerous,
not merely inelegant.** Without rehydration the user reads the model's raw answer — a plausible
Malaysian name that is **not the person they asked about**, with nothing marking it as substituted.
**`PERSON_1` cannot be mistaken for a name, and the ugliness is load-bearing: it is a visible marker
that the system acted.**

❌ **No gender encoding** (doc 04 §4.2). Three independent reasons: we usually don't know it; the
NRIC's gender digit is **unverified** (doc 03 §2.1 — *do not gate on it*); and **Malay's `dia` is
gender-neutral**, so the loss is smallest exactly where we sell.

🟠 **Honorifics are masked WITH the span** (doc 04 §4.3): `Dato' Seri John Tan` → `PERSON_1`, not
`Dato' Seri PERSON_1`. The honorific set is **small, enumerable and largely public record** — masking
the name and leaving the pointer masks nothing. **The accepted cost is register**, with a revisit rule
(a tone marker decoupled from identity — **never restore the honorific**).
