import type { Finding } from '../detection/l1/types';
import type { Coverage, HeldFile } from '../files/types';
import { allResolved, pendingCount, type SpanDecisionMap } from './send-review-logic';

export type PaneId = 'prompt' | `file:${string}`;
export type PaneState = 'clean' | 'dirty' | 'busy' | 'error';

export type Pane = {
  id: PaneId;
  title: string;
  state: PaneState;
  badge: string;
  /** Present for prompt and for a scanned file; absent while busy or errored. */
  text?: string;
  findings?: Finding[];
  decisions?: SpanDecisionMap;
  coverage?: Coverage;
  warnings?: string[];
  truncated?: boolean;
  /** Error panes only. */
  message?: string;
  fileId?: string;
  fileName?: string;
};

export function buildPanes(
  promptText: string,
  promptFindings: Finding[],
  promptDecisions: SpanDecisionMap,
  files: HeldFile[],
): Pane[] {
  const promptPending = pendingCount(promptDecisions);
  const panes: Pane[] = [
    {
      id: 'prompt',
      title: 'Prompt',
      state: promptFindings.length === 0 ? 'clean' : promptPending > 0 ? 'dirty' : 'clean',
      badge:
        promptFindings.length === 0
          ? 'No issues'
          : promptPending > 0
            ? String(promptPending)
            : 'Resolved',
      text: promptText,
      findings: promptFindings,
      decisions: promptDecisions,
    },
  ];

  for (const held of files) {
    const base = {
      id: `file:${held.id}` as PaneId,
      title: held.file.name,
      fileId: held.id,
      fileName: held.file.name,
    };

    switch (held.status.kind) {
      case 'held':
      case 'extracting':
      case 'scanning':
        panes.push({ ...base, state: 'busy', badge: 'Checking…' });
        break;
      case 'error':
        panes.push({ ...base, state: 'error', badge: 'Not checked', message: held.status.message });
        break;
      case 'error_acknowledged':
        panes.push({
          ...base,
          state: 'error',
          badge: 'Sending anyway',
          message: held.status.message,
        });
        break;
      case 'scanned': {
        const decisions = held.decisions ?? new Map();
        const pending = pendingCount(decisions);
        panes.push({
          ...base,
          state: (held.findings?.length ?? 0) === 0 ? 'clean' : pending > 0 ? 'dirty' : 'clean',
          badge:
            (held.findings?.length ?? 0) === 0
              ? 'No issues'
              : pending > 0
                ? String(pending)
                : 'Resolved',
          text: held.extract,
          findings: held.findings,
          decisions,
          coverage: held.coverage,
          warnings: held.warnings,
          truncated: held.truncated,
        });
        break;
      }
    }
  }

  return panes;
}

export function canProceed(panes: Pane[]): boolean {
  for (const pane of panes) {
    if (pane.state === 'busy') return false;
    // An unacknowledged error blocks; 'Sending anyway' is the acknowledged form
    // and is allowed through (ADR 0014 -- degrade, never fail-closed).
    if (pane.state === 'error' && pane.badge === 'Not checked') return false;
    if (pane.decisions && !allResolved(pane.decisions)) return false;
  }
  return true;
}
