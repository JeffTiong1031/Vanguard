// src/detection/l2/client.ts
//
// Content-side client. Never imports `@huggingface/transformers` (resolution #7) — only the
// typed message contract.
import type {
  L2Entity, ScanPurpose, ScanRequest, ScanResponse, SensitivityStatus,
} from './messages';

export type L2Result = { entities: L2Entity[]; sensitivity: SensitivityStatus };

export async function l2Scan(
  text: string, timeoutMs: number, purpose: ScanPurpose,
): Promise<L2Result | 'degraded'> {
  const id = crypto.randomUUID();
  const req: ScanRequest = { kind: 'l2-scan', id, text, purpose };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'degraded'>((r) => {
    timer = setTimeout(() => r('degraded'), timeoutMs);
  });
  const call = chrome.runtime
    .sendMessage(req)
    .then((res: ScanResponse) =>
      (res.ok ? { entities: res.entities, sensitivity: res.sensitivity } : ('degraded' as const)))
    .catch(() => 'degraded' as const);
  try {
    return await Promise.race([call, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
