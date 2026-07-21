import { CLIENT_LIMITS, DEMO_TOKEN, getApiBase } from './config';
import type { ApiErrorCode, ExtractResponse } from './types';

export class ExtractError extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

export async function extractFile(file: File): Promise<ExtractResponse> {
  if (file.size > CLIENT_LIMITS.maxUploadBytes) {
    // Refuse locally: uploading 40 MB in order to be told it is too big wastes
    // the user's bandwidth and puts the bytes on the wire for no purpose.
    const mb = (file.size / 1024 / 1024).toFixed(0);
    throw new ExtractError(
      'too_large',
      `"${file.name}" is ${mb} MB. Vanguard checks files up to 10 MB, so it was ` +
        'not checked and has not been sent to the AI.',
    );
  }

  const base = await getApiBase();
  const body = new FormData();
  body.append('file', file, file.name);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CLIENT_LIMITS.requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${base}/v1/extract`, {
      method: 'POST',
      body,
      signal: abort.signal,
      headers: {
        'x-vanguard-filename': encodeURIComponent(file.name),
        Authorization: `Bearer ${DEMO_TOKEN}`,
      },
    });
  } catch (err) {
    if (abort.signal.aborted) {
      throw new ExtractError(
        'timeout',
        `"${file.name}" took too long to check, so it has not been sent to the AI.`,
      );
    }
    throw new ExtractError(
      'network',
      "Vanguard couldn't reach the file-checking service, so this file was not " +
        'checked and has not been sent to the AI. Check that the service is ' +
        "running, or update its address in the extension's options.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: ApiErrorCode; message?: string } }
      | null;
    throw new ExtractError(
      payload?.error?.code ?? 'parse_failed',
      payload?.error?.message ??
        `"${file.name}" could not be checked, so it has not been sent to the AI.`,
    );
  }

  return (await response.json()) as ExtractResponse;
}

export type RedactSpanPayload = {
  start: number;
  end: number;
  text: string;
  placeholder: string;
};

/**
 * Apply accepted masks to the ORIGINAL file and get the same format back.
 *
 * The original bytes are re-uploaded because the backend kept nothing between
 * calls (F4). `extractSha256` is what makes it safe: the backend re-parses and
 * refuses if the text differs from what the user actually reviewed.
 */
export async function redactFile(
  file: File,
  extractSha256: string,
  spans: RedactSpanPayload[],
): Promise<File> {
  const base = await getApiBase();
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('spec', JSON.stringify({ extract_sha256: extractSha256, spans }));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CLIENT_LIMITS.requestTimeoutMs);

  let response: Response;
  try {
    response = await fetch(`${base}/v1/redact`, {
      method: 'POST',
      body,
      signal: abort.signal,
      headers: { Authorization: `Bearer ${DEMO_TOKEN}` },
    });
  } catch {
    throw new ExtractError(
      'network',
      "Vanguard couldn't reach the file-checking service to apply your changes, so " +
        'nothing was attached. Check the service and try Proceed again.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: ApiErrorCode; message?: string } }
      | null;
    throw new ExtractError(
      payload?.error?.code ?? 'redaction_failed',
      payload?.error?.message ??
        `"${file.name}" could not be redacted, so it has not been sent to the AI.`,
    );
  }

  const name = response.headers.get('x-vanguard-redacted-name') ?? `${file.name}.redacted`;
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || file.type });
}
