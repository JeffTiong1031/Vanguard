# Shared UI components

Framework: **Preact** inside a **WXT** Manifest V3 Chrome extension.
Component library: **custom** (no shadcn/MUI). CSS: **inline styles** in shadow DOM (closed).

Shared UI lives under `code/extension/src/ui/`.

## Modal — `code/extension/src/ui/modal.tsx`

Send-time hard-gate dialog (L1+L2). Slice 1.5 typing hints do **not** replace this.

```tsx
import { useState } from 'preact/hooks';

export type ModalProps = {
  rewritten: string;
  summary: Array<{ cls: string; count: number }>;
  onApprove: () => void;
  onIgnore: (reason: string) => void;
};

export function Modal({
  rewritten,
  summary,
  onApprove,
  onIgnore,
}: ModalProps) {
  const [reason, setReason] = useState('');
  const trimmedReason = reason.trim();

  return (
    <div
      role="dialog"
      aria-labelledby="modal-title"
      style="all:initial;font:14px system-ui;color:#111"
    >
      <h2 id="modal-title">Sensitive content detected</h2>
      <ul>
        {summary.map(({ cls, count }) => (
          <li key={cls}>
            {cls}: {count}
          </li>
        ))}
      </ul>
      <pre style="white-space:pre-wrap;background:#f4f4f5;padding:8px">
        {rewritten}
      </pre>
      <button type="button" onClick={onApprove}>
        Approve &amp; insert rewrite
      </button>
      <input
        placeholder="Reason to ignore"
        value={reason}
        onInput={(event) =>
          setReason((event.target as HTMLInputElement).value)
        }
      />
      <button
        type="button"
        disabled={!trimmedReason}
        onClick={() => trimmedReason && onIgnore(trimmedReason)}
      >
        Ignore
      </button>
    </div>
  );
}
```

## Mount — `code/extension/src/ui/mount.ts`

Hosts modal + degraded banner in **closed shadow** roots. Hosts carry `data-vanguard-ui` so the capture gate skips Enter/click inside our UI.

(See live file for full source.)
