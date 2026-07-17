// src/detection/l2/messages.ts
//
// The typed content<->offscreen contract for L2 (stock multilingual NER). Pure — no
// `@huggingface/transformers` import here, so content scripts, the background SW, and this
// file's own tests can all use it without pulling in the model runtime (resolution #7).

export type L2Entity = { type: 'PERSON' | 'ORG'; start: number; end: number; text: string };
export type ScanRequest = { kind: 'l2-scan'; id: string; text: string };
export type ScanResponse =
  | { kind: 'l2-result'; id: string; ok: true; entities: L2Entity[] }
  | { kind: 'l2-result'; id: string; ok: false; error: string };

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
