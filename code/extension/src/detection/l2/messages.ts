// src/detection/l2/messages.ts
//
// The typed content<->offscreen contract for L2 (stock multilingual NER). Pure — no
// `@huggingface/transformers` import here, so content scripts, the background SW, and this
// file's own tests can all use it without pulling in the model runtime (resolution #7).

import type { SensitivityConfig } from './sensitivity';

export type L2Entity = { type: 'PERSON' | 'ORG'; start: number; end: number; text: string };

/**
 * 🔴 ADR 0018: sensitivity never gates files. Today that holds only because file extracts are
 * long and fall past the token cutoff — i.e. by coincidence of a number, not by construction.
 * The chat path and the file path share `scanInto`, so raising the cutoff (a config change
 * nobody thinks of as architectural) would silently start filtering file findings. This flag
 * makes the ADR structural.
 */
export type ScanPurpose = 'chat' | 'file';

/** Content script → background. */
export type ScanRequest = { kind: 'l2-scan'; id: string; text: string; purpose: ScanPurpose };

/**
 * Background → offscreen. A DIFFERENT kind, deliberately.
 *
 * 🔴 `chrome.runtime.sendMessage` is delivered to EVERY extension context, so an `l2-scan` sent
 * by a content script reaches the offscreen document directly as well as via the background —
 * two listeners, racing, whichever responds first wins. That is harmless while both do the same
 * thing, and becomes non-deterministic the moment the background enriches the message: half the
 * scans would arrive carrying config and half would not. Separating the kinds means the
 * offscreen document only ever handles a message that passed through the service worker.
 */
export type RunRequest = {
  kind: 'l2-run';
  id: string;
  text: string;
  purpose: ScanPurpose;
  sensitivity: SensitivityConfig;
};

/**
 * What the engine did, on every branch — including the ones it skipped.
 *
 * 🔴 `skipped` is the entry that would have saved a session. The previous design logged only on
 * success and on failure, so a skipped scan was silent, and the absence of a log carried no
 * information whatsoever. A feature that had never executed once looked exactly like a feature
 * that was working. ADR 0014 says a dead engine degrades rather than decides — degrading
 * requires someone to notice.
 */
export type SensitivityStatus =
  | { state: 'disabled' }
  | { state: 'loading' }
  | { state: 'ready'; spans: number; released: number; kept: number; failed: number; ms: number }
  | { state: 'failed'; reason: string }
  | { state: 'skipped'; why: 'too-long' | 'no-entities' | 'file-path' };

export type ScanResponse =
  | { kind: 'l2-result'; id: string; ok: true; entities: L2Entity[]; sensitivity: SensitivityStatus }
  | { kind: 'l2-result'; id: string; ok: false; error: string };

export function buildRunRequest(msg: ScanRequest, sensitivity: SensitivityConfig): RunRequest {
  return { kind: 'l2-run', id: msg.id, text: msg.text, purpose: msg.purpose, sensitivity };
}

/** One place that turns a status into words, so the options page and the console agree. */
export function describeStatus(s: SensitivityStatus): string {
  switch (s.state) {
    case 'disabled': return 'Off — no model configured';
    case 'loading': return 'Loading model…';
    case 'ready':
      return `Ready — ${s.spans} spans in ${s.ms.toFixed(0)} ms, ${s.released} released, ${s.kept} masked`;
    case 'failed': return `Failed — ${s.reason}`;
    case 'skipped':
      return s.why === 'too-long' ? 'Skipped — prompt too long for the classifier'
        : s.why === 'file-path' ? 'Skipped — files are not sensitivity-filtered (ADR 0018)'
          : 'Skipped — nothing to judge';
  }
}

// mBERT-NER emits PER/ORG/LOC/MISC. Slice 1 keeps PER->PERSON and ORG only (ADR 0017 §5: LOC off).
const KEEP: Record<string, L2Entity['type'] | undefined> = { PER: 'PERSON', ORG: 'ORG' };

export type RawNerToken = { entity: string; start: number; end: number; word: string };

// Merge B-/I- token tags into whole-entity spans. transformers.js token-classification with
// `aggregation_strategy` can do this, but we merge ourselves so the contract is stable across versions.
export function mergeNerTokens(tokens: RawNerToken[]): L2Entity[] {
  const out: L2Entity[] = [];
  let cur: L2Entity | null = null;
  for (const t of tokens) {
    const [tag, rawLabel] = t.entity.split('-') as ['B' | 'I', string];
    const label = KEEP[rawLabel];
    if (!label) {
      cur = null;
      continue;
    }
    if (tag === 'B' || !cur || cur.type !== label) {
      cur = { type: label, start: t.start, end: t.end, text: t.word };
      out.push(cur);
    } else {
      cur.end = t.end;
      // [RED caught this] A wordpiece continuation ("##foo") glues directly onto the previous
      // piece; a same-type I-tag token that is a whole new word (no "##") is a separate word and
      // needs a space, or "Ahmad"+"Ali" renders as "AhmadAli". `text` is the audit/preview
      // fingerprint only — masking downstream uses start/end, never this string.
      cur.text += t.word.startsWith('##') ? t.word.slice(2) : ` ${t.word}`;
    }
  }
  return out;
}

// --- Character-offset reconstruction ------------------------------------------------------
//
// [finding, verified against node_modules @huggingface/transformers@3.8.1 source] The installed
// transformers.js v3 token-classification pipeline's `_call` (src/pipelines.js) never sets
// `start`/`end` on its output tokens — the two fields are declared `start?`/`end?` in its own
// typedef and the implementation still carries the literal comment
// `// TODO: Add support for start and end`. The tokenizer has no `return_offsets_mapping` support
// either. So the raw pipeline output is `{ entity, score, index, word }` — no character
// positions — even though `mergeNerTokens` above (and everything downstream that masks by
// position rather than by `text`) needs real offsets.
//
// This reconstructs them by walking the prompt text left-to-right and locating each decoded
// token's text, stripping the WordPiece continuation prefix ("##") before searching.
//
// 🔴 CRITICAL invariant: `tokens` MUST be the FULL ordered stream (entity + O + subword), in
// sequence order. The pipeline defaults to `ignore_labels: ['O']`, which drops non-entity tokens
// and leaves the cursor stranded — `indexOf(piece, cursor)` then lands on the FIRST occurrence of
// a recurring word even when the tagged mention is a later one (wrong span reported as ok). The
// offscreen caller passes `ignore_labels: []` so O tokens advance the cursor between entities.
// Special tokens whose `word` is not a text substring (`[CLS]`/`[SEP]`) return -1 and are dropped
// WITHOUT advancing the cursor — they sit at boundaries and are not text content.
// `mergeNerTokens` then drops non-KEEP labels (including O) after offsets are attached.
export type PipelineNerToken = { entity: string; word: string };

export function attachCharOffsets(text: string, tokens: PipelineNerToken[]): RawNerToken[] {
  const out: RawNerToken[] = [];
  let cursor = 0;
  for (const t of tokens) {
    const isContinuation = t.word.startsWith('##');
    const piece = isContinuation ? t.word.slice(2) : t.word;
    if (!piece) continue;
    const idx = text.indexOf(piece, cursor);
    // Unalignable (special tokens, normalization misses): drop WITHOUT advancing cursor.
    if (idx === -1) continue;
    out.push({ entity: t.entity, start: idx, end: idx + piece.length, word: t.word });
    cursor = idx + piece.length;
  }
  return out;
}
