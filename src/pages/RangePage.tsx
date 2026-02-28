// src/pages/RangePage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function RangePage() {
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(yyyyMmDd(new Date(today.getTime() - 6 * 86400000)));
  const [to, setTo] = useState(yyyyMmDd(today));
  const [data, setData] = useState<any>(null);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);

  async function load() {
    const r = await opsFetch(`/metrics/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: "GET" });
    setData(r);
  }

  useEffect(() => {
    // Default last 7 days load
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, fontWeight: 600 }}>
        {utcLabel(tzOffset)}
      </div>

      <h2>Range</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <label>from:</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>to:</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button onClick={load}>Refresh</button>
      </div>

      <h3>Totals</h3>
      <pre style={{ background: "#111", color: "#eee", padding: 12, overflow: "auto" }}>
        {JSON.stringify(data?.totals || {}, null, 2)}
      </pre>

      <h3>Days (chart input)</h3>
      <pre style={{ background: "#111", color: "#eee", padding: 12, overflow: "auto" }}>
        {JSON.stringify(data?.days || [], null, 2)}
      </pre>
    </div>
  );
}
