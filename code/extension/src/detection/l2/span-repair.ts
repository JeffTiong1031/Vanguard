// src/detection/l2/span-repair.ts
//
// Repairs stock-NER span boundaries before they reach the mask. Pure — no model runtime — so
// content scripts, the background SW and tests can all use it.
//
// 🔴 Measured on THIS pipeline (scripts/measure-span-coverage.mjs, 2026-07-19, 265 gold MASK
// spans): the stock NER covers only **64.2%** of them in full. 29.4% arrive as fragments and
// 6.4% are missed entirely. Chinese is worst at 44.8%.
//
// The fragments are mostly not blindness — they are a DEFINITION mismatch. The NER proposes
// `Rahman`, `林`, `Emily Chen`; doc 04 §4.3 requires the honorific INSIDE the masked span, so
// the correct span is `Encik Rahman`, `林女士`, `Dr. Emily Chen`. Masking the bare name leaves
// `Encik ____` in the prompt, which that section calls a re-identification pointer and a
// compliance failure, not a cosmetic one. `阿里巴巴` also arrives as `阿里` + `巴`, and masking
// half of it leaves the rest in the prompt.
//
// Ported from ml/src/sens/span_repair.py — keep the two in sync. The Python side carries the
// provenance rule for the word lists and the tests that enforce it.
//
// Measured cost on the ml/ exam: 3.5% of repaired spans over-extend by a role or department
// word (`会计部的张先生` for `张先生`). That is a utility cost, not a privacy failure — the
// wider span is still sensitive — and it is the right side to err on.

export type RepairSpan = { start: number; end: number };

// Latin-script titles that PRECEDE the name. Longest-first so "Dato' Seri" beats "Dato".
//
// 🔴 Provenance rule, kept from the Python source: entries are attested in the ml/ training
// set's gold spans (>= 2 distinct spans) or are general linguistic knowledge. They are NOT
// mined from the eval exam's failures — tuning a rule against the exam is the same defect as
// training on it. `Chef`, `Uncle`, `Laksamana` were observed failing on the exam and are
// deliberately absent; adding one needs training-set support first.
export const LEADING_TITLES: readonly string[] = [
  "Dato' Seri", 'Datuk Seri', 'Dato Seri', 'Tan Sri', 'Tun Dr.', "Dato'", 'Datuk', 'Datin',
  'Dato', 'Tun', 'Tunku', 'Sultan', 'Encik', 'Puan', 'Cikgu', 'Cik', 'Tuan', 'Sir',
  'Professor', 'Prof.', 'Prof', 'Dr.', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Madam', 'En.',
  'Director', 'Pengarah',
];

// CJK titles that FOLLOW the name.
export const TRAILING_TITLES: readonly string[] = [
  '先生', '女士', '小姐', '太太', '总经理', '经理', '主任', '博士', '老板', '局长',
  '长官', '大人', '老师', '医生', '总',
];

// ORG name tails a stock NER stops short of: `Unilever` for `Unilever Malaysia`, `华为` for
// `华为供应链伙伴`.
export const ORG_TAILS: readonly string[] = [
  'Sdn Bhd', 'Sdn. Bhd.', 'Corporation', 'Enterprise', 'Electronics', 'Solutions',
  'Logistics', 'Holdings', 'Company', 'Partner', 'Group', 'Corp', 'Bank', 'Bhd', 'Ltd',
  '有限公司', '供应链伙伴', '科技公司', '公司', '集团', '企业', '贸易', '工业', '伙伴',
];

// How far past a span to look for an ORG tail. Bounded so a tail belonging to a DIFFERENT
// organisation later in the sentence cannot be swept in.
const ORG_TAIL_LOOKAHEAD = 12;
const SENTENCE_BREAK = /[.,;!?，。；！？、\n]/;

const isWordChar = (c: string | undefined): boolean => !!c && /[A-Za-z0-9_]/.test(c);

/** Union overlapping spans. `gap` also joins spans that many characters apart.
 *
 *  gap = 0 is the default deliberately: bridging bought +0.4pp on the ml/ exam and caused most
 *  of the over-extension, because it welds a department ORG onto an adjacent PER. */
export function mergeSpans<T extends RepairSpan>(spans: readonly T[], gap = 0): RepairSpan[] {
  if (spans.length === 0) return [];
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: RepairSpan[] = [{ start: ordered[0]!.start, end: ordered[0]!.end }];
  for (const s of ordered.slice(1)) {
    const last = out[out.length - 1]!;
    if (s.start <= last.end + gap) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/** Grow each span outward over an attached honorific (doc 04 §4.3). */
export function expandTitles(spans: readonly RepairSpan[], text: string): RepairSpan[] {
  const grown = spans.map(({ start, end }) => {
    const before = text.slice(0, start);
    const stripped = before.replace(/\s+$/, '');
    for (const title of LEADING_TITLES) {
      if (stripped.endsWith(title)) {
        const cut = stripped.length - title.length;
        // the title must be a word of its own — "Sir" must not be pulled out of "Kasir"
        if (cut === 0 || !isWordChar(stripped[cut - 1])) {
          start = cut;
          break;
        }
      }
    }
    for (const title of TRAILING_TITLES) {
      if (text.startsWith(title, end)) {
        end += title.length;
        break;
      }
    }
    return { start, end };
  });
  return mergeSpans(grown);
}

/** Extend a span forward over an organisation tail it stopped short of. */
export function expandOrgTails(spans: readonly RepairSpan[], text: string): RepairSpan[] {
  const grown = spans.map(({ start, end }) => {
    const window = text.slice(end, end + ORG_TAIL_LOOKAHEAD);
    let bestEnd = end;
    for (const tail of ORG_TAILS) {
      const idx = window.indexOf(tail);
      if (idx === -1) continue;
      if (SENTENCE_BREAK.test(window.slice(0, idx))) continue;
      const candidate = end + idx + tail.length;
      if (candidate > bestEnd) bestEnd = candidate;
    }
    return { start, end: bestEnd };
  });
  return mergeSpans(grown);
}

/** merge -> titles -> org tails -> merge again (expansion can create new overlaps). */
export function repairSpans(spans: readonly RepairSpan[], text: string, gap = 0): RepairSpan[] {
  const merged = mergeSpans(spans, gap);
  return mergeSpans(expandOrgTails(expandTitles(merged, text), text));
}

/**
 * Apply repair to L2 entities, preserving each entity's type and refreshing its text.
 *
 * Entities are repaired WITHIN type: a PERSON and an ORG that end up adjacent must not merge
 * into one span, or the mask loses the distinction the placeholder grammar depends on
 * (`PERSON_1` vs `ORG_1`).
 */
export function repairEntities<T extends RepairSpan & { type: string; text: string }>(
  entities: readonly T[],
  text: string,
): T[] {
  const byType = new Map<string, T[]>();
  for (const e of entities) {
    const bucket = byType.get(e.type);
    if (bucket) bucket.push(e);
    else byType.set(e.type, [e]);
  }

  const out: T[] = [];
  for (const [, group] of byType) {
    const template = group[0]!;
    for (const s of repairSpans(group, text)) {
      out.push({ ...template, start: s.start, end: s.end, text: text.slice(s.start, s.end) });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
