import { useState } from 'preact/hooks';
import { api, UnauthorisedError, NetworkError } from '../api';
import { LayersIcon } from '../icons';

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
    } catch (err) {
      if (err instanceof UnauthorisedError) {
        setError('Organisation or password not recognised.');
      } else if (err instanceof NetworkError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(`Service error: ${err.message}`);
      } else {
        setError('An unexpected error occurred.');
      }
    }
  }

  return (
    <div class="login-wrap">
      <form class="login-card" onSubmit={submit}>
        <div class="brand">
          <span class="brand-mark"><LayersIcon /></span>
          <div>
            <div class="brand-name">Vanguard</div>
            <div class="brand-sub">AI Governance</div>
          </div>
        </div>
        <h1 class="login-title">Admin sign in</h1>
        <p class="login-caption">Manage AI-tool policy, approvals, and usage.</p>
        <label>Organisation<input value={orgName}
          onInput={(e) => setOrgName((e.target as HTMLInputElement).value)} /></label>
        <label>Admin password<input type="password" value={password}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)} /></label>
        <button type="submit">Sign in</button>
        {error && <p class="error">{error}</p>}
      </form>
    </div>
  );
}
