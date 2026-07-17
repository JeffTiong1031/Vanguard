# ADR 0009 — Org dictionary key custody: KMS envelope in Phase 0, managed-policy key in Phase 1

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Depends on:** ADR 0004, invariant
**I4** (doc 01 §5), decision #6, B3, U19

## Context

ADR 0004 made the org-custom dictionary a Phase 0 L1 feature — customer-supplied codenames and
internal IDs, exact-matched locally. Doc 00 §1.3 calls it the highest-value feature in the product.
ADR 0004 also recorded that **the dictionary is itself sensitive**: a list of a company's unannounced
codenames is a target. Invariant **I4** states it is sensitive at rest — *synced encrypted, matched
locally, never sent to our servers in the clear.*

**The problem I4's phrasing hides:** the admin **types the codenames into our web console**. At that
instant the plaintext is in our server's memory, regardless of database encryption. Encryption-at-rest
satisfies *"never sent in the clear"* on a technicality — TLS means it was never in the clear *on the
wire* — while handing us exactly what I4 exists to withhold.

**This is the same failure mode as the rehydration kill** (doc 01 §5, founder-closed 2026-07-16):
satisfying an invariant's **letter** while defeating its **purpose**. It is now the second instance in
this package, which is why the rule is stated explicitly: *check the invariant's purpose, not its
wording.*

## Options

| | Approach | I4 in spirit? | Cost at A1 |
|---|---|---|---|
| 1 | Plaintext at backend, TLS + encryption-at-rest | ❌ We read it | Free |
| 2 | Salted hashes only — store `H(term)`, match hashed n-grams | ❌ **Fake** | Medium |
| 3 | Envelope encryption — tenant DEK wrapped by our KMS | ⚠️ Partially — we *could* decrypt | Low |
| 4 | E2E — key never reaches us; console encrypts in-browser, extension decrypts | ✅ Yes | **High** (key distribution) |

### Option 2 gets a specific kill

It looks like the clever answer: store only salted hashes, hash candidate n-grams client-side, no
plaintext ever reaches us. **It provides no security whatsoever for this keyspace.**

> Codenames are **words**. ADR 0004 itself names "Atlas", "Titan", "Phoenix" as real ones. A salted
> hash of a term drawn from a few hundred thousand English words — plus mythology, birds, and
> constellations, the codename generator's actual distribution — is **brute-forced in milliseconds**
> per tenant. We hold the salt. **The keyspace is small and guessable by construction**, because a
> codename is chosen to be memorable to humans.

Option 2 would survive a diagram review and fail a first-year crypto exercise. Recorded here so it is
not re-proposed. *(It is the same error as doc 02 §4.2's TEE rejection: a cryptographic mechanism
chosen for how it reads rather than what it resists.)*

## Decision

**Phase 0: Option 3** — envelope encryption, tenant DEK wrapped by our KMS — **with the limitation
stated explicitly in the DPA and on the security page.**

**Phase 1: Option 4** — the tenant key is delivered by **the same machine policy that force-installs
the extension**, read via `chrome.storage.managed`. The key never touches our infrastructure.

### Why Phase 1's mechanism is right

The admin is **already writing machine policy** to force-install us —
`HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist` on Windows (High confidence per the
B3 correction), a signed `.mobileconfig` on macOS (U16). Adding a key to that policy payload costs
them **nothing extra**, and it means:

- **No escrow.** No recovery flow. No key-management product.
- The console encrypts in the browser; the backend stores an **opaque blob** it cannot open.
- **We lose the capability** *(for data written after cutover — see "The migration is not the cutover"
  below, which is where this claim is easiest to overstate)*, rather than promising not to use it.

*(U19: `chrome.storage.managed` must be verified to carry a payload of our size and shape.)*

