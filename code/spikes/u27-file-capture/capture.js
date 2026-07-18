// U27 — does an isolated-world window-capture listener beat the provider's uploader?
// Instrument only. Logs FILENAMES and SIZES, never file CONTENT (U26's lesson).
const log = [];
const rec = (evt, detail) => {
  const row = { t: Date.now(), evt, ...detail };
  log.push(row);
  console.log('[U27]', JSON.stringify(row));
};

window.addEventListener('change', (e) => {
  const el = e.composedPath().find((n) => n instanceof HTMLInputElement && n.type === 'file');
  if (!el) return;
  const names = [...(el.files || [])].map((f) => ({ name: f.name, size: f.size, type: f.type }));
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

// U28 — re-attach probe. Call from the console: __u27_reattach()
window.__u27_reattach = () => {
  const input = document.querySelector('input[type=file]');
  if (!input) return rec('reattach', { ok: false, why: 'no input[type=file] found' });
  const dt = new DataTransfer();
  dt.items.add(new File(['hello from vanguard'], 'vanguard-test.txt', { type: 'text/plain' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  rec('reattach', { ok: input.files.length === 1, name: input.files[0]?.name });
};

window.__u27_dump = () => JSON.stringify(log, null, 2);
rec('installed', { href: location.href });
