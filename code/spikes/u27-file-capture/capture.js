// U27 — does an isolated-world window-capture listener beat the provider's uploader?
// Instrument only. Logs FILENAMES and SIZES, never file CONTENT (U26's lesson).
const log = [];
const rec = (evt, detail) => {
  const row = { t: Date.now(), evt, ...detail };
  log.push(row);
  console.log('[U27]', JSON.stringify(row));
};

// When true, the next file-input `change` is allowed through (U28 reattach).
// Without this, the capture listener blocks our own synthetic change and clears
// the input — so U28 always reports ok:false (harness fighting itself).
let allowNextChange = false;

window.addEventListener('change', (e) => {
  const el = e.composedPath().find((n) => n instanceof HTMLInputElement && n.type === 'file');
  if (!el) return;
  const names = [...(el.files || [])].map((f) => ({ name: f.name, size: f.size, type: f.type }));

  if (allowNextChange) {
    allowNextChange = false;
    rec('change', { at: 'window', phase: 'capture', names, blocked: false, reason: 'u28-passthrough' });
    return; // do not stop — let the provider see the file
  }

  rec('change', { at: 'window', phase: 'capture', names, blocked: true });
  e.stopImmediatePropagation();
  e.preventDefault();
  el.value = '';
}, true);

window.addEventListener('drop', (e) => {
  const names = [...(e.dataTransfer?.files || [])].map((f) => ({ name: f.name, size: f.size }));
  if (!names.length) return;
  rec('drop', { at: 'window', phase: 'capture', names, blocked: true });
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);
window.addEventListener('dragover', (e) => e.preventDefault(), true);

window.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file');
  if (!items.length) return;
  rec('paste', { at: 'window', phase: 'capture', count: items.length, blocked: true });
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

// U28 — re-attach probe. Call from the console context "U27 file-capture spike"
// (not "top" — content-script helpers are invisible on the page world).
window.__u27_reattach = () => {
  const inputs = [...document.querySelectorAll('input[type=file]')];
  const input = inputs[0];
  if (!input) return rec('reattach', { ok: false, why: 'no input[type=file] found', inputCount: 0 });

  allowNextChange = true;
  const dt = new DataTransfer();
  dt.items.add(new File(['hello from vanguard'], 'vanguard-test.txt', { type: 'text/plain' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const ok = input.files.length === 1 && input.files[0]?.name === 'vanguard-test.txt';
  rec('reattach', {
    ok,
    name: input.files[0]?.name,
    size: input.files[0]?.size,
    inputCount: inputs.length,
    allowFlagCleared: allowNextChange === false,
  });
  return ok;
};

window.__u27_dump = () => JSON.stringify(log, null, 2);
rec('installed', { href: location.href, tip: 'Console context must be "U27 file-capture spike" for __u27_reattach' });