> **U19 ✅ RESOLVED 2026-07-17 (doc 05 §8.2) — the mechanism is confirmed, the size worry was never
> proportionate, and the real finding is one this ADR didn't ask about.**
>
> **Confirmed** *([Chrome storage docs](https://developer.chrome.com/docs/extensions/reference/api/storage))*:
> `managed` is **read-only** — *"trying to modify this namespace results in an error"* — and populated
> by admins *"using a developer-defined schema and enterprise policies."* **Exactly what this ADR
> assumed.**
>
> **On size: Chrome documents no quota for `managed`**, while documenting them for `local` (10 MB),
> `sync` (100 KB total / 8 KB per item) and `session` (10 MB). **That gap is real and it is not a risk
> to this ADR.** The payload here is **a tenant key — 32 bytes, ~44 base64 characters.** The
> **smallest** documented quota anywhere in that table, `sync`'s 8 KB per item, clears it by **~256×**
> *(derived)*. **A namespace that would choke on 44 bytes would be unusable for its documented
> purpose.** The phrase *"a payload of our size and shape"* imported a worry that belongs to bulk data
> and applied it to a key. **The residual risk is schema and delivery — i.e. B3 — which this ADR
> already names as the actual coupling, and which is not a `chrome.storage` question.**
>
> 🔴 **The finding that matters, and it is a boundary defect, not a capability one:**
>
> > *"`storage.managed` is **exposed to content scripts**, but this behavior can be changed by calling
> > `setAccessLevel()`"*
>
> **This ADR puts the tenant key in `storage.managed` and reasons about it as extension-privileged
> (B3). By default it is not: content scripts can read it, and content scripts are B2** — one boundary
> closer to the page, running in **every tab** where a target surface is open.
>
> **It does not breach I4** — B2 is our code and the page cannot read it — **but the key has no
> business there.** Nothing in B2 decrypts the dictionary; the engine is in the offscreen document.
> **This is the letter-vs-purpose trap for the third time** (doc 01 §5's rehydration, §5.1's
> encryption-at-rest, now this), and CLAUDE.md predicted a third. **Note how it surfaced: not by
> auditing the invariant, but by reading the API's default instead of assuming it matched our diagram.
> Defaults are where this trap lives, because a default is a decision nobody remembers making.**
>
> **Decision: the Phase 1 key channel calls `setAccessLevel()` to withhold `storage.managed` from
> content scripts.** One call, no cost, and it puts the key in the boundary this ADR always assumed it
> was in.

### The migration is not the cutover — Phase 0 exposure does not expire when the code ships

**The sentence to be suspicious of is "we lose the capability entirely."** Shipping the Phase 1
mechanism makes it true for **new** dictionary writes and false for everything already written. On
cutover day, Phase 0-era plaintext-equivalent material still exists in at least:

| Where | Does new code touch it? | Purgeable by deleting rows? |
|---|---|---|
| Live DB rows (ciphertext + our KMS-wrapped DEK) | Yes — re-keyed | ✅ Yes |
| **DB backups and snapshots** | **No** | ❌ **No — immutable, and retention outlives cutover** |
| Read replicas, dev/staging restores of prod | No | ⚠️ Only if enumerated |
| Application logs / retry queues touching the sync path | No | ⚠️ Only if they never held terms (§4.3's threat) |
| KMS access logs (CloudTrail) | No | **Keep — they are the evidence, not the exposure** |

**Backups are the trap.** You cannot selectively purge one tenant's dictionary rows from an immutable
snapshot. So if backup retention is, say, 35 days, then *"we cannot read your codenames"* remains
**false for 35 days after** we start saying it — and we would be saying it in a security review.

**Decision rule — cryptographic shredding, and it dictates a Phase 0 design constraint:**

> **The Phase 1 cutover is complete when the Phase 0 tenant DEK is destroyed in KMS, not when the new
> code ships.** Destroying the key renders every Phase 0-era ciphertext — including the copies inside
> immutable backups we cannot reach — permanently undecryptable **by us or by anyone who takes our
> backups.** That converts an unpurgeable-data problem into a **key-destruction** problem, which is
> tractable.

Sequence, and none of it is optional:

1. Ship Phase 1 mechanism. Tenant re-enters or console re-encrypts the dictionary under the
   managed-policy key. **Both mechanisms live briefly — this window is when the claim is weakest.**
2. Verify the tenant is fully migrated, then purge live rows.
3. **Schedule deletion of that tenant's Phase 0 DEK** (AWS KMS enforces a 7–30 day waiting window —
   `[verify current bounds]`).
4. **The "we cannot decrypt" claim becomes true on the key-destruction date**, not the deploy date.
   **Publish that date; do not round it toward the deploy.**
5. Confirm no application log or retry queue ever held decrypted terms (§4.3's own threat, applied to
   ourselves).

> 🔴 **Phase 0 design constraint imposed by this rule, and it is expensive to retrofit: the Phase 0
> DEK must be per-tenant from day one.** A single global DEK cannot be destroyed for one migrated
> tenant without shredding every unmigrated tenant's dictionary — which would make staged migration
> impossible and force a flag-day cutover across the whole customer base. **This costs nothing to
> honour now and is painful to correct later**, which per the engagement rules is exactly the kind of
> decision that gets flagged before it's written into multiple docs.

### Why not Option 4 in Phase 0

**Because in Phase 0 there is no machine policy.** Decision #6 is self-install. Without a policy
channel, an E2E key needs escrow, recovery, and rotation for customers who lose it — **a
key-management product, at A1 headcount, for a wordlist, before B3 tells us whether anyone will deploy
this at all.**

**And the package must be consistent with itself.** Doc 02 §4.2 rejects TEEs as *cryptographic answers
to contractual questions*. Building key-escrow infrastructure in Phase 0 is the **identical error** —
an expensive cryptographic apparatus answering a question that a DPA clause and a KMS access log
answer adequately until the policy channel exists for free.

## Consequences

**Accepted:**
- **In Phase 0 we can technically read any customer's codename list.** Mitigations — KMS access
  logging and alerting, a DPA prohibition, a scoped break-glass role — are **controls, not
  impossibilities.** A determined insider at our company defeats all three, which is the same honesty
  doc 00 §6 applies to determined insiders at the customer's.
- **This is the single weakest privacy claim in the package**, and it sits in the feature doc 00 calls
  the most valuable. It gets a date and a mechanism, **not a euphemism.**
- **The Phase 0 answer must be given in full, unprompted:** *"Your dictionary is encrypted, access is
  logged, our DPA forbids us reading it, and we hold the key — so this is a contractual control, not
  a mathematical one. In Phase 1 it becomes mathematical and we lose the ability."* That answer is
  honest, checkable, and dated. **What is not acceptable is describing Option 3 as if it were Option
  4** — which is exactly what *"synced encrypted, never sent in the clear"* invites if nobody reads
  the fine print.
- **Phase 1 key custody is now coupled to force-install**, and therefore to **B3**. If the segment
  won't deploy machine policy, we don't just lose the control story (ADR 0002) — **we lose the
  dictionary's key-custody upgrade with it.** Two consequences, one assumption.
- I4 is the **only invariant posture B cannot claim in full** (doc 02 §7).

**Costs:**
- Two key-custody designs to build, and a migration between them — **and the migration has a tail.**
  Per "The migration is not the cutover," the Phase 0 capability survives in immutable backups until
  the Phase 0 DEK is destroyed. **The honest claim is dated by key destruction, not by deploy.**
- **Per-tenant DEKs in Phase 0**, adopted now solely to make staged crypto-shredding possible later.
  A global DEK would be marginally simpler today and would force a flag-day migration across all
  tenants.
- Phase 1 key rotation rides machine policy, so rotation is the admin's action, not ours — slower, and
  it needs a story for a compromised key.

**Revisit if:** the first design partner's security review **blocks** on key custody → Option 4 moves
into Phase 0 and we build escrow. **Do not pre-build it against the possibility.** One customer saying
it is worth more than our entire estimate of whether they will.
