// src/pages/NextJobsPage.tsx
// V17
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";
import { useRole } from "../lib/useRole";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

export function NextJobsPage() {
  const { role } = useRole();
  const [data, setData] = useState<any>(null);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];

  const canUseLiveListen = role === "clinic_admin" || role === "system_admin";
  const liveListenEnabled = !!data?.live_listen_enabled;
  const liveListenCapable = !!data?.listen_capable;
  const activeCall = data?.active_call || null;

  const activeLeadLabel = (() => {
    const first = String(activeCall?.lead_hint?.first_name || "").trim();
    const lastI = String(activeCall?.lead_hint?.last_initial || "").trim();
    const last4 = String(activeCall?.lead_hint?.phone_last4 || "").trim();
    if (!first) return "Live call";
    return `${first}${lastI ? ` ${lastI}.` : ""}${last4 ? ` • …${last4}` : ""}`;
  })();

  const activeStarted = fmtCentralTime(activeCall?.started_at_ms, tzOffset) || "—";

  async function openLiveListenSession() {
    try {
      const r = await opsFetch("/live-listen/session", { method: "POST", body: {} });
      alert(String(r?.message || "Live listen session is not available yet."));
    } catch (e: any) {
      const msg =
        e?.payload?.message ||
        e?.payload?.error ||
        e?.message ||
        String(e);
      alert(String(msg));
    }
  }

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

      {canUseLiveListen && liveListenEnabled ? (
        <div
          style={{
            marginBottom: 16,
            border: `1px solid ${activeCall ? "rgba(120,160,255,0.35)" : "rgba(255,255,255,0.10)"}`,
            borderRadius: 12,
            padding: 12,
            background: activeCall ? "rgba(120,160,255,0.07)" : "rgba(0,0,0,0.18)",
            opacity: activeCall ? 1 : 0.72,
          }}
        >
          <div className="hRow" style={{ marginBottom: 8, alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                Listen Live Your AI Calling Front Desk
              </div>
              <div className="smallMuted" style={{ marginTop: 6 }}>
                {activeCall
                  ? "A live call is in progress. This session is listen-only."
                  : "Nearest next call →"}
              </div>
            </div>

            <button
              className="btn"
              onClick={openLiveListenSession}
              disabled={!liveListenCapable}
              title={!activeCall ? "You can only listen while a live call is in progress." : ""}
            >
              Listen Live
            </button>
          </div>

          {activeCall ? (
            <div className="grid2" style={{ marginTop: 10 }}>
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <div className="kpiKey">Live Call</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>
                  {activeLeadLabel}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <div className="kpiKey">Call Type</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>
                  {String(activeCall?.call_type || "—")}
                </div>
              </div>

              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 12,
                  padding: 12,
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <div className="kpiKey">Started</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6 }}>
                  {activeStarted}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
          {jobs.map((j: any, i: number) => {
            const first = String(j?.lead_hint?.first_name || "").trim();
            const lastI = String(j?.lead_hint?.last_initial || "").trim();
            const last4 = String(j?.lead_hint?.phone_last4 || "").trim();

            // OrthoCall UIX: lead_hint yoksa (viewer), ekranda "—" yerine generic başlık kullanacağız
            const leadLabel = first
              ? `${first}${lastI ? ` ${lastI}.` : ""}${last4 ? ` • …${last4}` : ""}`
              : "";

            const callType = String(j?.call_type || "").trim();
            const when = String(j?.next_action_at_label || "").trim();
            const jobId = String(j?.job_id || "").trim();

            // OrthoCall UIX: job_id yoksa stabil key üret (Math.random() kullanma)
            const itemKey = jobId || `${callType || "job"}-${String(j?.next_action_at_ms || "")}-${i}`;

            return (
              <div
                key={itemKey}
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
                  <div style={{ fontWeight: 700 }}>{leadLabel || "Next job"}</div>
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

      {role === "system_admin" && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON</summary>
          <pre className="monoBox" style={{ marginTop: 8 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
