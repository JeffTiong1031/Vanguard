import type { Finding } from '../detection/l1/types';
import { saltedFingerprint } from '../detection/hash';

type Row = { cls: string; fp: string; ignored: boolean; reason?: string; t: number };
const KEY = 'vg_audit';

async function salt(): Promise<string> {
  const got = (await chrome.storage.local.get('vg_salt')).vg_salt as string | undefined;
  if (got) return got;
  const s = crypto.randomUUID();
  await chrome.storage.local.set({ vg_salt: s });
  return s;
}
async function append(rows: Row[]): Promise<void> {
  const cur = ((await chrome.storage.local.get(KEY))[KEY] as Row[] | undefined) ?? [];
  await chrome.storage.local.set({ [KEY]: [...cur, ...rows] });
}
async function toRows(findings: Finding[], ignored: boolean, reason?: string): Promise<Row[]> {
  const s = await salt();
  return Promise.all(findings.map(async (f) => ({
    cls: f.cls, fp: await saltedFingerprint(f.text, s), ignored, reason, t: Date.now(),
  })));
}
export async function recordFindings(findings: Finding[]): Promise<void> { await append(await toRows(findings, false)); }
export async function recordIgnore(findings: Finding[], reason: string): Promise<void> { await append(await toRows(findings, true, reason)); }
export async function ignoreRateByClass(): Promise<Record<string, { flagged: number; ignored: number }>> {
  const rows = ((await chrome.storage.local.get(KEY))[KEY] as Row[] | undefined) ?? [];
  const out: Record<string, { flagged: number; ignored: number }> = {};
  for (const r of rows) {
    out[r.cls] ??= { flagged: 0, ignored: 0 };
    if (r.ignored) out[r.cls]!.ignored++;
    else out[r.cls]!.flagged++;
  }
  return out;
}
