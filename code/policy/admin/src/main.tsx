import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, UnauthorisedError } from './api';
import { Login } from './screens/Login';
import { Tools } from './screens/Tools';
import { Tokens } from './screens/Tokens';
import './style.css';

type Screen = 'tools' | 'requests' | 'usage' | 'tokens';

// The org NAME only -- never a token or credential. It is not a secret; it is
// display text ("Acme Corp" in the nav bar) and a hint to re-check the cookie
// on the next mount. The HttpOnly session cookie remains the sole authority;
// this value is never sent anywhere and never trusted on its own (see the
// verification call below).
const ORG_KEY = 'vg_admin_org';

function App() {
  const [org, setOrg] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('tools');
  // Only block on a "checking" screen if there's a cached org name to verify.
  // A fresh visitor with no cached session goes straight to Login -- no flash.
  const [checking, setChecking] = useState(() => !!localStorage.getItem(ORG_KEY));

  // (b) Page refresh must not lose a valid session. There is no /v1/admin/me
  // and app/ is frozen, so the cookie is verified with a real authenticated
  // call -- GET /v1/admin/tools is the cheapest one that exists. If it 401s,
  // the cached name is stale (session actually expired) and is dropped. If it
  // fails for some other reason (e.g. the backend isn't up yet), the cached
  // name is left alone -- that's not evidence the session is invalid, just
  // that this check couldn't complete -- and the user sees Login until a
  // retry (reload) succeeds.
  useEffect(() => {
    const cached = localStorage.getItem(ORG_KEY);
    if (!cached) return;
    api.get('/v1/admin/tools')
      .then(() => { setOrg(cached); setChecking(false); })
      .catch((err) => {
        if (err instanceof UnauthorisedError) localStorage.removeItem(ORG_KEY);
        setChecking(false);
      });
  }, []);

  // (a) A 401 anywhere must bounce back to Login, without every screen having
  // to catch it individually. Tools/Tokens/etc. call the API directly and
  // don't catch UnauthorisedError themselves (per their brief); when that
  // promise rejects uncaught, it surfaces here as a window `unhandledrejection`
  // -- one place clears auth state for the whole shell.
  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      if (event.reason instanceof UnauthorisedError) {
        event.preventDefault();
        localStorage.removeItem(ORG_KEY);
        setOrg(null);
      }
    }
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  function handleLogin(orgName: string) {
    localStorage.setItem(ORG_KEY, orgName);
    setOrg(orgName);
  }

  if (checking) return <p>Checking session…</p>;
  if (!org) return <Login onDone={handleLogin} />;

  return (
    <div class="shell">
      <nav>
        <strong>{org}</strong>
        {(['tools', 'requests', 'usage', 'tokens'] as Screen[]).map((s) => (
          <button class={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>{s}</button>
        ))}
      </nav>
      <main>
        {/* Requests and Usage land in Tasks 12-13. */}
        {screen === 'tools' && <Tools />}
        {screen === 'requests' && <p>Requests</p>}
        {screen === 'usage' && <p>Usage</p>}
        {screen === 'tokens' && <Tokens />}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
