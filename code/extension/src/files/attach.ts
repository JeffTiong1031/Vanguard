/**
 * The write half of the interceptor: hand the provider the file WE chose.
 *
 * Mirrors `adapter.writeText()` -- same contract, same reason. U28 is the
 * verified claim that setting `input.files` from a synthesized DataTransfer
 * makes the provider upload our bytes.
 */
const REATTACH_ATTR = 'data-vanguard-reattach';

export function attachFiles(input: HTMLInputElement, files: File[]): boolean {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);

  try {
    input.files = transfer.files;
  } catch {
    return false; // read-only in some engines; caller surfaces the failure
  }

  // Marked so our own capture listener lets this change event through, then
  // unmarked immediately -- a marker left behind would blind the interceptor
  // to the user's NEXT attach, which fails open and silently.
  input.setAttribute(REATTACH_ATTR, '1');
  try {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    input.removeAttribute(REATTACH_ATTR);
  }
  return input.files.length === files.length;
}
