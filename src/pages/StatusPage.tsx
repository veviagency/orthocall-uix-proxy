// src/pages/StatusPage.tsx
// V25.2

import { useEffect, useMemo, useRef, useState } from "react";
import { opsFetch, classifyOpsError, type ConnectivityState } from "../lib/opsClient";
import { startPoll } from "../lib/polling";
import { useRole } from "../lib/useRole";
import { startLiveListenSession, stopLiveListenSession } from "../lib/liveListenPlayer";

function utcLabel(offsetHours: number) {
  const n = Number.isFinite(offsetHours) ? offsetHours : 0;
  const sign = n >= 0 ? "+" : "";
  return `Central Ops Time (UTC${sign}${n})`;
}

// OrthoCall UIX: Status ekranında merkezi saatle okunabilir timestamp
function fmtCentralTime(ms: any, offsetHours: number) {
  const n = Number(ms);
  // Türkçe: 0 / boş / invalid timestamp => 1969 göstermeyelim.
  if (!Number.isFinite(n) || n <= 0) return "";
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

function activityDotClass(it: any) {
  const level = String(it?.level || "").toLowerCase();
  const type = String(it?.type || "").toLowerCase();

  if (level === "error") return "activityDot activityDotError";
  if (level === "warn") return "activityDot activityDotWarn";

  if (
    type.includes("booking") ||
    type.includes("booked") ||
    type.includes("call_start") ||
    type.includes("call_initiated")
  ) {
    return "activityDot activityDotSuccess";
  }

  return "activityDot activityDotInfo";
}

export function StatusPage() {
  const { role, userId } = useRole();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  // OrthoCall UIX: Connectivity state (OK / SERVER_DOWN / AUTH / PROXY_ERROR)
  const [conn, setConn] = useState<ConnectivityState>("OK");
  const [connDetail, setConnDetail] = useState<string>("");

  // OrthoCall UIX: last successful status poll (stale detection)
  const [lastOkAtMs, setLastOkAtMs] = useState<number>(0);
  const [lastErrAtMs, setLastErrAtMs] = useState<number>(0);

  // OrthoCall UIX: live listen browser session state
  const [listenState, setListenState] = useState<"idle" | "connecting" | "live" | "ended" | "error">("idle");
  const [listenNote, setListenNote] = useState<string>("");

  // OrthoCall UIX: Recent Activity (signal feed)
  // Türkçe: UIX kapat-aç olsa bile satırlar dursun (Clear'a basana kadar).
  const ACT_CACHE_KEY = "uix_activity_cache_v1";

  const [activity, setActivity] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(ACT_CACHE_KEY);
      const p = raw ? JSON.parse(raw) : null;
      const items = p && Array.isArray(p.items) ? p.items : [];
      return items.slice(-100);
    } catch (_) {
      return [];
    }
  });

  const [activityMeta, setActivityMeta] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(ACT_CACHE_KEY);
      const p = raw ? JSON.parse(raw) : null;
      const last = p && Number.isFinite(Number(p.last_activity_ms)) ? Number(p.last_activity_ms) : 0;
      return last ? { last_activity_ms: last } : null;
    } catch (_) {
      return null;
    }
  });

  const [activityErr, setActivityErr] = useState<string>("");
  const [activityPaused, setActivityPaused] = useState(false);

  const activityRef = useRef<any[]>([]);
  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

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
      const cur = Array.isArray(activityRef.current) ? activityRef.current : [];
      const last = cur.length ? cur[cur.length - 1] : null;
      const since =
        last && Number.isFinite(Number((last as any).ts_ms)) ? Number((last as any).ts_ms) : 0;

      const url = `/activity?limit=100${since ? `&since_ms=${since}` : ""}`;
      const r = await opsFetch(url, { method: "GET" });

      setActivityMeta(r);

      const incoming = Array.isArray(r?.items) ? r.items : [];
      if (!incoming.length) return;

      setActivity((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        const seen = new Set(base.map((it: any) => `${it?.ts_ms || 0}|${String(it?.msg || "")}`));

        const merged = base.slice();
        for (const it of incoming) {
          const k = `${it?.ts_ms || 0}|${String(it?.msg || "")}`;
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(it);
        }

        const out = merged.slice(-100);

        try {
          localStorage.setItem(
            ACT_CACHE_KEY,
            JSON.stringify({
              items: out,
              last_activity_ms: Number.isFinite(Number(r?.last_activity_ms)) ? Number(r?.last_activity_ms) : 0,
            })
          );
        } catch (_) {}

        return out;
      });
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

  // OrthoCall UIX: Emergency Controls sadece system_admin
  // Türkçe: clinic_admin bile görmesin/kullanamasın.
  const canKillSwitch = role === "system_admin";

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

  const overallToneClass =
    overallActive === "LIVE"
      ? "statusBeacon statusBeaconLive"
      : overallActive === "READY"
      ? "statusBeacon statusBeaconReady"
      : overallActive === "PAUSED"
      ? "statusBeacon statusBeaconPaused"
      : "statusBeacon";

  const updatedLabel = lastOkAtMs
    ? fmtCentralTime(lastOkAtMs, tzOffset)
    : fmtCentralTime(Date.parse(String(data?.ts || "")), tzOffset) || "—";

  // OrthoCall UIX: Live listen visibility/capability
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
      if (listenState === "live" || listenState === "connecting") {
        await stopLiveListenSession();
        setListenState("idle");
        setListenNote("");
        return;
      }

      setListenState("connecting");
      setListenNote("Preparing secure audio relay...");

      const r = await opsFetch("/live-listen/session", { method: "POST", body: {} });
      const wsUrl = String(r?.ws_url || "").trim();

      if (!r?.ok || !r?.ready || !wsUrl) {
        throw new Error(String(r?.message || r?.error || "live_listen_not_ready"));
      }

      await startLiveListenSession(wsUrl, (s: any) => {
        const st = String(s?.status || "idle") as "idle" | "connecting" | "live" | "ended" | "error";
        setListenState(st);
        setListenNote(String(s?.note || ""));
      });
    } catch (e: any) {
      const msg =
        e?.payload?.message ||
        e?.payload?.error ||
        e?.message ||
        String(e);

      setListenState("error");
      setListenNote(String(msg));
      alert(String(msg));
    }
  }

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
  }, [data, conn, connDetail, isStale, staleAgeMs, tzOffset, nowMs]);

  return (
    <div className="pageStage pagePad">
      <div className="statusHero">
        <div className="pageHeader pageHeaderTight">
          <div>
            <div className="pageEyebrow">Live operations view</div>

            <div className="pageTitleRow">
              <h2 className="pageTitle">Status</h2>
              <span className={overallToneClass} aria-hidden="true" />
              {overallActive ? <span className="badge">{overallActive}</span> : null}
            </div>

            <div className="smallMuted pageSubtle">{utcLabel(tzOffset)}</div>
          </div>

          <div className="pageHeaderMeta">
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

        <div className="statusPillRows">
          <div className="statusPillRow">
            <div className="statusPillLabel">Connectivity</div>
            {(["OK", "SERVER_DOWN", "AUTH", "PROXY_ERROR"] as ConnectivityState[]).map((s) => (
              <span key={s} style={pillStyle(conn === s, connBg(s))}>
                {s}
              </span>
            ))}
          </div>

          <div className="statusPillRow">
            <div className="statusPillLabel">Overall Status</div>
            {(["PAUSED", "LIVE", "READY"] as const).map((s) => (
              <span key={s} style={pillStyle(overallActive === s, overallBg(s))}>
                {s}
              </span>
            ))}
            {!overallActive ? <span className="smallMuted">—</span> : null}
          </div>
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
        className="surfaceCard"
        style={{
          marginTop: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 14,
          background: "rgba(0,0,0,0.18)",
        }}
      >
        <div className="pageEyebrow" style={{ marginBottom: 4 }}>
          Why not calling now?
        </div>

        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
          {why.primary}
        </div>

        {why.details && why.details.length ? (
          <div className="smallMuted" style={{ marginTop: 10 }}>
            {why.details.map((x: string, i: number) => (
              <div key={`${x}_${i}`}>{x}</div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sectionTitle">Control & Diagnostics</div>
        style={{
          marginTop: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 14,
          background: "rgba(0,0,0,0.18)",
        }}
      >
        <div className="pageEyebrow" style={{ marginBottom: 4 }}>
          Why not calling now?
        </div>

        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>
          {why.primary}
        </div>

        {why.details && why.details.length ? (
          <div className="smallMuted" style={{ marginTop: 10 }}>
            {why.details.map((x: string, i: number) => (
              <div key={`${x}_${i}`}>{x}</div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="sectionTitle">Control & Diagnostics</div>

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

      {canUseLiveListen && liveListenEnabled ? (
        <div
          className={`livePanel ${activeCall ? "livePanelActive" : ""}`}
          style={{
            marginTop: 16,
            border: `1px solid ${activeCall ? "rgba(120,160,255,0.35)" : "rgba(255,255,255,0.10)"}`,
            borderRadius: 12,
            padding: 12,
            background: activeCall ? "rgba(120,160,255,0.07)" : "rgba(0,0,0,0.18)",
            opacity: activeCall ? 1 : 0.72,
          }}
        >
          <div
            className="hRow"
            style={{ marginBottom: 8, alignItems: "flex-start" }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  className={activeCall ? "statusBeacon statusBeaconLive" : "statusBeacon statusBeaconReady"}
                  aria-hidden="true"
                />
                <div style={{ fontSize: 18, fontWeight: 800 }}>
                  Listen Live Your AI Calling Front Desk
                </div>
              </div>

              <div className="smallMuted" style={{ marginTop: 6 }}>
                {activeCall
                  ? "A live call is in progress. This session is listen-only."
                  : "You can only listen while a live call is in progress."}
              </div>
            </div>

            <button
              className="btn"
              onClick={openLiveListenSession}
              disabled={!liveListenCapable}
              title={!activeCall ? "You can only listen while a live call is in progress." : ""}
            >
              {listenState === "live" || listenState === "connecting" ? "Stop Listening" : "Listen Live"}
            </button>
          </div>

          {listenNote ? (
            <div className="smallMuted" style={{ marginTop: 8 }}>
              {listenNote}
            </div>
          ) : null}

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

      <div style={{ marginTop: 16 }}>
        <div className="hRow" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Recent Activity (last 100)</h3>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label
              className="smallMuted"
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={activityPaused}
                onChange={(e) => setActivityPaused(e.target.checked)}
              />
              Pause updates
            </label>

            <button
              className="btn"
              onClick={() => {
                try {
                  localStorage.removeItem(ACT_CACHE_KEY);
                } catch (_) {}
                setActivity([]);
                setActivityMeta(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {activityErr ? <div style={{ color: "crimson" }}>{activityErr}</div> : null}

        <div style={{ marginTop: 8 }}>
          {activity && activity.length ? (
            <div className="activityTimeline">
              {activity.map((it: any, i: number) => {
                const ts = fmtCentralTime(it?.ts_ms, tzOffset) || "—";
                const msg = String(it?.msg || "—");
                const type = String(it?.type || "event").replace(/_/g, " ");

                return (
                  <div key={`${it?.ts_ms || 0}_${i}`} className="activityItem">
                    <div className={activityDotClass(it)} />
                    <div>
                      <div className="activityMeta">
                        <span>{ts}</span>
                        <span className="activityType">{type}</span>
                      </div>

                      <div className="activityMessage">{msg}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="activityEmpty">No activity yet.</div>
          )}
        </div>

        <div className="smallMuted" style={{ marginTop: 6 }}>
          Updated: {fmtCentralTime(activityMeta?.last_activity_ms, tzOffset) || "—"} • items:{" "}
          {String(activity?.length || 0)}
        </div>

        {role === "system_admin" ? (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw activity</summary>
            <pre
              className="monoBox activityBox"
              style={{ marginTop: 8, maxHeight: 260, overflow: "auto" }}
            >
              {activity && activity.length
                ? activity
                    .map((it: any) => {
                      const ts = fmtCentralTime(it?.ts_ms, tzOffset) || "";
                      const msg = String(it?.msg || "");
                      return ts ? `${ts} • ${msg}` : msg;
                    })
                    .join("\n")
                : "No activity yet."}
            </pre>
          </details>
        ) : null}
      </div>

      {role === "system_admin" && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON</summary>
          <pre className="monoBox" style={{ marginTop: 8 }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}

      {canControl ? <PauseResumePanel onDone={load} /> : null}

      {canKillSwitch ? (
        <EmergencyControls
          killState={data?.kill_switch || {}}
          tzOffset={tzOffset}
          userId={userId || ""}
          onDone={load}
        />
      ) : null}
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
    <div
      className="surfaceCard"
      style={{
        marginTop: 16,
        padding: 12,
        border: "1px solid #444",
        borderRadius: 12,
        background: "rgba(0,0,0,0.18)",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Control Surface (Pause/Resume)</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input"
          style={{ flex: "1 1 320px" }}
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

// OrthoCall UIX: Emergency Controls (system_admin only)
// Türkçe:
// - Settings değil, Status sayfasında operasyonel kart olarak durur.
// - Env kill-switch UI'dan gerçekten kapatılamaz; kullanıcıyı yanlış yönlendirmeyelim.
function EmergencyControls({
  killState,
  tzOffset,
  userId,
  onDone,
}: {
  killState: any;
  tzOffset: number;
  userId: string;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const enabled = !!killState?.enabled;
  const envEnabled = !!killState?.env_enabled;
  const runtimeEnabled = !!killState?.runtime_enabled;

  const source = envEnabled ? "ENV" : runtimeEnabled ? "RUNTIME" : "—";
  const changed = fmtCentralTime(killState?.updated_at_ms, tzOffset) || "—";
  const currentReason = String(killState?.reason || "").trim();

  async function setKillSwitch(nextEnabled: boolean) {
    if (!reason.trim()) {
      alert("Reason required");
      return;
    }

    const actionLabel = nextEnabled ? "ENABLE" : "DISABLE";
    const ok = confirm(`Are you sure you want to ${actionLabel} the Kill Switch? (Double confirm)`);
    if (!ok) return;

    setBusy(true);
    try {
      await opsFetch("/kill-switch", {
        method: "POST",
        body: {
          enabled: nextEnabled,
          reason: reason.trim(),
          user_id: userId || "",
        },
      });

      alert(nextEnabled ? "Kill-switch enabled." : "Kill-switch disabled.");
      setReason("");
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="surfaceCard"
      style={{
        marginTop: 16,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(255,90,90,0.35)",
        background: "rgba(255,90,90,0.06)",
      }}
    >
      <div className="hRow" style={{ marginBottom: 8, alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0 }}>Emergency Controls</h3>
          <div className="smallMuted" style={{ marginTop: 6 }}>
            Server stays online, but OrthoCall stops picking jobs and starting new calls.
          </div>
        </div>

        <div
          className="badge"
          style={{ borderColor: enabled ? "rgba(255,90,90,0.55)" : "rgba(255,255,255,0.14)" }}
        >
          Kill Switch: {enabled ? "ON" : "OFF"}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: 12,
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <div className="kpiKey">Current State</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{enabled ? "ON" : "OFF"}</div>
          <div className="smallMuted" style={{ marginTop: 6 }}>source: {source}</div>
          <div className="smallMuted" style={{ marginTop: 6 }}>changed: {changed}</div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 12,
            padding: 12,
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <div className="kpiKey">Current Reason</div>
          <div style={{ marginTop: 6 }}>{currentReason || "—"}</div>
          {envEnabled ? (
            <div className="smallMuted" style={{ marginTop: 8 }}>
              This kill-switch is enforced by ENV and cannot be cleared from UIX.
            </div>
          ) : (
            <div className="smallMuted" style={{ marginTop: 8 }}>
              Runtime kill-switch can be enabled/disabled here.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <input
          className="input"
          style={{ flex: "1 1 360px" }}
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <button
          className="btn btnDanger"
          onClick={() => setKillSwitch(true)}
          disabled={busy}
        >
          Enable Kill Switch
        </button>

        <button
          className="btn"
          onClick={() => setKillSwitch(false)}
          disabled={busy || envEnabled}
          title={envEnabled ? "ENV kill-switch cannot be disabled from UIX." : ""}
        >
          Disable Kill Switch
        </button>
      </div>

      {!reason.trim() ? (
        <div className="smallMuted" style={{ marginTop: 8 }}>
          Reason is required for audit trail.
        </div>
      ) : null}
    </div>
  );
}
