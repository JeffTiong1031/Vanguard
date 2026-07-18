import type { Verdict } from '../detection/verdict-cache';
import { initDecisions } from '../ui/send-review-logic';
import { ExtractError, extractFile } from './api';
import type { FileStore } from './store';
import type { ExtractResponse } from './types';

export type PipelineDeps = {
  extract: (file: File) => Promise<ExtractResponse>;
  scan: (text: string) => Promise<Verdict>;
};

export const defaultDeps = (scan: (text: string) => Promise<Verdict>): PipelineDeps => ({
  extract: extractFile,
  scan,
});

export async function processFile(
  store: FileStore,
  id: string,
  deps: PipelineDeps,
): Promise<void> {
  const held = store.get(id);
  if (!held) return;

  store.update(id, { status: { kind: 'extracting' } });

  let extracted: ExtractResponse;
  try {
    extracted = await deps.extract(held.file);
  } catch (err) {
    const known = err instanceof ExtractError;
    store.update(id, {
      status: {
        kind: 'error',
        code: known ? err.code : 'parse_failed',
        message: known
          ? err.message
          : `"${held.file.name}" could not be checked, so it has not been sent to the AI.`,
      },
    });
    return;
  }

  store.update(id, {
    status: { kind: 'scanning' },
    extract: extracted.extract,
    extractSha256: extracted.extract_sha256,
    truncated: extracted.truncated,
    coverage: extracted.coverage,
    warnings: extracted.warnings,
  });

  // 🔴 The SAME detector stack the prompt uses (ADR 0018 section 4). One L1,
  // one L2, one seam for the trained model to replace after Slice 2.
  const verdict = await deps.scan(extracted.extract);

  if (!verdict.complete) {
    // ADR 0013: only a COMPLETED L1+L2 scan may say clean. An incomplete scan
    // presented as a pass is the silent fail-open the whole product exists to
    // prevent. Surface it and let the user consciously escape (ADR 0014).
    store.update(id, {
      status: {
        kind: 'error',
        code: 'parse_failed',
        message:
          `"${held.file.name}" could not be fully checked because the on-device ` +
          'engine is unavailable. It has not been sent to the AI.',
      },
      findings: verdict.findings,
    });
    return;
  }

  store.update(id, {
    status: { kind: 'scanned' },
    findings: verdict.findings,
    decisions: initDecisions(verdict.findings),
  });
}
