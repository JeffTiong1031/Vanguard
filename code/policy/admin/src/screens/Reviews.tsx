import { useEffect, useRef, useState } from 'preact/hooks';
import { api, UnauthorisedError, type AppealRow } from '../api';
import { GavelIcon } from '../icons';

export function Reviews() {
  const [rows, setRows] = useState<AppealRow[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    try {
      const data = await api.get<AppealRow[]>('/v1/admin/appeals');
      if (mine !== seq.current) return;
      setRows(data); setError('');
    } catch (err) {
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not load reviews.');
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(t);
  }, []);

  async function decide(id: string, decision: 'upheld' | 'overturned') {
    setBusyId(id); setError('');
    try {
      await api.post(`/v1/admin/appeals/${id}`, { decision });
      await load();
    } catch (err) {
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not update the review.');
    } finally { setBusyId(''); }
  }

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <section class="panel">
      <div class="panel-head">
        <span class="ico"><GavelIcon /></span>
        <div>
          <h2>Reviews</h2>
          <p class="sub">Employees contesting an automated block or redaction. Uphold the decision or overturn it.</p>
        </div>
        <span class="tag count">{pending.length} pending</span>
      </div>
      {error && <p class="error">{error}</p>}
      {rows.length === 0 && <p class="empty">No review requests yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Type</th><th>Category</th><th>Dept</th><th>Employee's reason</th><th>Shared text</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><span class="name">{r.decision_type}</span></td>
                <td><code>{r.category}</code></td>
                <td>{r.department}</td>
                <td>{r.employee_reason}</td>
                <td>{r.disclosed_text
                  ? <code title="the employee chose to share this">{r.disclosed_text}</code>
                  : <span style="color:#94a3b8">not shared</span>}</td>
                <td>
                  {r.status === 'pending' ? (
                    <div class="row-actions">
                      <button class="btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'upheld')}>Uphold</button>
                      <button class="btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'overturned')}>Overturn</button>
                    </div>
                  ) : <span class={`pill ${r.status === 'overturned' ? 'approved' : 'blocked'}`}>{r.status}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
