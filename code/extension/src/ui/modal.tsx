import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Finding } from '../detection/l1/types';
import type { HeldFile } from '../files/types';
import { SessionNumbering } from '../mask/placeholder';
import { buildPanes, canProceed, type PaneId } from './review-panes';
import {
  acceptAllDecisions,
  buildFinalText,
  buildPreviewSegments,
  initDecisions,
  pendingCount,
  spanKey,
  whyForClass,
  type SpanDecisionMap,
  type SpanStatus,
} from './send-review-logic';

export type FileProceed = {
  id: string;
  finalText: string;
  ignored: Array<{ finding: Finding; reason: string }>;
  /** Span decisions for redaction — accepted placeholders bind to /v1/redact. */
  decisions: SpanDecisionMap;
  /** True when nothing was accepted -- the ORIGINAL bytes may be re-attached
   *  and the user keeps their formatting. */
  unchanged: boolean;
};

export type ProceedResult = {
  finalText: string;
  ignored: Array<{ finding: Finding; reason: string }>;
  files: FileProceed[];
};

export type ModalProps = {
  text: string;
  findings: Finding[];
  numbering: SessionNumbering;
  /** Live view of held files. The modal re-renders as each one lands, which
   *  is the progressive UI: the Prompt pane is usable while File says
   *  "Checking...". */
  files: HeldFile[];
  onAcknowledgeFileError: (id: string, reason: string) => void;
  onProceed: (result: ProceedResult) => void;
};

const POPOVER_W = 300;
const POPOVER_GAP = 8;
const POPOVER_EST_H = 220;

const shell: Record<string, string> = {
  root: 'all:initial;box-sizing:border-box;font-family:Segoe UI,system-ui,-apple-system,sans-serif;color:#0f172a',
  card: 'width:min(560px,92vw);max-height:min(80vh,640px);display:flex;flex-direction:column;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.22),0 0 0 1px rgba(225,29,72,.12);overflow:hidden;position:relative',
  header: 'padding:18px 20px 12px;border-bottom:1px solid #ffe4e6;background:linear-gradient(180deg,#fff1f2 0%,#fff 100%);flex-shrink:0',
  title: 'margin:0;font:700 17px/1.3 Segoe UI,system-ui,sans-serif;color:#9f1239',
  sub: 'margin:6px 0 0;font:13px/1.45 Segoe UI,system-ui,sans-serif;color:#64748b',
  tabs: 'display:flex;gap:4px;padding:0 20px;border-bottom:1px solid #ffe4e6;background:#fff;flex-shrink:0;overflow-x:auto',
  tab: 'border:none;background:none;padding:10px 12px;font:600 13px Segoe UI,system-ui,sans-serif;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap',
  tabActive:
    'border:none;background:none;padding:10px 12px;font:600 13px Segoe UI,system-ui,sans-serif;color:#9f1239;cursor:pointer;border-bottom:2px solid #e11d48;white-space:nowrap',
  badge:
    'margin-left:6px;display:inline-block;min-width:18px;padding:1px 6px;border-radius:9px;background:#ffe4e6;color:#9f1239;font-size:11px;font-weight:700',
  body: 'padding:16px 20px;overflow:auto;flex:1;min-height:120px',
  preview:
    'margin:0;padding:14px 16px;border-radius:10px;background:#fff7f8;border:1px solid #fecdd3;font:15px/1.65 Segoe UI,system-ui,sans-serif;white-space:pre-wrap;word-break:break-word;color:#0f172a',
  coverage:
    'margin:10px 0 0;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font:12px/1.5 Segoe UI,system-ui,sans-serif;color:#475569',
  errorPane:
    'margin:0;padding:16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;font:14px/1.6 Segoe UI,system-ui,sans-serif;color:#7c2d12',
  footer:
    'padding:12px 20px 16px;border-top:1px solid #f1f5f9;display:flex;gap:10px;align-items:center;justify-content:flex-end;background:#fafafa;flex-shrink:0',
  btnPrimary:
    'border:none;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:pointer;background:#e11d48;color:#fff',
  btnPrimaryDisabled:
    'border:none;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:not-allowed;background:#fecdd3;color:#fff',
  btnSecondary:
    'border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:pointer;background:#fff;color:#334155',
  markPending:
    'background:rgba(225,29,72,.16);border-bottom:2.5px solid #e11d48;border-radius:2px;cursor:pointer;padding:0 1px;color:#9f1239;font-weight:600',
  markAccepted:
    'background:rgba(15,23,42,.06);border-bottom:2px solid #64748b;border-radius:2px;padding:0 1px;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#334155',
  markIgnored:
    'background:transparent;border-bottom:2px dashed #94a3b8;border-radius:2px;padding:0 1px;color:#64748b',
  popover:
    'position:fixed;z-index:2147483647;width:300px;box-sizing:border-box;background:#fff;color:#0f172a;border:1px solid #fecdd3;border-radius:10px;box-shadow:0 12px 32px rgba(225,29,72,.22);padding:12px 14px;font:13px/1.4 Segoe UI,system-ui,sans-serif;animation:vgPop 160ms cubic-bezier(0.34,1.56,0.64,1);',
  cls: 'font-size:11px;font-weight:700;letter-spacing:.04em;color:#e11d48;text-transform:uppercase;margin-bottom:6px',
  rec: 'font-family:ui-monospace,Consolas,monospace;font-size:13px;background:#fff1f2;padding:8px 10px;border-radius:6px;margin:8px 0 10px;border:1px solid #fecdd3',
  reason:
    'width:100%;box-sizing:border-box;border:1.5px solid #fda4af;border-radius:6px;padding:8px 10px;font:13px Segoe UI,system-ui,sans-serif;margin-bottom:8px;outline:none',
};

