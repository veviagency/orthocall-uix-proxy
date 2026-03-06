// src/pages/RangePage.tsx - V14
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

const METRICS = [
  {
    key: "jobs_total",
    title: "Total Jobs",
    help: "Total call jobs created in this range.",
  },
  {
    key: "calls_final_total",
    title: "Finalized Calls",
    help: "Calls that the system completed and finalized successfully.",
  },
  {
    key: "calls_connected",
    title: "Connected Calls",
    help: "Calls where the lead answered and the call connected.",
  },
  {
    key: "calls_60s",
    title: "Calls (60s+)",
    help: "Connected calls with duration ≥ 60 seconds.",
  },
  {
    key: "emails_total",
    title: "Emails Sent",
    help: "Total emails sent by the system in this range.",
  },
  {
    key: "dnc_marked",
    title: "DNC Marked",
    help: "Leads marked as Do Not Call.",
  },
  {
    key: "booking_ready",
    title: "Booking Ready",
    help: "Calls that reached a booking-ready outcome.",
  },
  {
    // Türkçe: Gerçek booked metriği; sadece booking confirm/write success sonrası artar.
    key: "booked_confirmed",
    title: "Booked",
    help: "Calls that successfully produced a confirmed booking in this range.",
  },
] as const;

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

      <div className="hRow" style={{ marginTop: 8 }}>
        <h3 style={{ margin: 0 }}>Totals</h3>
        <div className="smallMuted">days: {String(days.length)}</div>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        {METRICS.map((m) => {
          const v = (totals as any)?.[m.key] ?? 0;
          return (
            <div
              key={m.key}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="kpiKey">{m.title}</div>
              <div className="kpiVal">{String(v)}</div>
              <div className="smallMuted" style={{ marginTop: 6 }}>
                {m.help}
              </div>
            </div>
          );
        })}
      </div>

      {canSeeResultsLinks && (DAILY_RESULTS_URL || WEEKLY_RESULTS_URL) ? (
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {DAILY_RESULTS_URL ? (
            <a
              className="btn"
              href={DAILY_RESULTS_URL}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              Daily Results
            </a>
          ) : null}

          {WEEKLY_RESULTS_URL ? (
            <a
              className="btn"
              href={WEEKLY_RESULTS_URL}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              Weekly Results
            </a>
          ) : null}
        </div>
      ) : null}

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
