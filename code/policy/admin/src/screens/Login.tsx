import { useState } from 'preact/hooks';
import { api } from '../api';

export function Login({ onDone }: { onDone: (org: string) => void }) {
  const [orgName, setOrgName] = useState('Acme Corp');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e: Event) {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post<{ org_name: string }>('/v1/admin/login', {
        org_name: orgName, password,
      });
      onDone(r.org_name);
    } catch {
      setError('Organisation or password not recognised.');
    }
  }

  return (
    <form class="card" onSubmit={submit}>
      <h1>Vanguard — AI Governance</h1>
      <label>Organisation<input value={orgName}
        onInput={(e) => setOrgName((e.target as HTMLInputElement).value)} /></label>
      <label>Admin password<input type="password" value={password}
        onInput={(e) => setPassword((e.target as HTMLInputElement).value)} /></label>
      <button type="submit">Sign in</button>
      {error && <p class="error">{error}</p>}
    </form>
  );
}
