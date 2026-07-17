// Service worker. Ephemeral: exactly 30 seconds idle (U10 ✅ cited — not "~30s").
//
// STUB — doc 01 §2's shape.
//
// U10's bonus fact, which ADR 0006 wanted and doc 05 §5.1 found: offscreen→SW messages RESET the
// idle timer. So a busy engine keeps the SW alive for free, and ADR 0006's two lifecycles are
// coupled in our favour rather than fighting.

export default defineBackground(() => {
  // TODO  Offscreen lifecycle (ADR 0006). Chrome MAY reclaim the document; the SW must recreate it,
  //       and the first scan after recreation pays the model-load cost.
  //       🔴 ADR 0011: a reclaim must NOT restart placeholder numbering. Restarting makes PERSON_1
  //       mean two people in one thread — "confident, wrong output about identifiable people."
  //       The counter is a SEPARATE RECORD from the mappings and outlives them. It is an integer:
  //       no value, no hash, no salt, no exposure. DO NOT tidy the two into one record — ADR 0011
  //       exists precisely because a future engineer would.
  //
  // TODO  webRequest observer (ADR 0012) — onBeforeRequest + requestBody. LOG ONLY. NEVER ABORTS.
  //       It is passive and STRUCTURALLY CANNOT break the provider's app, which is half of why it
  //       beat the MAIN-world patch ("your DLP tool broke ChatGPT for 150 people" ends the account).
  //       The other half: a MAIN-world patch only sees the transports we ENUMERATED — fetch, XHR,
  //       sendBeacon, WebSocket, and fetch inside a Web Worker, which a window.fetch patch never
  //       touches because a worker has its own global. An unbounded, silent blind-spot set — in the
  //       component that exists to catch silent misses. webRequest's blind spot is EXACTLY ONE
  //       (WebSocket frames — U20), known and testable in week 1.
  //       ⚠️ U20 is measured FOR FREE by the U12 spike (../../../spikes/u12-harness/PROTOCOL.md
  //          step 7). Do not build this until that reports.
  //
  // TODO  Audit transport: batched, hashed events. I3 — hashes, classes, counts, NEVER values.
  //       Doc 07 §7.2: the class-level Ignore RATE rides this exact shape for free and is a
  //       detector-prioritization signal. It is NEVER a label — doc 00 §1.6's poisoning argument
  //       stands and only fails to reach the AGGREGATE, because the poisoner is indiscriminate and
  //       so moves the mean without moving the ranking.
  //       🔴 Doc 07 §7.3: that is a SECOND PURPOSE for data collected under a compliance promise.
  //       The DPA must name it BEFORE we use it. A paragraph now; a diligence finding later.
  //
  // TODO  Degradation (ADR 0014). One state, three triggers (doc 06 §7.1): engine dead, adapter
  //       broken, surface unresolvable. Degrade to ADVISORY — never fail-closed. Surfaced to the
  //       user AND the admin as "protection degraded".
  //       🔴 The timeout CANNOT be a constant: latency is a function of chunk count (doc 06 §4.2),
  //       so a fixed timeout declares the engine dead on a long Chinese paste — i.e. on the wedge,
  //       on the dominant threat. Its coefficients come from U6-b's measured curve. No value here.
});
