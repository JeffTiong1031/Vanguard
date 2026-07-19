// src/detection/l2/org-dictionary.ts
//
// Exact-match organisation dictionary — proposals the stock NER does not make (ADR 0004).
//
// 🔴 Why. After span repair, the residual failures are almost entirely NER *blindness*, and the
// blind spots are recognisable companies: measured on this pipeline, 6.4% of gold MASK spans get
// no overlapping proposal at all, and the misses are `Proton`, `TNB`, `腾讯`, `阿里巴巴`,
// `字节跳动`, and `Boeing` in an English sentence. The same entity is tagged in one sentence and
// missed in another, so it is instability rather than a fixed gap — exactly the class a
// dictionary is the precise instrument for.
//
// Measured in ml/ with a dictionary covering only half the exam's organisations: full MASK
// coverage +4.5pp overall and **+10.5pp on Chinese**, complete blind spots 6.4% -> 2.3%.
// Production should beat that: ADR 0004's dictionary holds the tenant's OWN counterparties —
// the vendors and clients a company actually transacts with — which are precisely the
// organisations whose mention is sensitive.
//
// 🔴 EXACT MATCH ONLY. ADR 0004 forbids fuzzy matching in Phase 0: fuzzy matching reintroduces
// false positives into the one layer whose entire value is its precision, and precision is
// quasi-contractual under ADR 0001. Case-sensitive, and Latin terms need word boundaries, so
// `Apple` does not fire on "an apple a day" nor `Grab` inside "grabbed".
//
// Ported from ml/src/sens/org_dictionary.py — keep the two in sync.

import type { RepairSpan } from './span-repair';

const LATIN_START = /^[A-Za-z0-9]/;
const WORD_CHAR = /[A-Za-z0-9_]/;

/** Deduplicate, drop blanks, order longest-first.
 *
 *  Longest-first matters: with both `Maju Trading` and `Maju Trading Sdn Bhd` present, the
 *  longer entry must win or the masked span stops short of the full legal name. */
export function normaliseTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...terms].map((s) => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length)) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** CJK is written without spaces, so it has no word boundaries to respect. */
function isBoundaryOk(text: string, start: number, end: number, term: string): boolean {
  if (!LATIN_START.test(term)) return true;
  if (start > 0 && WORD_CHAR.test(text[start - 1]!)) return false;
  if (end < text.length && WORD_CHAR.test(text[end]!)) return false;
  return true;
}

/** Every exact, boundary-respecting occurrence of any term. Case-sensitive by design:
 *  `apple` in "an apple a day" is not Apple Inc. Enter each casing you mean. */
export function findTerms(text: string, terms: readonly string[]): RepairSpan[] {
  const spans: RepairSpan[] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i === -1) break;
      const end = i + term.length;
      if (isBoundaryOk(text, i, end, term)) spans.push({ start: i, end });
      from = i + 1;
    }
  }
  return spans.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Dictionary hits as ORG entities, to be unioned with the NER's proposals.
 *
 * Hits that already overlap an NER proposal are dropped: the NER's own span carries its type,
 * and re-adding it as ORG would mislabel a PERSON the NER already found.
 *
 * `span_repair.repairEntities` should still run afterwards — a dictionary hit can also need a
 * tail pulled in.
 */
const STORAGE_KEY = 'vg_org_dictionary';

/**
 * The tenant's organisation terms. **Empty by default, so behaviour is unchanged until
 * someone supplies a list** — this wires the mechanism without inventing a policy.
 *
 * 🔴 `chrome.storage.local` is the Slice 1 placeholder, NOT the shipping channel. ADR 0009 puts
 * the real dictionary on `chrome.storage.managed` (admin policy, read-only to the extension) and
 * requires per-tenant DEKs from day one. Moving it there is Phase 1 work and is deliberately not
 * done here: a local, unencrypted, user-writable list is fine for a team test and is not fine
 * for a tenant's counterparty list.
 */
export async function loadOrgTerms(): Promise<string[]> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as unknown;
    return Array.isArray(stored) ? normaliseTerms(stored.filter((t): t is string => typeof t === 'string')) : [];
  } catch {
    return []; // storage unavailable must never break a scan — ADR 0014's spirit
  }
}

export async function setOrgTerms(terms: readonly string[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normaliseTerms(terms) });
}

export function proposeOrgs<T extends RepairSpan & { type: string; text: string }>(
  text: string,
  terms: readonly string[],
  nerEntities: readonly T[],
): T[] {
  if (terms.length === 0) return [...nerEntities];
  const extra: T[] = [];
  for (const hit of findTerms(text, terms)) {
    const overlapsExisting = nerEntities.some(
      (e) => Math.min(e.end, hit.end) > Math.max(e.start, hit.start),
    );
    if (overlapsExisting) continue;
    extra.push({
      type: 'ORG',
      start: hit.start,
      end: hit.end,
      text: text.slice(hit.start, hit.end),
    } as unknown as T);
  }
  return [...nerEntities, ...extra].sort((a, b) => a.start - b.start || a.end - b.end);
}
