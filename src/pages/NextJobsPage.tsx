// src/pages/NextJobsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

export function NextJobsPage() {
  const [data, setData] = useState<any>(null);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  async function load() {
    const r = await opsFetch("/next-jobs?limit=3", { method: "GET" });
    setData(r);
  }

  useEffect(() => {
    // Next Jobs: 15–30s poll veya refresh (plan)
    const stop = startPoll(load, 20000);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div className="hRow" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Next Jobs</h2>
          <div className="smallMuted" style={{ marginTop: 4 }}>
            {utcLabel(tzOffset)}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="badge">limit: 3</div>
          <button className="btn" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div>
          <div className="smallMuted">No jobs right now.</div>
          <div className="smallMuted" style={{ marginTop: 8 }}>
            Possible reasons: paused • kill-switch ON • no due jobs • queue empty.
          </div>
          <div className="smallMuted" style={{ marginTop: 6 }}>
            Tip: Check the Status tab for Pause/Kill-switch.
          </div>
        </div>
      ) : (
        <div className="grid2">
          {jobs.map((j: any) => {
            const first = String(j?.lead_hint?.first_name || "").trim();
            const lastI = String(j?.lead_hint?.last_initial || "").trim();
            const last4 = String(j?.lead_hint?.phone_last4 || "").trim();
            const callType = String(j?.call_type || "").trim();
            const when = String(j?.next_action_at_label || "").trim();
            const jobId = String(j?.job_id || "").trim();

            return (
              <div
                key={jobId || String(Math.random())}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {first || "—"} {lastI ? `${lastI}.` : ""}
                    {last4 ? ` • …${last4}` : ""}
                  </div>
                  {callType ? <div className="badge">{callType}</div> : null}
                </div>

                <div className="smallMuted" style={{ marginTop: 8 }}>
                  next_action_at: {when || "—"}
                </div>

                <div className="smallMuted" style={{ marginTop: 6 }}>
                  job_id: {jobId || "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON</summary>
        <pre className="monoBox" style={{ marginTop: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
