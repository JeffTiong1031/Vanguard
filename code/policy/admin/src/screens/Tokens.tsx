import { useEffect, useState } from 'preact/hooks';
import { api, UnauthorisedError, type TokenRow } from '../api';

export function Tokens() {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [department, setDepartment] = useState('Engineering');
  const [minted, setMinted] = useState('');
  // '' | 'mint' | the id of the row being revoked
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() { setRows(await api.get<TokenRow[]>('/v1/admin/tokens')); }
  useEffect(() => { void load(); }, []);

  async function mint() {
    setBusy('mint');
    setError('');
    try {
      const r = await api.post<{ token: string }>('/v1/admin/tokens', { department });
      setMinted(r.token);   // shown once; the server stores only its hash, so this
                             // is the only chance to see the plaintext at all
      await load();
    } catch (err) {
      // Let the shell handle session expiry -- swallowing it here would
      // break the unhandledrejection-driven 401 bounce in main.tsx.
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not mint a token.');
    } finally {
      // Always clear busy, whatever happened above -- a 5xx or a dropped
      // connection must not leave the button permanently disabled.
      setBusy('');
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError('');
    try {
      await api.post(`/v1/admin/tokens/${id}/revoke`);
      await load();
    } catch (err) {
      if (err instanceof UnauthorisedError) throw err;
      setError(err instanceof Error ? err.message : 'Could not revoke the token.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <h2>Enrolment tokens</h2>
      <p>One token per department. The department is encoded in the token, so an
         employee cannot choose their own.</p>
      <div>
        <input value={department}
               onInput={(e) => setDepartment((e.target as HTMLInputElement).value)} />
        <button disabled={busy === 'mint'} onClick={mint}>Mint token</button>
      </div>
      {error && <p class="error">{error}</p>}
      {minted && (
        <p class="card mint-result">
          <strong>Copy this token now — it will not be shown again.</strong><br />
          The server keeps only a hash of it, so if you navigate away before copying
          it, the plaintext is gone for good and you will need to mint a new one.
          <br /><code>{minted}</code>
        </p>
      )}
      <p class="hint">
        <strong>What &quot;Revoke&quot; does:</strong> it stops the token being used
        for <em>new</em> enrolments. It does <strong>not</strong> remove access for
        anyone who already enrolled with it — this system has no way to cut off an
        individual employee once they are in, so a revoked token's earlier
        enrollees keep polling policy indefinitely.
      </p>
      <table>
        <thead><tr><th>Department</th><th>Created</th><th>State</th><th></th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.department}</td>
              <td>{new Date(row.created_at).toLocaleString()}</td>
              <td><span class={`pill ${row.revoked ? 'revoked' : 'active'}`}>
                {row.revoked ? 'revoked' : 'active'}
              </span></td>
              <td>
                {!row.revoked && (
                  <button disabled={busy === row.id} onClick={() => revoke(row.id)}>Revoke</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
