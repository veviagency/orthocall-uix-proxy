// src/pages/TodayPage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

export function TodayPage() {
  const [data, setData] = useState<any>(null);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);
  const totals = data?.totals || {};

  async function load() {
    const r = await opsFetch("/metrics/today", { method: "GET" });
    setData(r);
  }

  useEffect(() => {
    // Today poll: 15–30s (plan)
    const stop = startPoll(load, 20000);
    return stop;
  }, []);

  const cards = [
    ["jobs_total", totals.jobs_total ?? 0],
    ["calls_final_total", totals.calls_final_total ?? 0],
    ["calls_connected", totals.calls_connected ?? 0],
    ["calls_60s", totals.calls_60s ?? 0],
    ["emails_total", totals.emails_total ?? 0],
    ["dnc_marked", totals.dnc_marked ?? 0],
    ["booking_ready", totals.booking_ready ?? 0],
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, fontWeight: 600 }}>
        {utcLabel(tzOffset)}
      </div>

      <h2>Today</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {cards.map(([k, v]) => (
          <div key={String(k)} style={{ border: "1px solid #444", padding: 12 }}>
            <div style={{ opacity: 0.8 }}>{k}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{String(v)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, opacity: 0.7 }}>
        updated_at_ms: {String(data?.updated_at_ms ?? "")}
      </div>
    </div>
  );
}
