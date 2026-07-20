// src/ui/sensitivity-panel.tsx
//
// Lives here rather than in the options entrypoint so it can be rendered in a test without
// the entrypoint's top-level render() firing at import time.
import { useEffect, useState } from 'preact/hooks';
import { describeStatus, type SensitivityStatus } from '../detection/l2/messages';
import { loadConfig, setModelId } from '../detection/l2/sensitivity';
import { readStatus } from '../detection/l2/status-store';

// ADR 0029: the published, hash-pinned bundle. Public by design — the extension fetches it
// with no credentials, and per ADR 0003 the moat was never the model.
const DEFAULT_MODEL = 'tehjiajie/vanguard-sens-v0.2.0-trim70k';

/**
 * 🔴 This panel exists because the feature had no observable state.
 *
 * Model absent, server down, wrong dtype, missing permission, load timeout, block skipped, and
 * "the model genuinely said MASK" all produced byte-identical behaviour, and the only output
 * channel was a console.debug in a lazily-created document. A full session was spent unable to
 * tell "not connected" from "connected and disagreeing".
 *
 * ADR 0014 says a dead engine degrades rather than decides. Degrading requires someone to
 * notice, and until now nobody could.
 */
export function SensitivityPanel() {
  const [modelId, setModel] = useState('');
  const [status, setStatus] = useState<SensitivityStatus>({ state: 'disabled' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadConfig().then((c) => setModel(c.modelId ?? '')).catch(() => setModel(''));
    const poll = () => { void readStatus().then((s) => { if (s) setStatus(s); }).catch(() => {}); };
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:20px">
      <h1 style="font-size:18px">Sensitivity classifier</h1>
      <p style="color:#475569">
        Decides whether a name or company we found is actually sensitive, so
        “Explain Einstein’s theory” is not blocked while “Einstein from accounting hasn’t sent the
        invoice” still is. <strong>Runs entirely on your machine.</strong> The model is downloaded
        once (~535&nbsp;MB) and cached; nothing you type is ever sent anywhere.
      </p>
      <label style="display:block;margin-bottom:6px">Model</label>
      <input
        value={modelId}
        placeholder={DEFAULT_MODEL}
        onInput={(e) => { setModel((e.target as HTMLInputElement).value); setSaved(false); }}
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center">
        <button
          onClick={async () => { await setModelId(modelId.trim() || null); setSaved(true); }}
          style="padding:8px 14px;border:none;border-radius:6px;background:#e11d48;color:#fff;cursor:pointer"
        >Save</button>
        <button
          onClick={async () => { await setModelId(null); setModel(''); setSaved(true); }}
          style="padding:8px 14px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer"
        >Turn off</button>
        {saved && <span style="color:#15803d">Saved</span>}
      </div>
      <p style="margin-top:14px">
        <strong>Status:</strong>{' '}
        <span style={status.state === 'failed' ? 'color:#b91c1c' : 'color:#334155'}>
          {describeStatus(status)}
        </span>
      </p>
      <p style="color:#64748b;font-size:13px">
        ⚠️ Prompts longer than about 400 characters skip the classifier and stay fully masked —
        the cutoff is a speed limit, not a bug. It is a knob the team test is meant to move.
      </p>
    </div>
  );
}

