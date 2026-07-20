import { useEffect, useState } from 'preact/hooks';
import { api, UnauthorisedError, type Usage as UsageData } from '../api';

function Bars({ title, rows }: { title: string; rows: { label: string; events: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.events));
  return (
    <section>
      <h3>{title}</h3>
      {rows.length === 0 && <p>No events yet.</p>}
      {rows.map((r) => (
        <div key={r.label} style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <span style="width:220px;font-size:14px">{r.label}</span>
          <span style={`height:14px;border-radius:3px;background:#e11d48;width:${
            (r.events / max) * 320}px`} />
          <span style="font-size:13px;color:#475569">{r.events}</span>
        </div>
      ))}
    </section>
  );
}

export function Usage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const d = await api.get<UsageData>('/v1/admin/usage');
        setData(d);
        setError('');
      } catch (err) {
        // Let the shell handle session expiry -- swallowing it here would
        // break the unhandledrejection-driven 401 bounce in main.tsx.
        if (err instanceof UnauthorisedError) throw err;
        setError(err instanceof Error ? err.message : 'Could not load usage data.');
      }
    }
    void load();
    const timer = setInterval(() => { void load(); }, 3000); // (estimate)
    return () => clearInterval(timer);
  }, []);

  if (!data) return <p>{error || 'Loading…'}</p>;

  return (
    <>
      <h2>AI usage</h2>
      {error && <p class="error">{error}</p>}
      <p>Events carry a class, a count, and a salted hash — never prompt text.</p>
      <Bars title="By department"
            rows={data.by_department.map((r) => ({ label: r.department, events: r.events }))} />
      <Bars title="By tool"
            rows={data.by_tool.map((r) => ({ label: r.host, events: r.events }))} />
      <Bars title="By policy category"
            rows={data.by_category.map((r) => ({ label: r.category, events: r.events }))} />
    </>
  );
}
