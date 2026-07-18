import type { SessionNumbering } from '../mask/placeholder';
import { spanKey, type SpanDecisionMap } from '../ui/send-review-logic';
import { redactFile, type RedactSpanPayload } from './api';
import type { HeldFile } from './types';

export type CleanedDeps = {
  redact: (file: File, sha: string, spans: RedactSpanPayload[]) => Promise<File>;
};

/**
 * Produce the file the provider will actually receive.
 *
 * The extract is a DECISION SURFACE, not the output. We do not convert text
 * back into a document. We send the ORIGINAL bytes plus the accepted spans to
 * /v1/redact, which applies the masks in place — a DOCX comes back a DOCX with
 * word/media/ intact, a PDF comes back a PDF with its images intact.
 *
 * Two outcomes:
 *  - NOTHING accepted (clean, or every span ignored) -> the ORIGINAL File
 *    object, byte-identical. There is no privacy reason to touch a file we are
 *    not changing, and no round trip is made.
 *  - ANYTHING accepted -> the backend's redacted file, in its original format.
 *
 * Keeping images is not cleaning them. A secret that exists only inside an
 * embedded photo or a scanned page survives this untouched — coverage.not_read
 * says so in the review pane, and OCR is backlog (ADR 0027).
 */
export async function buildCleanedFile(
  held: HeldFile,
  decisions: SpanDecisionMap,
  numbering: SessionNumbering,
  deps: CleanedDeps = { redact: redactFile },
): Promise<File> {
  const findings = held.findings ?? [];
  if (findings.length === 0 || held.extract == null || held.extractSha256 == null) {
    return held.file;
  }

  const spans: RedactSpanPayload[] = [];
  for (const finding of findings) {
    const decision = decisions.get(spanKey(finding));
    if (decision?.kind !== 'accepted') continue;
    spans.push({
      start: finding.start,
      end: finding.end,
      text: finding.text,
      placeholder: decision.placeholder || numbering.placeholderFor(finding.cls, finding.text),
    });
  }

  if (spans.length === 0) return held.file;

  return deps.redact(held.file, held.extractSha256, spans);
}
