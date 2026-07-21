import { useEffect, useState } from 'preact/hooks';
import { api, UnauthorisedError, type Tool } from '../api';
import { ShieldIcon } from '../icons';

export function Tools() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      setTools(await api.get<Tool[]>('/v1/admin/tools'));
      setError('');
    } catch (err) {
      // Let the shell handle session expiry -- swallowing it here would
      // break the unhandledrejection-driven 401 bounce in main.tsx.
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not load tools.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function toggle(tool: Tool) {
    setBusy(tool.llm_id);
    setError('');
    try {
      const status = tool.status === 'approved' ? 'blocked' : 'approved';
      await api.post(`/v1/admin/tools/${tool.llm_id}`, { status });
      await load();
    } catch (err) {
      // Let the shell handle session expiry -- swallowing it here would
      // break the unhandledrejection-driven 401 bounce in main.tsx.
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not update the tool.');
    } finally {
      // Always clear busy, whatever happened above -- a 5xx or a dropped
      // connection must not leave the button permanently disabled.
      setBusy('');
    }
  }

  return (
    <section class="panel">
      <div class="panel-head">
        <span class="ico"><ShieldIcon /></span>
        <div>
          <h2>AI Tools</h2>
          <p class="sub">Approved tools run without a warning; blocked tools show a banner and a one-click access request.</p>
        </div>
        <span class="tag count">{tools.length} tools</span>
      </div>
      {error && <p class="error">{error}</p>}
      <table>
        <thead><tr><th>Tool</th><th>Host</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.llm_id}>
              <td><span class="name">{t.display_name}</span></td>
              <td><code>{t.host}</code></td>
              <td><span class={`pill ${t.status}`}>{t.status}</span></td>
              <td>
                <div class="row-actions">
                  <button
                    class={`btn-sm ${t.status === 'approved' ? 'btn-danger' : 'btn-primary'}`}
                    disabled={busy === t.llm_id} onClick={() => toggle(t)}
                  >
                    {t.status === 'approved' ? 'Block' : 'Approve'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
