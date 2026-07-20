import { useEffect, useState } from 'preact/hooks';
import { api, type Tool } from '../api';

export function Tools() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [busy, setBusy] = useState('');

  async function load() { setTools(await api.get<Tool[]>('/v1/admin/tools')); }
  useEffect(() => { void load(); }, []);

  async function toggle(tool: Tool) {
    setBusy(tool.llm_id);
    const status = tool.status === 'approved' ? 'blocked' : 'approved';
    await api.post(`/v1/admin/tools/${tool.llm_id}`, { status });
    await load();
    setBusy('');
  }

  return (
    <>
      <h2>AI tools</h2>
      <p>Approved tools are usable without a warning. Blocked tools show a banner
         and offer the employee a one-click access request.</p>
      <table>
        <thead><tr><th>Tool</th><th>Host</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {tools.map((t) => (
            <tr key={t.llm_id}>
              <td>{t.display_name}</td>
              <td><code>{t.host}</code></td>
              <td><span class={`pill ${t.status}`}>{t.status}</span></td>
              <td>
                <button disabled={busy === t.llm_id} onClick={() => toggle(t)}>
                  {t.status === 'approved' ? 'Block' : 'Approve'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
