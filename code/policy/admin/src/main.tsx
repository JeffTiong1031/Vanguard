import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, UnauthorisedError } from './api';
import { Login } from './screens/Login';
import { Tools } from './screens/Tools';
import { Requests } from './screens/Requests';
import { Usage } from './screens/Usage';
import { Tokens } from './screens/Tokens';
import { Reviews } from './screens/Reviews';
import { LayersIcon, ShieldIcon, InboxIcon, BarIcon, KeyIcon, GavelIcon } from './icons';
import './style.css';

type Screen = 'tools' | 'requests' | 'usage' | 'tokens' | 'reviews';

const TABS: [Screen, string, typeof ShieldIcon][] = [
  ['tools', 'Tools', ShieldIcon],
  ['requests', 'Requests', InboxIcon],
  ['reviews', 'Reviews', GavelIcon],
  ['usage', 'Usage', BarIcon],
  ['tokens', 'Tokens', KeyIcon],
];

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
  //
  // A REJECTED fetch falls through to Login correctly on its own, but a
  // HUNG one (server unreachable mid-request, network stall) would leave
  // this screen on "Checking session..." forever, with no retry available.
  // Race the verification against a timeout so a hang degrades the same way
  // a rejection does: back to Login, cached name left alone (the cookie may
  // still be valid -- logging in again is cheap; being stuck is not
  // recoverable without a reload).
  useEffect(() => {
    const cached = localStorage.getItem(ORG_KEY);
    if (!cached) return;
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('session check timed out')), 5000));
    Promise.race([api.get('/v1/admin/tools'), timeout])
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

  if (checking) return <div class="login-wrap"><p class="empty">Checking session…</p></div>;
  if (!org) return <Login onDone={handleLogin} />;

  return (
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark"><LayersIcon /></span>
          <div>
            <div class="brand-name">Vanguard</div>
            <div class="brand-sub">AI Governance</div>
          </div>
        </div>
        <div class="topbar-right">
          <span class="chip"><span class="dot" style="background:#4f46e5"></span> <strong>{org}</strong></span>
          <span class="chip live"><span class="dot"></span> Live</span>
        </div>
      </header>

      <nav class="tabs">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} class={screen === id ? 'active' : ''} onClick={() => setScreen(id)}>
            <Icon /> {label}
          </button>
        ))}
      </nav>

      <main>
        {screen === 'tools' && <Tools />}
        {screen === 'requests' && <Requests />}
        {screen === 'reviews' && <Reviews />}
        {screen === 'usage' && <Usage />}
        {screen === 'tokens' && <Tokens />}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
