// src/pages/TodayPage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

// OrthoCall UIX: ms -> Central Ops Time label (readable)
function fmtCentralTime(ms: any, offsetHours: number) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  const off = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = off >= 0 ? "+" : "";
  const d = new Date(n + off * 3600000);
  const iso = d.toISOString().replace("T", " ").replace("Z", "");
  return `${iso.slice(0, 19)} (UTC${sign}${off})`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = [
    ["jobs_total", totals.jobs_total ?? 0],
    ["calls_final_total", totals.calls_final_total ?? 0],
    ["calls_connected", totals.calls_connected ?? 0],
    ["calls_60s*", totals.calls_60s ?? 0],
    ["emails_total", totals.emails_total ?? 0],
    ["dnc_marked", totals.dnc_marked ?? 0],
    ["booking_ready", totals.booking_ready ?? 0],
  ];

  return (
    <div style={{ padding: 16 }}>
      <div className="hRow" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Today</h2>
          <div className="smallMuted" style={{ marginTop: 4 }}>
            {utcLabel(tzOffset)}
          </div>
        </div>

        <div className="smallMuted">
          Updated: {fmtCentralTime(data?.updated_at_ms, tzOffset) || "—"}
        </div>
      </div>

      <div className="grid2">
        {cards.map(([k, v]) => (
          <div
            key={String(k)}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 12,
              background: "rgba(0,0,0,0.18)",
            }}
          >
            <div className="kpiKey">{String(k)}</div>
            <div className="kpiVal">{String(v)}</div>
          </div>
        ))}
      </div>

      <div className="smallMuted" style={{ marginTop: 10 }}>
        * calls_60s = connected calls with duration_sec &gt;= 60. If duration is missing, this metric may be a lower bound.
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON</summary>
        <pre className="monoBox" style={{ marginTop: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
