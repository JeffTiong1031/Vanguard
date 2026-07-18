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
