// src/pages/RangePage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { useRole } from "../lib/useRole";

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
  const { role } = useRole();

  // OrthoCall UIX: Results sheet quick links (Range page)
  // Türkçe: Clinic viewer görmez. Operator/Admin/System admin görür.
  const canSeeResultsLinks =
    role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  const DAILY_RESULTS_URL = String(import.meta.env.VITE_UIX_DAILY_RESULTS_URL || "").trim();
  const WEEKLY_RESULTS_URL = String(import.meta.env.VITE_UIX_WEEKLY_RESULTS_URL || "").trim();

  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(yyyyMmDd(new Date(today.getTime() - 6 * 86400000)));
  const [to, setTo] = useState(yyyyMmDd(today));
  const [data, setData] = useState<any>(null);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);

  async function load() {
    const r = await opsFetch(
      `/metrics/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { method: "GET" }
    );
    setData(r);
  }

  useEffect(() => {
    // Default last 7 days load
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = data?.totals || {};
  const days = Array.isArray(data?.days) ? data.days : [];

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
      <div style={{ marginBottom: 12, fontWeight: 600 }}>{utcLabel(tzOffset)}</div>

      <h2>Range</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label>from:</label>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label>to:</label>
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      {canSeeResultsLinks && (DAILY_RESULTS_URL || WEEKLY_RESULTS_URL) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: -4, marginBottom: 12 }}>
          {DAILY_RESULTS_URL && (
            <a
              href={DAILY_RESULTS_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.92)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Daily Results
            </a>
          )}

          {WEEKLY_RESULTS_URL && (
            <a
              href={WEEKLY_RESULTS_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.92)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Weekly Results
            </a>
          )}
        </div>
      )}

      <div className="hRow" style={{ marginTop: 8 }}>
        <h3 style={{ margin: 0 }}>Totals</h3>
        <div className="smallMuted">days: {String(days.length)}</div>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
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

      {role === "system_admin" && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON (days)</summary>
          <pre className="monoBox" style={{ marginTop: 8 }}>
            {JSON.stringify(days, null, 2)}
          </pre>
        </details>
      )}

      {role === "system_admin" && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON (full response)</summary>
          <pre className="monoBox" style={{ marginTop: 8 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
