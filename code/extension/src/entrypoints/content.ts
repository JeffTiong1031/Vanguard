// ISOLATED world, document_start. The gate's home.
//
// STUB — doc 01 §2's shape. The LIVE version of this claim is
// ../../../spikes/u12-harness/iso-gate.js, and it is raw MV3 on purpose (see ../../../README.md).
//
// 🔴 BLOCKED ON U12-a. Doc 05 §1.2: "If U12-a fails, no part of this document survives." The gate
// would have to move to the MAIN world, which ADR 0005 shows destroys the synchronous cache read —
// which is doc 01 §0's coupling — which is decisions #2 and #8. Rework, not tuning.
//
// WHY THE GATE IS HERE AND NOT IN THE MAIN WORLD (ADR 0005): content scripts and page scripts share
// one DOM event dispatch — separate JS contexts, not separate event systems. And it matters
// enormously that the isolated world is WHERE THE VERDICT CACHE LIVES, so the gate can read it
// SYNCHRONOUSLY. A MAIN-world gate would have to postMessage across the world boundary — async —
// which reintroduces the stop-and-replay that doc 01 §0 exists to avoid, and replay IS the
// auto-submit decision #8 forbids.

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*'],
  runAt: 'document_start', // load-bearing: U12-c's mitigation is that we register before page JS
  world: 'ISOLATED',       // ADR 0005. Never MAIN (ADR 0012).

  main() {
    // TODO(U12-a)  gate: capture @ window (ADR 0010 — NOT document), composedPath() not
    //              event.target (ADR 0005, non-negotiable: shadow DOM retargets).
    //
    // TODO(U12-b)  composition rule: pass through Enter when isComposing || keyCode === 229.
    //              🔴 The post-compositionend suppression window has NO VALUE until U12-b measures
    //              it. Doc 05 §1.3: "It is derived from the U12-b measurement or it does not exist.
    //              Inventing '50 ms' now would be a number that silently decides whether Chinese
    //              input works."
    //
    // TODO         verdict cache: hash -> clean | dirty | unknown.
    //              🔴 MONOTONIC TOWARD DIRTY (ADR 0013): L1 may write DIRTY; only a completed
    //              L1+L2 scan may write CLEAN. Without this the L1 short-circuit is a SILENT
    //              FAIL-OPEN — the control reporting a clean scan of a prompt it never finished.
    //              I5: hash + boolean, NEVER text.
    //
    // TODO         approval token: hash(rewritten), single-use, isolated world (B2).
    //              TTL has no value yet (doc 05 §6.4).
    //              🔴 It does not send. It WITHHOLDS AN INTERRUPTION (doc 04 §6). Decision #8.
    //              Compute the rewrite ONCE and carry the string — then determinism is not required,
    //              because nothing is recomputed (doc 05 §6.2). The property that IS load-bearing is
    //              idempotency, and L1's placeholder mask delivers it (doc 07 §6.1).
    //
    // TODO         modal + overlay: Preact in a SHADOW ROOT (doc 01 §6, non-negotiable — our styles
    //              must not leak into a page we don't own, and theirs must not leak into ours).
    //              🔴 The Accept button stays DISABLED until the scan completes (doc 06 §5):
    //              accepting a partial finding set ships a prompt we told them was clean.
  },
});
