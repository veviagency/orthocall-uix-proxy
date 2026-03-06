// src/pages/TodayPage.tsx - V12
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";
import { useRole } from "../lib/useRole";

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
  const d = new Date(n + off * 3600000);

  // Türkçe: Offset uygulanmış zamanı UTC üzerinden okunabilir formatta yaz.
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.toLocaleString("en-US", { day: "numeric", timeZone: "UTC" });
  const year = d.toLocaleString("en-US", { year: "numeric", timeZone: "UTC" });

  const HH = String(d.getUTCHours()).padStart(2, "0");
  const MM = String(d.getUTCMinutes()).padStart(2, "0");
  const SS = String(d.getUTCSeconds()).padStart(2, "0");

  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const tzLabel = `UTC${sign}${abs}`;

  return `${month} ${day}, ${year} - ${HH}:${MM}:${SS} (${tzLabel})`;
}

const METRICS = [
  {
    key: "jobs_total",
    title: "Total Jobs",
    help: "Total call jobs created today.",
  },
  {
    key: "calls_final_total",
    title: "Finalized Calls",
    help: "Calls that the system completed and finalized successfully today.",
  },
  {
    key: "calls_connected",
    title: "Connected Calls",
    help: "Calls where the lead answered and the call connected today.",
  },
  {
    key: "calls_60s",
    title: "Calls (60s+)",
    help: "Connected calls with duration ≥ 60 seconds today.",
  },
  {
    key: "emails_total",
    title: "Emails Sent",
    help: "Total emails sent by the system today.",
  },
  {
    key: "dnc_marked",
    title: "DNC Marked",
    help: "Leads marked as Do Not Call today.",
  },
  {
    key: "booking_ready",
    title: "Booking Ready",
    help: "Calls that reached a booking-ready outcome today.",
  },
  {
    // Türkçe: Gerçek booked metriği; sadece booking confirm/write success sonrası artar.
    key: "booked_confirmed",
    title: "Booked",
    help: "Calls that successfully produced a confirmed booking today.",
  },
] as const;

export function TodayPage() {
  const { role } = useRole();
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

      {role === "system_admin" && (
        <details style={{ marginTop: 12 }}>
          <summary>Raw JSON</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
