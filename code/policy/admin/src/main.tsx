import { render } from 'preact';
import { useState } from 'preact/hooks';
import { Login } from './screens/Login';
import './style.css';

type Screen = 'tools' | 'requests' | 'usage' | 'tokens';

function App() {
  const [org, setOrg] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('tools');

  if (!org) return <Login onDone={setOrg} />;

  return (
    <div class="shell">
      <nav>
        <strong>{org}</strong>
        {(['tools', 'requests', 'usage', 'tokens'] as Screen[]).map((s) => (
          <button class={screen === s ? 'active' : ''} onClick={() => setScreen(s)}>{s}</button>
        ))}
      </nav>
      <main>
        {/* Screens land in Tasks 11-13. */}
        {screen === 'tools' && <p>Tools</p>}
        {screen === 'requests' && <p>Requests</p>}
        {screen === 'usage' && <p>Usage</p>}
        {screen === 'tokens' && <p>Tokens</p>}
      </main>
    </div>
  );
}

render(<App />, document.getElementById('root')!);
