# ADR 0002 — Browser extension as the form factor

**Status:** Accepted (2026-07-16) · **Deciders:** founder + CTO · **Depends on:** ADR 0001

## Context

Having chosen the enterprise buyer (ADR 0001), the obvious objection is that enterprise controls are
normally network-side or endpoint-side. A browser extension is removable, per-browser, and blind to
native apps. We had to justify the form factor on product grounds or abandon it.

## Options

| | Sees typing | Removable | Covers desktop apps | Pseudonymize **in-composer, pre-send** | Deploy cost |
|---|---|---|---|---|---|
| **Extension** | ✅ | ⚠️ until force-installed | ❌ | ✅ | **Low** |
| Forward proxy (TLS intercept) | ❌ send-time only | ✅ | ✅ | ❌ | High |
| CASB / SWG | ❌ | ✅ | ~ | ❌ | High (often already paid) |
| Enterprise browser | ✅ | ✅ | ❌ | ✅ | Very high — replace the browser |
| Endpoint agent | ✅ | ✅ | ✅ | ⚠️ hard | High |

## Decision

**Extension — because the product's core mechanic requires the DOM, not because it's cheap.**

The differentiated product is *"don't block — pseudonymize and preserve context"* (doc 04). That
mechanic is only possible from inside the page:

- A proxy sees a **committed** request. It can refuse it or corrupt it. It cannot negotiate with the
  user and cannot offer `John Tan → PERSON_1` in the composer, because by the time a proxy sees
  anything the request already exists. Its UX ceiling is a 403 page.
- Typing-time detection is impossible anywhere but the client — and per ADR 0005, the typing-time
  scan is not a UX nicety, it's what lets the send-gate decide synchronously.

**The DOM requirement selects two form factors, not one.** An enterprise browser would also satisfy
it, but asks the customer to replace the browser on every desk — a different deal size, sales cycle,
and buyer seniority. Not viable at 150 seats. **So the decision rests on "DOM access, cheaply," not
"DOM access, uniquely."**

## Consequences

**Accepted:**
- **The extension is the right vehicle for the *product* and the wrong vehicle for the *control*.**
  A control the user can remove is not a control. Force-install closes it; B3 is whether anyone will.
- **Uncovered: native desktop apps** (ChatGPT/Claude ship them). Blocking in the browser trains the
  user to find the uncovered channel. Mitigation is the customer's EDR/app-allowlisting, not ours.
  The claim must be scoped to the browser **in writing**.
- Per-surface adapter maintenance is a permanent tax (doc 05).
- Chromium-first (D1); Firefox/Safari are separate builds, deferred.

**Corrected 2026-07-16:** an earlier draft implied force-install requires Chrome Enterprise Core.
Wrong — `ExtensionInstallForcelist` reads from OS-level machine policy with no cloud enrollment: one
HKLM registry key on Windows (High confidence), a signed `.mobileconfig` on macOS (Medium, see U16).
The deployment barrier is low. **The sales barrier is unmeasured, and that's B3.**

**Corrected 2026-07-17 — this ADR argued the form factor on a capability we killed.** The options
table's fourth column read **"Pseudonymize + rehydrate"** with the extension marked **"✅ only
option"**, and the decision cited a proxy's inability to *"rehydrate the model's reply on the way
back."* **Rehydration is killed** (doc 01 §5, founder-closed 2026-07-16) — and **not because the
extension can't do it**, but because it writes plaintext back into the provider's persisted,
server-synced DOM. **This ADR therefore credited the extension with a capability the package
concluded is a liability, and used it as a reason to choose the extension.** Separately, **"only
option" was contradicted by the table's own enterprise-browser row**, which scores ✅ in the same
column; the prose below the table always said so. **Both defects are cosmetic to the verdict and
material to the argument:** the decision is unchanged, and it now rests only on capabilities that
ship — typing-time detection and in-composer pseudonymization — with deploy cost, not capability,
doing the work against an enterprise browser. **doc 00 §3 carried both defects and is corrected in
the same commit.**

**Revisit if:** B3 research shows the segment won't deploy; or if the buyer's fear turns out to live
in IDE copilots rather than chat UIs (B4), which would invalidate the surface entirely.