/**
 * Prefer RIGHT of the word (founder). Flip to the left if no room.
 * Vertically align with the word; clamp into the viewport.
 */
export function placePopover(
  anchor: DOMRect,
  vw = typeof window !== 'undefined' ? window.innerWidth : 800,
  vh = typeof window !== 'undefined' ? window.innerHeight : 600,
): { top: number; left: number } {
  let left = anchor.right + POPOVER_GAP;
  if (left + POPOVER_W > vw - 8) {
    left = Math.max(8, anchor.left - POPOVER_W - POPOVER_GAP);
  }

  let top = anchor.top;
  if (top + POPOVER_EST_H > vh - 8) {
    top = Math.max(8, vh - POPOVER_EST_H - 8);
  }
  if (top < 8) top = 8;
  return { top, left };
}

export function Modal({
  text,
  findings,
  numbering,
  files,
  onAcknowledgeFileError,
  onProceed,
}: ModalProps) {
  const [decisions, setDecisions] = useState<SpanDecisionMap>(() => initDecisions(findings));
  const [activePane, setActivePane] = useState<PaneId>('prompt');
  const [fileDecisions, setFileDecisions] = useState<Map<string, SpanDecisionMap>>(new Map());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [ignoreDraft, setIgnoreDraft] = useState('');
  const [animKey, setAnimKey] = useState<string | null>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const spanRefs = useRef<Map<string, HTMLElement>>(new Map());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFileDecisions((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const held of files) {
        if (held.status.kind === 'scanned' && !next.has(held.id)) {
          next.set(held.id, initDecisions(held.findings ?? []));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  const panes = useMemo(
    () =>
      buildPanes(
        text,
        findings,
        decisions,
        files.map((h) => ({ ...h, decisions: fileDecisions.get(h.id) ?? h.decisions })),
      ),
    [text, findings, decisions, files, fileDecisions],
  );

  const pane = panes.find((p) => p.id === activePane) ?? panes[0]!;
  const proceedable = canProceed(panes);

  const totalPending = useMemo(() => {
    let n = 0;
    for (const p of panes) {
      if (p.decisions) n += pendingCount(p.decisions);
    }
    return n;
  }, [panes]);

  const segments = useMemo(() => {
    if (pane.state !== 'clean' && pane.state !== 'dirty') return [];
    return buildPreviewSegments(pane.text ?? '', pane.findings ?? [], pane.decisions ?? new Map());
  }, [pane]);

  const clearHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = setTimeout(() => {
      setOpenKey(null);
      setPopPos(null);
      setIgnoreDraft('');
    }, 200);
  };

  const openAt = (key: string, el: HTMLElement) => {
    clearHide();
    setOpenKey(key);
    setIgnoreDraft('');
    setPopPos(placePopover(el.getBoundingClientRect()));
  };

  const reposition = () => {
    if (!openKey) return;
    const el = spanRefs.current.get(openKey);
    if (!el) return;
    setPopPos(placePopover(el.getBoundingClientRect()));
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      cardRef.current
        ?.querySelector<HTMLElement>('[data-vg-autofocus]')
        ?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!openKey) return;
    const t = window.setTimeout(() => {
      reasonRef.current?.focus({ preventScroll: true });
    }, 0);
    const body = bodyRef.current;
    body?.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition);
    return () => {
      window.clearTimeout(t);
      body?.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, [openKey]);

  const setStatus = (key: string, status: SpanStatus) => {
    if (pane.id === 'prompt') {
      setDecisions((prev) => {
        const next = new Map(prev);
        next.set(key, status);
        return next;
      });
      return;
    }
    const fileId = pane.fileId;
    if (!fileId) return;
    setFileDecisions((prev) => {
      const next = new Map(prev);
      const map = new Map(next.get(fileId) ?? pane.decisions ?? new Map());
      map.set(key, status);
      next.set(fileId, map);
      return next;
    });
  };

  const acceptOne = (f: Finding) => {
    const key = spanKey(f);
    const placeholder = numbering.placeholderFor(f.cls, f.text);
    setAnimKey(key);
    setStatus(key, { kind: 'accepted', placeholder });
    setOpenKey(null);
    setPopPos(null);
    setIgnoreDraft('');
    window.setTimeout(() => setAnimKey(null), 420);
  };

  const ignoreOne = (f: Finding) => {
    const reason = ignoreDraft.trim();
    if (!reason) return;
    setStatus(spanKey(f), { kind: 'ignored', reason });
    setOpenKey(null);
    setPopPos(null);
    setIgnoreDraft('');
  };

  const proceed = (promptMap?: SpanDecisionMap) => {
    const promptDecisions = promptMap ?? decisions;
    const finalText = buildFinalText(text, findings, promptDecisions, numbering);
    const ignored: ProceedResult['ignored'] = [];
    for (const f of findings) {
      const d = promptDecisions.get(spanKey(f));
      if (d?.kind === 'ignored') ignored.push({ finding: f, reason: d.reason });
    }

    const fileResults: FileProceed[] = [];
    for (const held of files) {
      if (held.status.kind !== 'scanned') continue;
      const map = fileDecisions.get(held.id) ?? held.decisions ?? new Map();
      const finalFileText = buildFinalText(held.extract ?? '', held.findings ?? [], map, numbering);
      const fileIgnored: FileProceed['ignored'] = [];
      for (const f of held.findings ?? []) {
        const d = map.get(spanKey(f));
        if (d?.kind === 'ignored') fileIgnored.push({ finding: f, reason: d.reason });
      }
      const hasAccepted = [...map.values()].some((d) => d.kind === 'accepted');
      fileResults.push({
        id: held.id,
        finalText: finalFileText,
        ignored: fileIgnored,
        decisions: map,
        unchanged: !hasAccepted,
      });
    }

    onProceed({ finalText, ignored, files: fileResults });
  };

  const onAcceptAll = () => {
    if (pane.state !== 'clean' && pane.state !== 'dirty') return;
    const paneFindings = pane.findings ?? [];
    const map = acceptAllDecisions(paneFindings, numbering);

    if (pane.id === 'prompt') {
      setDecisions(map);
    } else if (pane.fileId) {
      setFileDecisions((prev) => {
        const next = new Map(prev);
        next.set(pane.fileId!, map);
        return next;
      });
    }

    setOpenKey(null);
    setPopPos(null);

    if (files.length === 0 && pane.id === 'prompt') {
      window.setTimeout(() => proceed(map), 380);
    }
  };

  const openFinding = (pane.findings ?? []).find((f) => spanKey(f) === openKey) ?? null;
  const showPreview = pane.state === 'clean' || pane.state === 'dirty';

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vg-send-title"
      data-vg-autofocus
      tabIndex={-1}
      style={shell.root}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          setOpenKey(null);
          setPopPos(null);
        }
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      <div style={shell.card}>
        <header style={shell.header}>
          <h2 id="vg-send-title" style={shell.title}>
            Review before send
          </h2>
          <p style={shell.sub}>
            {totalPending === 0
              ? panes.every((p) => p.state === 'clean')
                ? 'Prompt and files look clean. Proceed attaches them — you press Send.'
                : 'All items resolved. Proceed writes the result into the composer — you press Send.'
              : `${totalPending} item${totalPending === 1 ? '' : 's'} still need Accept or Ignore. Hover a red underline.`}
          </p>
        </header>

        {panes.length > 1 && (
          <div style={shell.tabs} role="tablist">
            {panes.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === activePane}
                style={p.id === activePane ? shell.tabActive : shell.tab}
                onClick={() => setActivePane(p.id)}
              >
                {p.title}
                <span style={shell.badge}>{p.badge}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={bodyRef} style={shell.body}>
          {pane.state === 'busy' && (
            <p style={shell.errorPane}>
              Checking “{pane.fileName}”… The prompt above is ready to review while this finishes.
            </p>
          )}

          {pane.state === 'error' && (
            <div>
              <p style={shell.errorPane}>{pane.message}</p>
              {pane.badge === 'Not checked' && (
                <div style="margin-top:12px">
                  <input
                    style={shell.reason}
                    placeholder="Why are you sending this unchecked file? (required)"
                    data-vg-autofocus
                    onKeyDown={(e) => {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (e.key === 'Enter' && value) onAcknowledgeFileError(pane.fileId!, value);
                    }}
                  />
                  <p style="margin:0;font:12px Segoe UI,system-ui;color:#7c2d12">
                    Vanguard could not read this file, so it cannot mask anything in it. Sending it
                    attaches the original, and the reason is recorded.
                  </p>
                </div>
              )}
            </div>
          )}

          {showPreview && (
            <>
              <div style={shell.preview}>
                {segments.map((seg, i) => {
                  if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
                  const key = spanKey(seg.finding);
                  const markStyle =
                    seg.status === 'accepted'
                      ? shell.markAccepted
                      : seg.status === 'ignored'
                        ? shell.markIgnored
                        : shell.markPending;
                  const anim = animKey === key ? 'animation:vgMorph 400ms ease-out;' : '';
                  return (
                    <span
                      key={key}
                      ref={(node) => {
                        if (node) spanRefs.current.set(key, node);
                        else spanRefs.current.delete(key);
                      }}
                      role={seg.status === 'pending' ? 'button' : undefined}
                      tabIndex={seg.status === 'pending' ? 0 : undefined}
                      style={`${markStyle}${anim}`}
                      onMouseEnter={(e) => {
                        if (seg.status === 'pending') openAt(key, e.currentTarget as HTMLElement);
                      }}
                      onMouseLeave={scheduleHide}
                      onFocus={(e) => {
                        if (seg.status === 'pending') openAt(key, e.currentTarget as HTMLElement);
                      }}
                      onClick={(e) => {
                        if (seg.status === 'pending') openAt(key, e.currentTarget as HTMLElement);
                      }}
                    >
                      {seg.display}
                    </span>
                  );
                })}
              </div>
              {pane.coverage && (
                <p style={shell.coverage}>
                  <strong>What Vanguard read:</strong> {pane.coverage.read.join(', ') || 'nothing'}.
                  {pane.coverage.not_read.length > 0 && (
                    <>
                      {' '}
                      <strong>Not read:</strong> {pane.coverage.not_read.join(', ')} — anything
                      sensitive in there was not checked.
                    </>
                  )}
                  {pane.truncated && <> Only the first part of this file was checked.</>}
                </p>
              )}
            </>
          )}
        </div>

        <footer style={shell.footer}>
          {showPreview && (
            <button type="button" style={shell.btnSecondary} onClick={onAcceptAll}>
              Accept all
            </button>
          )}
          <button
            type="button"
            style={proceedable ? shell.btnPrimary : shell.btnPrimaryDisabled}
            disabled={!proceedable}
            onClick={() => proceed()}
          >
            Proceed
          </button>
        </footer>
      </div>

      {openFinding && popPos && (
        <div
          role="dialog"
          aria-label="Span review"
          style={`${shell.popover}top:${popPos.top}px;left:${popPos.left}px;`}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div style={shell.cls}>{openFinding.cls}</div>
          <div>{whyForClass(openFinding.cls)}</div>
          <div style={shell.rec}>
            Recommend: {numbering.placeholderFor(openFinding.cls, openFinding.text)}
          </div>
          <input
            ref={reasonRef}
            style={shell.reason}
            placeholder="Reason required to ignore"
            value={ignoreDraft}
            onInput={(e) => setIgnoreDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                ignoreOne(openFinding);
              }
            }}
          />
          <div style="display:flex;gap:8px">
            <button type="button" style={shell.btnPrimary} onClick={() => acceptOne(openFinding)}>
              Accept
            </button>
            <button
              type="button"
              style={
                ignoreDraft.trim()
                  ? shell.btnSecondary
                  : `${shell.btnSecondary}opacity:.45;cursor:not-allowed`
              }
              disabled={!ignoreDraft.trim()}
              onClick={() => ignoreOne(openFinding)}
            >
              Ignore
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes vgMorph {
          0% { opacity: 0.35; filter: blur(2px); }
          100% { opacity: 1; filter: none; }
        }
        @keyframes vgPop {
          from { opacity: 0; transform: translateY(4px) scale(0.97); }
          to { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
