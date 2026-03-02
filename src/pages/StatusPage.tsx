// src/pages/StatusPage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch } from "../lib/opsClient";
import { startPoll } from "../lib/polling";
import { useRole } from "../lib/useRole";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

// OrthoCall UIX: Status ekranında merkezi saatle okunabilir timestamp
function fmtCentralTime(ms: any, offsetHours: number) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  const off = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = off >= 0 ? "+" : "";
  const d = new Date(n + off * 3600000);
  // ISO -> "YYYY-MM-DD HH:MM:SS"
  const iso = d.toISOString().replace("T", " ").replace("Z", "");
  return `${iso.slice(0, 19)} (UTC${sign}${off})`;
}

export function StatusPage() {
  const { role } = useRole();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  // OrthoCall UIX: Recent Activity (signal feed)
  const [activity, setActivity] = useState<any[]>([]);
  const [activityMeta, setActivityMeta] = useState<any>(null);
  const [activityErr, setActivityErr] = useState<string>("");
  const [activityPaused, setActivityPaused] = useState(false);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);

  async function load() {
    setErr("");
    const r = await opsFetch("/status", { method: "GET" });
    setData(r);
  }

  async function loadActivity() {
    if (activityPaused) return;
    setActivityErr("");
    try {
      const r = await opsFetch("/activity?limit=100", { method: "GET" });
      setActivityMeta(r);
      setActivity(Array.isArray(r?.items) ? r.items : []);
    } catch (e: any) {
      setActivityErr(e && e.message ? String(e.message) : String(e));
    }
  }

  useEffect(() => {
    // Status poll: 10–15s (plan)
    const stop = startPoll(load, 12000);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Activity poll: daha hızlı ama hafif (signal-only)
    const stop = startPoll(loadActivity, 4000);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityPaused]);

  const canControl =
    role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  return (
    <div style={{ padding: 16 }}>
      <div className="hRow" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>{utcLabel(tzOffset)}</div>
        <div className="smallMuted">
          Updated: {fmtCentralTime(Date.parse(String(data?.ts || "")), tzOffset) || "—"}
        </div>
      </div>

      {data?.kill_switch?.enabled ? (
        <div className="bannerDanger">
          <b>Kill-switch is ON</b>
          <div>{String(data?.kill_switch?.reason || "")}</div>
        </div>
      ) : null}

      {err ? <div style={{ color: "crimson" }}>{err}</div> : null}

      <h2>Status</h2>

      {(() => {
        const pause = data?.pause || {};
        const ks = data?.kill_switch || {};
        const next = data?.next_job || null;

        const pauseStateRaw = String(pause?.paused_state || "").toUpperCase();
        const pausedState = pauseStateRaw === "PAUSED" ? "PAUSED" : "RUNNING";
        const pausedMode = pausedState === "PAUSED" ? String(pause?.paused_mode || "") : "";
        const pausedReason = String(pause?.changed_reason || pause?.reason || "");
        const pausedChanged = fmtCentralTime(pause?.changed_at_ms, tzOffset);

        const ksState = ks?.enabled ? "ON" : "OFF";
        const ksReason = String(ks?.reason || "");

        const nextJobId = String(next?.job_id || "");
        const nextCallType = String(next?.call_type || "");
        const nextWhen = String(next?.next_action_at_label || next?.due_at_label || "");

        return (
          <div className="grid2" style={{ marginTop: 12 }}>
            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="kpiKey">Overall Status</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
                {String(data?.status || "—")}
              </div>
              <div className="smallMuted" style={{ marginTop: 6 }}>
                phase: {String(data?.phase || "—")}
              </div>
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="kpiKey">Pause</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>
                {pausedState}
                {pausedMode ? ` • ${pausedMode}` : ""}
              </div>
              {pausedReason ? (
                <div style={{ marginTop: 6 }}>reason: {pausedReason}</div>
              ) : (
                <div className="smallMuted" style={{ marginTop: 6 }}>
                  reason: —
                </div>
              )}
              {pausedChanged ? (
                <div className="smallMuted" style={{ marginTop: 6 }}>
                  changed: {pausedChanged}
                </div>
              ) : (
                <div className="smallMuted" style={{ marginTop: 6 }}>
                  changed: —
                </div>
              )}
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="kpiKey">Kill-switch</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{ksState}</div>
              {ksReason ? (
                <div style={{ marginTop: 6 }}>reason: {ksReason}</div>
              ) : (
                <div className="smallMuted" style={{ marginTop: 6 }}>
                  reason: —
                </div>
              )}
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                padding: 12,
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <div className="kpiKey">Next Job</div>
              {next ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6 }}>
                    {nextCallType || "job"} {nextWhen ? `• ${nextWhen}` : ""}
                  </div>
                  <div className="smallMuted" style={{ marginTop: 6 }}>
                    job_id: {nextJobId || "—"}
                  </div>
                </>
              ) : (
                <div className="smallMuted" style={{ marginTop: 6 }}>
                  No next job
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div style={{ marginTop: 16 }}>
        <div className="hRow" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Recent Activity (last 100)</h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label className="smallMuted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={activityPaused}
                onChange={(e) => setActivityPaused(e.target.checked)}
              />
              Pause updates
            </label>
            <button className="btn" onClick={() => { setActivity([]); setActivityMeta(null); }}>
              Clear
            </button>
          </div>
        </div>

        {activityErr ? <div style={{ color: "crimson" }}>{activityErr}</div> : null}

        <pre className="monoBox" style={{ marginTop: 8, maxHeight: 320, overflow: "auto" }}>
          {(activity && activity.length)
            ? activity
                .map((it: any) => {
                  const ts = fmtCentralTime(it?.ts_ms, tzOffset) || "";
                  const msg = String(it?.msg || "");
                  return ts ? `${ts} • ${msg}` : msg;
                })
                .join("\n")
            : "No activity yet."}
        </pre>

        <div className="smallMuted" style={{ marginTop: 6 }}>
          Updated: {fmtCentralTime(activityMeta?.last_activity_ms, tzOffset) || "—"} • items:{" "}
          {String(activity?.length || 0)}
        </div>
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON</summary>
        <pre className="monoBox" style={{ marginTop: 8 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>

      {canControl ? <PauseResumePanel onDone={load} /> : null}
    </div>
  );
}

function PauseResumePanel({ onDone }: { onDone: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function doPause() {
    if (!reason.trim()) {
      alert("Reason is required.");
      return;
    }
    const ok = confirm("Are you sure you want to PAUSE? (Double confirm)");
    if (!ok) return;

    setBusy(true);
    try {
      await opsFetch("/pause", { method: "POST", body: { reason: reason.trim(), mode: "MANUAL" } });
      alert("Paused.");
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  async function doResume() {
    if (!reason.trim()) {
      alert("Reason is required.");
      return;
    }
    const ok = confirm("Are you sure you want to RESUME? (Double confirm)");
    if (!ok) return;

    setBusy(true);
    try {
      await opsFetch("/resume", { method: "POST", body: { reason: reason.trim() } });
      alert("Resumed.");
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16, padding: 12, border: "1px solid #444" }}>
      <h3>Control Surface (Pause/Resume)</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="btn btnDanger" onClick={doPause} disabled={busy}>
          Pause
        </button>
        <button className="btn" onClick={doResume} disabled={busy}>
          Resume
        </button>
      </div>
    </div>
  );
}
