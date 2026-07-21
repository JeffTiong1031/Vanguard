import { useEffect, useRef, useState } from 'preact/hooks';
import { api, UnauthorisedError, type RequestRow } from '../api';
import { InboxIcon } from '../icons';

export function Requests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  // Monotonic counter to discard stale poll responses. When the admin clicks Approve,
  // decide() calls load(), which resolves; but the poll's response may still be in flight
  // and arrive after. A later load increments seq, so if the poll response lands after
  // a newer load has started, it is discarded. Prevents a flickering revert of an
  // approved row back to pending.
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    try {
      const data = await api.get<RequestRow[]>('/v1/admin/requests');
      if (mine !== seq.current) return;   // a newer load started; this response is stale
      setRows(data);
      setError('');
    } catch (err) {
      // Let the shell handle session expiry (see main.tsx's unhandledrejection
      // listener) -- swallowing it here would break the 401 bounce.
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not load requests.');
    }
  }

  useEffect(() => {
    void load();
    // Poll so a request raised on the employee laptop appears without a manual
    // refresh. 3s (estimate) -- fast enough to feel live on stage.
    const timer = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(timer);
  }, []);

  async function decide(id: string, decision: 'approved' | 'denied') {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/v1/admin/requests/${id}`, { decision });
      await load();
    } catch (err) {
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not update the request.');
    } finally {
      // Always clear busy, whatever happened above, so a 5xx or a dropped
      // connection doesn't leave the buttons permanently disabled.
      setBusyId('');
    }
  }

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <section class="panel">
      <div class="panel-head">
        <span class="ico"><InboxIcon /></span>
        <div>
          <h2>Access Requests</h2>
          <p class="sub">Employees request a blocked tool; approve to update policy — their next poll picks it up.</p>
        </div>
        <span class="tag count">{pending.length} pending</span>
      </div>
      {error && <p class="error">{error}</p>}
      {rows.length === 0 && <p class="empty">No requests yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Department</th><th>Tool</th><th>Reason</th><th>Raised</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><span class="name">{r.department}</span></td>
                <td>{r.display_name}</td>
                <td>{r.reason}</td>
                <td><code>{new Date(r.created_at).toLocaleTimeString()}</code></td>
                <td>
                  {r.status === 'pending' ? (
                    <div class="row-actions">
                      <button class="btn-primary btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'approved')}>
                        Approve
                      </button>
                      <button class="btn-danger btn-sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'denied')}>
                        Deny
                      </button>
                    </div>
                  ) : (
                    <span class={`pill ${r.status}`}>{r.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
