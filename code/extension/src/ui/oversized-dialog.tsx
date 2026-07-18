import { CLIENT_LIMITS } from '../files/config';

const LIMIT_MB = Math.round(CLIENT_LIMITS.maxUploadBytes / (1024 * 1024));

export type OversizedDialogProps = {
  fileName: string;
  sizeBytes: number;
  onProceed: () => void;
  onDecline: () => void;
};

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

const shell = {
  root: 'all:initial;box-sizing:border-box;font-family:Segoe UI,system-ui,-apple-system,sans-serif;color:#0f172a',
  card:
    'width:min(440px,92vw);display:flex;flex-direction:column;background:#fff;border-radius:14px;' +
    'box-shadow:0 24px 64px rgba(15,23,42,.22),0 0 0 1px rgba(225,29,72,.12);overflow:hidden',
  header:
    'padding:18px 20px 12px;border-bottom:1px solid #ffe4e6;background:linear-gradient(180deg,#fff1f2 0%,#fff 100%)',
  title: 'margin:0;font:700 17px/1.3 Segoe UI,system-ui,sans-serif;color:#9f1239',
  body: 'padding:16px 20px;font:14px/1.55 Segoe UI,system-ui,sans-serif;color:#334155',
  name: 'margin:0 0 10px;font:600 14px Segoe UI,system-ui,sans-serif;color:#0f172a;word-break:break-all',
  footer:
    'padding:12px 20px 16px;border-top:1px solid #f1f5f9;display:flex;gap:10px;justify-content:flex-end;background:#fafafa',
  btnPrimary:
    'border:none;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:pointer;background:#e11d48;color:#fff',
  btnSecondary:
    'border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;font:600 13px Segoe UI,system-ui,sans-serif;cursor:pointer;background:#fff;color:#334155',
};

/** Immediate attach-time dialog when a file exceeds the check limit. */
export function OversizedDialog({
  fileName,
  sizeBytes,
  onProceed,
  onDecline,
}: OversizedDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vg-oversize-title"
      data-vg-autofocus
      tabIndex={-1}
      style={shell.root}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <div style={shell.card}>
        <header style={shell.header}>
          <h2 id="vg-oversize-title" style={shell.title}>
            File too large to check
          </h2>
        </header>
        <div style={shell.body}>
          <p style={shell.name}>
            {fileName} ({formatMb(sizeBytes)} MB)
          </p>
          <p style="margin:0 0 10px">
            Vanguard can only check files up to {LIMIT_MB} MB. This file was{' '}
            <strong>not scanned</strong> for sensitive data.
          </p>
          <p style="margin:0">
            If you trust this file and want to attach it anyway, press{' '}
            <strong>Proceed</strong>. Otherwise press <strong>Don&apos;t attach</strong> and we
            will discard it.
          </p>
        </div>
        <footer style={shell.footer}>
          <button type="button" style={shell.btnSecondary} onClick={onDecline}>
            Don&apos;t attach
          </button>
          <button type="button" style={shell.btnPrimary} onClick={onProceed}>
            Proceed
          </button>
        </footer>
      </div>
    </div>
  );
}
