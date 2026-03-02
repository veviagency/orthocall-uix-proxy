// src/pages/StatusPage.tsx
import { useEffect, useMemo, useState } from "react";
import { opsFetch, classifyOpsError, ConnectivityState } from "../lib/opsClient";
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

  // OrthoCall UIX: Connectivity state (OK / SERVER_DOWN / AUTH / PROXY_ERROR)
  const [conn, setConn] = useState<ConnectivityState>("OK");
  const [connDetail, setConnDetail] = useState<string>("");

  // OrthoCall UIX: last successful status poll (stale detection)
  const [lastOkAtMs, setLastOkAtMs] = useState<number>(0);
  const [lastErrAtMs, setLastErrAtMs] = useState<number>(0);

  // OrthoCall UIX: Recent Activity (signal feed)
  const [activity, setActivity] = useState<any[]>([]);
  const [activityMeta, setActivityMeta] = useState<any>(null);
  const [activityErr, setActivityErr] = useState<string>("");
  const [activityPaused, setActivityPaused] = useState(false);

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);

  async function load() {
    const now = Date.now();
    try {
      const r = await opsFetch("/status", { method: "GET" });
      setData(r);
      setErr("");
      setConn("OK");
      setConnDetail("");
      setLastOkAtMs(now);
    } catch (e: any) {
      const c = classifyOpsError(e);
      setConn(c.state);
      setConnDetail(c.detail);
      setErr(c.detail);
      setLastErrAtMs(now);
    }
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

  const nowMs = Date.now();
  const staleAgeMs = lastOkAtMs ? Math.max(0, nowMs - lastOkAtMs) : 0;
  const isStale = lastOkAtMs ? staleAgeMs > 120000 : false; // 2dk

  function fmtAge(ms: number) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n < 1000) return `${Math.floor(n)}ms`;
    const s = Math.floor(n / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return `${h}h`;
  }

  function pillStyle(active: boolean, bg: string) {
    return {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 9999,
      padding: "4px 10px",
      border: "1px solid rgba(255,255,255,0.14)",
      background: active ? bg : "transparent",
      opacity: active ? 1 : 0.35,
      fontWeight: active ? 800 : 600,
      fontSize: 12,
      lineHeight: 1.2,
      userSelect: "none" as const,
    };
  }

  function connBg(s: ConnectivityState) {
    if (s === "OK") return "rgba(46, 204, 113, 0.22)";
    if (s === "AUTH") return "rgba(241, 196, 15, 0.20)";
    if (s === "PROXY_ERROR") return "rgba(230, 126, 34, 0.20)";
    return "rgba(231, 76, 60, 0.20)"; // SERVER_DOWN
  }

  function overallBg(s: string) {
    if (s === "LIVE") return "rgba(46, 204, 113, 0.22)";
    if (s === "READY") return "rgba(52, 152, 219, 0.18)";
    if (s === "PAUSED") return "rgba(149, 165, 166, 0.18)";
    return "rgba(255,255,255,0.08)";
  }

  const overall = String(data?.status || "");
  const overallActive =
    overall === "PAUSED" || overall === "LIVE" || overall === "READY" ? overall : "";

  const updatedLabel = lastOkAtMs
    ? fmtCentralTime(lastOkAtMs, tzOffset)
    : fmtCentralTime(Date.parse(String(data?.ts || "")), tzOffset) || "—";

  // OrthoCall UIX: WHY NOT CALLING NOW? (tek bakışta sebep)
  const why = useMemo(() => {
    const d = data || {};
    const ks = d.kill_switch || {};
    const pause = d.pause || {};
    const next = d.next_job || null;
    const phase = String(d.phase || "");
    const status = String(d.status || "");

    const sched = d.call_schedule || {};
    const schedEnabled = !!sched.enabled;
    const withinHours = schedEnabled ? !!sched.within_active_hours : true;

    const lastAct = Number(d.last_activity_ms || 0);
    const lastActAge = lastAct ? Math.max(0, nowMs - lastAct) : 0;

    // 1) Connectivity
    if (conn !== "OK") {
      if (conn === "SERVER_DOWN") {
        return { primary: "UIX cannot reach Ops API (server down/unreachable).", details: [connDetail] };
      }
      if (conn === "AUTH") {
        return { primary: "Not authorized (login / membership / role).", details: [connDetail] };
      }
      return { primary: "Ops proxy/server error.", details: [connDetail] };
    }

    // 2) Stale
    if (isStale) {
      return {
        primary: "Data is stale (last successful update is too old).",
        details: [`stale_age=${fmtAge(staleAgeMs)}`],
      };
    }

    // 3) Active-hours blocker
    if (schedEnabled && !withinHours) {
      return {
        primary: "Calls paused: outside active hours.",
        details: [
          `interval_1=${String(sched.interval_1 || "") || "—"}`,
          `interval_2=${String(sched.interval_2 || "") || "—"}`,
        ],
      };
    }

    // 4) Kill-switch
    if (ks && ks.enabled) {
      return {
        primary: "Calls blocked: Kill-switch ON.",
        details: [String(ks.reason || "")].filter(Boolean),
      };
    }

    // 5) Manual/Auto pause
    const pauseStateRaw = String(pause.paused_state || "").toUpperCase();
    if (pauseStateRaw === "PAUSED") {
      const mode = String(pause.paused_mode || "");
      const reason = String(pause.changed_reason || pause.reason || "");
      const since = fmtCentralTime(pause.changed_at_ms, tzOffset);
      return {
        primary: `Paused${mode ? ` (${mode})` : ""}.`,
        details: [reason ? `reason=${reason}` : "", since ? `since=${since}` : ""].filter(Boolean),
      };
    }

    // 6) LIVE
    if (status === "LIVE") {
      return {
        primary: "Currently LIVE (in-call / active).",
        details: [
          phase ? `phase=${phase}` : "",
          lastAct ? `last_activity_age=${fmtAge(lastActAge)}` : "",
        ].filter(Boolean),
      };
    }

    // 7) Waiting for time
    if (phase === "waiting_for_time") {
      const when = String(next?.next_action_at_label || "");
      return { primary: `Waiting until ${when || "—"}.`, details: [] };
    }

    // 8) Queue empty
    if (!next) {
      return { primary: "No queued jobs (queue empty).", details: [] };
    }

    // 9) Runner idle/stuck (heuristic)
    const ACTIVITY_STALE_MS = 10 * 60 * 1000;
    if (lastAct && lastActAge > ACTIVITY_STALE_MS) {
      return {
        primary: "No recent activity (possible runner idle/stuck).",
        details: [`last_activity_age=${fmtAge(lastActAge)}`],
      };
    }

    return { primary: "READY (no blockers detected).", details: [] };
  }, [data, conn, connDetail, isStale, staleAgeMs, tzOffset, nowMs]); // (nowMs değişir; sorun değil)

  return (
    <div style={{ padding: 16 }}>
      <div className="hRow" style={{ marginBottom: 12, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Connectivity:</div>
            {(["OK", "SERVER_DOWN", "AUTH", "PROXY_ERROR"] as ConnectivityState[]).map((s) => (
              <span key={s} style={pillStyle(conn === s, connBg(s))}>
                {s}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Overall Status:</div>
            {(["PAUSED", "LIVE", "READY"] as const).map((s) => (
              <span key={s} style={pillStyle(overallActive === s, overallBg(s))}>
                {s}
              </span>
            ))}
            {!overallActive ? <span className="smallMuted">—</span> : null}
          </div>

          <div className="smallMuted" style={{ fontWeight: 600 }}>
            {utcLabel(tzOffset)}
          </div>
        </div>

        <div className="smallMuted" style={{ textAlign: "right" }}>
          <div>
            Updated: {updatedLabel || "—"}
            {lastOkAtMs ? (
              <span style={{ marginLeft: 8, opacity: 0.85 }}>
                ({isStale ? "STALE" : "fresh"} • age {fmtAge(staleAgeMs)})
              </span>
            ) : null}
          </div>
          {lastErrAtMs ? (
            <div style={{ marginTop: 4, opacity: 0.8 }}>
              last_error: {fmtCentralTime(lastErrAtMs, tzOffset) || "—"}
            </div>
          ) : null}
        </div>
      </div>

      {data?.kill_switch?.enabled ? (
        <div className="bannerDanger">
          <b>Kill-switch is ON</b>
          <div>{String(data?.kill_switch?.reason || "")}</div>
        </div>
      ) : null}

      {err ? <div style={{ color: "crimson", marginTop: 8 }}>{err}</div> : null}

      <div
        style={{
          marginTop: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(0,0,0,0.18)",
        }}
      >
        <div className="kpiKey">WHY NOT CALLING NOW?</div>
        <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{why.primary}</div>
        {why.details && why.details.length ? (
          <div className="smallMuted" style={{ marginTop: 8 }}>
            {why.details.map((x: string, i: number) => (
              <div key={`${x}_${i}`}>{x}</div>
            ))}
          </div>
        ) : null}
      </div>

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
