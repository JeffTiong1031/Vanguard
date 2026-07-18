### Task 11: the modal (Preact, shadow root) + Ignore-with-reason

**Files:**
- Create: `code/extension/src/ui/mount.ts`
- Create: `code/extension/src/ui/modal.tsx`
- Create: `code/extension/tests/modal.test.tsx`

**Interfaces:**
- Consumes: the rewrite map, an `onApprove()`, an `onIgnore(reason)`
- Produces: `function showModal(props: ModalProps): void` / `function hideModal(): void`

> **Shadow root (doc 01 §6):** the modal lives in a closed shadow root so the page's CSS cannot touch it and ours cannot leak. It shows the findings by **class + count** and the rewrite preview, offers **Approve** (writes the rewrite, mints the token, closes) and **Ignore with reason** (records the Ignore, closes without rewriting). Decision #8: the modal never sends; it hands back to the user.

- [ ] **Step 1: Failing test (Approve fires onApprove with the rewritten text; Ignore requires a reason)**

```tsx
// tests/modal.test.tsx  (jsdom environment)
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { Modal } from '../src/ui/modal';

describe('Modal', () => {
  it('Approve calls onApprove', () => {
    const onApprove = vi.fn();
    const { getByText } = render(
      <Modal rewritten="call PERSON_1" summary={[{ cls: 'PERSON', count: 1 }]} onApprove={onApprove} onIgnore={() => {}} />,
    );
    fireEvent.click(getByText(/approve/i));
    expect(onApprove).toHaveBeenCalledOnce();
  });
  it('Ignore is disabled until a reason is entered', () => {
    const onIgnore = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <Modal rewritten="x" summary={[]} onApprove={() => {}} onIgnore={onIgnore} />,
    );
    fireEvent.click(getByText(/ignore/i));
    expect(onIgnore).not.toHaveBeenCalled(); // no reason yet
    fireEvent.input(getByPlaceholderText(/reason/i), { target: { value: 'false positive' } });
    fireEvent.click(getByText(/ignore/i));
    expect(onIgnore).toHaveBeenCalledWith('false positive');
  });
});
```

- [ ] **Step 2: Implement `modal.tsx` (component) and `mount.ts` (shadow host)**

```tsx
// src/ui/modal.tsx
import { useState } from 'preact/hooks';
export type ModalProps = {
  rewritten: string;
  summary: Array<{ cls: string; count: number }>;
  onApprove: () => void;
  onIgnore: (reason: string) => void;
};
export function Modal({ rewritten, summary, onApprove, onIgnore }: ModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div role="dialog" style="all:initial;font:14px system-ui;color:#111">
      <h2>Sensitive content detected</h2>
      <ul>{summary.map((s) => <li key={s.cls}>{s.cls}: {s.count}</li>)}</ul>
      <pre style="white-space:pre-wrap;background:#f4f4f5;padding:8px">{rewritten}</pre>
      <button onClick={onApprove}>Approve &amp; insert rewrite</button>
      <input placeholder="Reason to ignore" value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
      <button disabled={!reason} onClick={() => reason && onIgnore(reason)}>Ignore</button>
    </div>
  );
}
```

```ts
// src/ui/mount.ts
import { render } from 'preact';
import { Modal, type ModalProps } from './modal';
let host: HTMLElement | null = null;
export function showModal(props: ModalProps): void {
  if (!host) {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.35)';
    (document.body || document.documentElement).appendChild(host);
    host.attachShadow({ mode: 'closed' });
  }
  render(<Modal {...props} />, (host as any).shadowRoot!);
}
export function hideModal(): void { if (host) { render(null as any, (host as any).shadowRoot!); host.remove(); host = null; } }
```

> **`[verify]`** closed-shadow-root rendering with Preact's `render` target; if the closed root is awkward to reach for `render`, keep the reference from `attachShadow` in a module variable rather than reading it back off the host.

- [ ] **Step 3: PASS + commit**

```bash
cd code/extension && npx vitest run tests/modal.test.tsx
git add code/extension/src/ui code/extension/tests/modal.test.tsx
git commit -m "feat(ext): Preact modal in a shadow root with Ignore-with-reason"
```

