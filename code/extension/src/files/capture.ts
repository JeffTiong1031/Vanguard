/**
 * Attach-time file interception (U27).
 *
 * 🔴 Why attach and not Send: both target surfaces upload an attachment the
 * moment it is picked. A Send-time gate would review a file the provider
 * already has -- the control appears to work while the leak has happened,
 * which is doc 00 section 6's worst case.
 *
 * Mechanism is deliberately identical to the keydown gate that U12 validated:
 * `window`, capture phase, registered at document_start, and
 * `composedPath()` rather than `event.target` because shadow DOM retargets
 * (ADR 0005 / ADR 0010).
 */
export type FileCaptureOptions = {
  onFiles: (files: File[]) => void;
};

const REATTACH_ATTR = 'data-vanguard-reattach';

export function installFileCapture({ onFiles }: FileCaptureOptions): () => void {
  const onChange = (event: Event) => {
    const input = event
      .composedPath()
      .find(
        (node): node is HTMLInputElement =>
          node instanceof HTMLInputElement && node.type === 'file',
      );
    if (!input) return;
    if (input.hasAttribute(REATTACH_ATTR)) return; // our own write; let it through
    const files = [...(input.files ?? [])];
    if (files.length === 0) return;

    event.stopImmediatePropagation();
    event.preventDefault();
    input.value = ''; // the provider must not find the file if it re-reads the input
    onFiles(files);
  };

  const onDrop = (event: DragEvent) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    onFiles(files);
  };

  const onDragOver = (event: DragEvent) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  };

  const onPaste = (event: ClipboardEvent) => {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);
    if (files.length === 0) return; // text paste is the prompt path; do not touch it
    event.stopImmediatePropagation();
    event.preventDefault();
    onFiles(files);
  };

  window.addEventListener('change', onChange, true);
  window.addEventListener('drop', onDrop, true);
  window.addEventListener('dragover', onDragOver, true);
  window.addEventListener('paste', onPaste, true);

  return () => {
    window.removeEventListener('change', onChange, true);
    window.removeEventListener('drop', onDrop, true);
    window.removeEventListener('dragover', onDragOver, true);
    window.removeEventListener('paste', onPaste, true);
  };
}
