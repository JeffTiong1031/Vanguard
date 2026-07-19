import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getApiBase, setApiBase } from '../../src/files/config';

function Options() {
  const [base, setBase] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { void getApiBase().then(setBase); }, []);
  return (
    <div>
      <h1 style="font-size:18px">Vanguard — file checking</h1>
      <p style="color:#475569">
        Address of the file-checking service. Use <code>http://localhost:8000</code> if you are
        running it yourself, or the shared address your team was given.
      </p>
      <input
        value={base}
        onInput={(e) => { setBase((e.target as HTMLInputElement).value); setSaved(false); }}
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <button
        onClick={async () => { await setApiBase(base); setSaved(true); }}
        style="margin-top:12px;padding:8px 14px;border:none;border-radius:6px;background:#e11d48;color:#fff;cursor:pointer"
      >Save</button>
      {saved && <span style="margin-left:10px;color:#15803d">Saved</span>}
    </div>
  );
}

render(<Options />, document.getElementById('root')!);
