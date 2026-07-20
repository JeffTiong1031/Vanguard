import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getApiBase, setApiBase } from '../../src/files/config';
import { getPolicyBase, setPolicyBase } from '../../src/policy/config';
import type { PolicyRequest, PolicyResponse } from '../../src/policy/messages';
import { clearEnrolment } from '../../src/policy/store';
import type { Enrolment, Policy } from '../../src/policy/types';

function ask(msg: PolicyRequest): Promise<PolicyResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<PolicyResponse>;
}

function Organisation() {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [token, setToken] = useState('');
  const [base, setBase] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void getPolicyBase().then(setBase);
    void ask({ kind: 'policy-get' }).then((r) => {
      if (r.ok) { setEnrolment(r.enrolment); setPolicy(r.policy); }
    });
  }, []);

  async function join() {
    setError('');
    await setPolicyBase(base);
    const r = await ask({ kind: 'policy-enrol', token: token.trim() });
    if (!r.ok) { setError(r.error); return; }
    setEnrolment(r.enrolment);
    setPolicy(r.policy);
    setToken('');
  }

  async function leave() {
    await clearEnrolment();
    setEnrolment(null);
    setPolicy(null);
  }

  if (enrolment) {
    const approved = policy?.tools.filter((t) => t.status === 'approved').length ?? 0;
    return (
      <section>
        <h2 style="font-size:16px">Organisation</h2>
        <p style="color:#15803d">
          Connected to <strong>{enrolment.org_name}</strong> · {enrolment.department} ·{' '}
          {approved} approved tools · policy v{policy?.version ?? '?'}
        </p>
        <button onClick={leave} style="padding:6px 12px;border:1px solid #cbd5e1;
                border-radius:6px;background:#fff;cursor:pointer">Disconnect</button>
      </section>
    );
  }

  return (
    <section>
      <h2 style="font-size:16px">Organisation</h2>
      <p style="color:#475569">
        Paste the enrolment token your admin gave you. It identifies your department,
        not you — Vanguard never stores your name or email address.
      </p>
      <input
        value={base}
        onInput={(e) => setBase((e.target as HTMLInputElement).value)}
        placeholder="Policy service address"
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:8px"
      />
      <input
        value={token}
        onInput={(e) => setToken((e.target as HTMLInputElement).value)}
        placeholder="ENG-xxxxxxxxxxxx"
        style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px"
      />
      <button onClick={join} style="margin-top:12px;padding:8px 14px;border:none;
              border-radius:6px;background:#e11d48;color:#fff;cursor:pointer">Connect</button>
      {error && <p style="color:#b91c1c">{error}</p>}
    </section>
  );
}

function FileService() {
  const [base, setBase] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { void getApiBase().then(setBase); }, []);
  return (
    <section style="margin-top:32px">
      <h2 style="font-size:16px">File checking</h2>
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
        style="margin-top:12px;padding:8px 14px;border:none;border-radius:6px;
               background:#e11d48;color:#fff;cursor:pointer"
      >Save</button>
      {saved && <span style="margin-left:10px;color:#15803d">Saved</span>}
    </section>
  );
}

function Options() {
  return (
    <div style="font:14px/1.5 system-ui, sans-serif; max-width:560px">
      <h1 style="font-size:18px">Vanguard</h1>
      <Organisation />
      <FileService />
    </div>
  );
}

render(<Options />, document.getElementById('root')!);
