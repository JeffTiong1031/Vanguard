// src/detection/l2/client.ts
//
// Content-side client. Never imports `@huggingface/transformers` (resolution #7) — only the
// typed message contract.
import type { L2Entity, ScanRequest, ScanResponse } from './messages';

export async function l2Scan(text: string, timeoutMs: number): Promise<L2Entity[] | 'degraded'> {
  const id = crypto.randomUUID();
  const req: ScanRequest = { kind: 'l2-scan', id, text };
  const timeout = new Promise<'degraded'>((r) => setTimeout(() => r('degraded'), timeoutMs));
  const call = chrome.runtime
    .sendMessage(req)
    .then((res: ScanResponse) => (res.ok ? res.entities : ('degraded' as const)))
    .catch(() => 'degraded' as const);
  return Promise.race([call, timeout]);
}
