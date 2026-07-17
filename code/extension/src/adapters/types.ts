// The site adapter contract — doc 05 §3.2.
//
// 🔴 THIS FILE SHIPS NO SELECTORS, DELIBERATELY (doc 05 §3.1). They are wrong by the time you read
// them — D4: providers churn their DOM on roughly a weekly cadence, "folklore, not measured" — and a
// selector committed to a repo reads as a spec. THE CONTRACT IS THE ARTIFACT.
//
// D4 is Low confidence, and doc 05 §3.4 hides the cheapest open item in the package inside it:
// "the adapter self-test is ALSO the D4 instrument. Every self-test failure is a timestamped record
// of a provider breaking us. After one quarter of Phase 0 we will have replaced an assumption with a
// measurement, for free, from a mechanism we had to build anyway."

export interface SiteAdapter {
  readonly surface: 'chatgpt' | 'claude';

  /** The composer. May be inside a shadow root — resolve with composedPath(), never event.target. */
  resolveComposer(): HTMLElement | null;

  /**
   * Current composer text.
   * 🔴 Returning '' when the composer EXISTS is a BREAKAGE, not an empty prompt (doc 05 §3.3).
   * Conflating the two is a silent fail-open: we would scan nothing and report clean.
   */
  readText(): string;

  /** Write the rewritten string. Must fire the events the page's framework actually listens for. */
  writeText(next: string): void;

  /**
   * 🔴 EVERY send path, not just Enter: Enter · Ctrl/Cmd+Enter · Send button · paste-and-send ·
   * voice (doc 05 §2.3). A missed path fails OPEN, SILENTLY — doc 00 §6's worst case, because the
   * control stops working while the audit trail says it worked. This is why the log-only observer
   * exists at all.
   */
  isSendIntent(ev: Event): boolean;

  /**
   * Doc 05 §3.3 — and IT MUST FAIL LOUD. A broken adapter degrades to advisory (ADR 0014), surfaced
   * to the user AND the admin as "protection degraded". One degradation state, three triggers
   * (doc 06 §7.1). Never silence.
   */
  selfTest(): { ok: boolean; failed: string[] };
}

/**
 * 🔴 THERE ARE TWO ADAPTERS, NOT ONE — doc 05 §4.4, ADR 0012, CLAUDE.md §7.3 rank 10.
 *
 * The DOM adapter (above) and the request-schema adapter (below) break INDEPENDENTLY, on the same
 * D4 clock — and SiteAdapter.selfTest() covers only the first. A provider can change its request
 * body shape without touching a single selector, and the observer goes blind while every DOM
 * self-test stays green.
 *
 * That asymmetry is the point: the observer exists to catch what the gate misses, so it must not
 * fail silently in a way the gate's own health check cannot see.
 */
export interface RequestSchemaAdapter {
  readonly surface: 'chatgpt' | 'claude';

  /**
   * Extract the prompt from a webRequest body, to reconcile against what the gate authorized.
   * An unauthorized send lands in the audit trail as a BYPASS (doc 05 §4.4).
   * ⚠️ U20: if a surface submits over an open WebSocket, webRequest sees the handshake and never
   * the frames — this adapter would be structurally blind for that surface. Measured for free by
   * the U12 spike (spikes/u12-harness/PROTOCOL.md step 7).
   */
  extractPrompt(body: unknown): string | null;

  /** Its own self-test. The DOM adapter's does not cover this one. */
  selfTest(): { ok: boolean; failed: string[] };
}
