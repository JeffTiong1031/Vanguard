import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Finding } from '../detection/l1/types';
import { SessionNumbering } from '../mask/placeholder';
import {
  allResolved,
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

export type ProceedResult = {
  finalText: string;
  ignored: Array<{ finding: Finding; reason: string }>;
};

export type ModalProps = {
  text: string;
  findings: Finding[];
  numbering: SessionNumbering;
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
  body: 'padding:16px 20px;overflow:auto;flex:1;min-height:120px',
  preview: 'margin:0;padding:14px 16px;border-radius:10px;background:#fff7f8;border:1px solid #fecdd3;font:15px/1.65 Segoe UI,system-ui,sans-serif;white-space:pre-wrap;word-break:break-word;color:#0f172a',
  footer: 'padding:12px 20px 16px;border-top:1px solid #f1f5f9;display:flex;gap:10px;align-items:center;justify-content:flex-end;background:#fafafa;flex-shrink:0',
  btnPrimary: 'border:none;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:pointer;background:#e11d48;color:#fff',
  btnPrimaryDisabled: 'border:none;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:not-allowed;background:#fecdd3;color:#fff',
  btnSecondary: 'border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:pointer;background:#fff;color:#334155',
  markPending: 'background:rgba(225,29,72,.16);border-bottom:2.5px solid #e11d48;border-radius:2px;cursor:pointer;padding:0 1px;color:#9f1239;font-weight:600',
  markAccepted: 'background:rgba(15,23,42,.06);border-bottom:2px solid #64748b;border-radius:2px;padding:0 1px;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#334155',
  markIgnored: 'background:transparent;border-bottom:2px dashed #94a3b8;border-radius:2px;padding:0 1px;color:#64748b',
  popover:
    'position:fixed;z-index:2147483647;width:300px;background:#fff;color:#0f172a;border:1px solid #fecdd3;border-radius:10px;box-shadow:0 12px 32px rgba(225,29,72,.22);padding:12px 14px;font:13px/1.4 Segoe UI,system-ui,sans-serif;animation:vgPop 160ms cubic-bezier(0.34,1.56,0.64,1)',
  cls: 'font-size:11px;font-weight:700;letter-spacing:.04em;color:#e11d48;text-transform:uppercase;margin-bottom:6px',
  rec: 'font-family:ui-monospace,Consolas,monospace;font-size:13px;background:#fff1f2;padding:8px 10px;border-radius:6px;margin:8px 0 10px;border:1px solid #fecdd3',
  reason: 'width:100%;box-sizing:border-box;border:1.5px solid #fda4af;border-radius:6px;padding:8px 10px;font:13px Segoe UI,system-ui,sans-serif;margin-bottom:8px;outline:none',
};

/** Place the card near the word; flip above/left if it would leave the viewport. */
export function placePopover(
  anchor: DOMRect,
  vw = typeof window !== 'undefined' ? window.innerWidth : 800,
  vh = typeof window !== 'undefined' ? window.innerHeight : 600,
): { top: number; left: number } {
  let top = anchor.bottom + POPOVER_GAP;
  let left = anchor.left;

  if (top + POPOVER_EST_H > vh - 8) {
    top = Math.max(8, anchor.top - POPOVER_EST_H - POPOVER_GAP);
  }
  if (left + POPOVER_W > vw - 8) {
    left = Math.max(8, vw - POPOVER_W - 8);
  }
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  return { top, left };
}

export function Modal({ text, findings, numbering, onProceed }: ModalProps) {
  const [decisions, setDecisions] = useState<SpanDecisionMap>(() => initDecisions(findings));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [ignoreDraft, setIgnoreDraft] = useState('');
  const [animKey, setAnimKey] = useState<string | null>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const spanRefs = useRef<Map<string, HTMLElement>>(new Map());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const segments = useMemo(
    () => buildPreviewSegments(text, findings, decisions),
    [text, findings, decisions],
  );
  const resolved = allResolved(decisions);
  const left = pendingCount(decisions);

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
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(key, status);
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

  const proceed = (map: SpanDecisionMap) => {
    const finalText = buildFinalText(text, findings, map, numbering);
    const ignored: ProceedResult['ignored'] = [];
    for (const f of findings) {
      const d = map.get(spanKey(f));
      if (d?.kind === 'ignored') ignored.push({ finding: f, reason: d.reason });
    }
    onProceed({ finalText, ignored });
  };

  const onAcceptAll = () => {
    const map = acceptAllDecisions(findings, numbering);
    setDecisions(map);
    setOpenKey(null);
    setPopPos(null);
    window.setTimeout(() => proceed(map), 380);
  };

  const openFinding = findings.find((f) => spanKey(f) === openKey) ?? null;

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
            {left === 0
              ? 'All items resolved. Proceed writes the result into the composer — you press Send.'
              : `${left} item${left === 1 ? '' : 's'} still need Accept or Ignore. Hover a red underline.`}
          </p>
        </header>

        <div ref={bodyRef} style={shell.body}>
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
        </div>

        <footer style={shell.footer}>
          <button type="button" style={shell.btnSecondary} onClick={onAcceptAll}>
            Accept all
          </button>
          <button
            type="button"
            style={resolved ? shell.btnPrimary : shell.btnPrimaryDisabled}
            disabled={!resolved}
            onClick={() => proceed(decisions)}
          >
            Proceed
          </button>
        </footer>
      </div>

      {openFinding && popPos && (
        <div
          role="dialog"
          aria-label="Span review"
          style={`${shell.popover}top:${popPos.top}px;left:${popPos.left}px`}
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
