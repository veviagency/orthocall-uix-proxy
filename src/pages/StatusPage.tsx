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

  const tzOffset = useMemo(() => Number(data?.tz_offset_hours ?? 0), [data]);

  async function load() {
    setErr("");
    const r = await opsFetch("/status", { method: "GET" });
    setData(r);
  }

  useEffect(() => {
    // Status poll: 10–15s (plan)
    const stop = startPoll(load, 12000);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canControl =
    role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, fontWeight: 600 }}>{utcLabel(tzOffset)}</div>

      {data?.kill_switch?.enabled ? (
        <div style={{ padding: 12, border: "1px solid #ff4d4f", marginBottom: 12 }}>
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

        const pausedState = pause?.paused_state ? "PAUSED" : "NOT_PAUSED";
        const pausedMode = String(pause?.paused_mode || "");
        const pausedReason = String(pause?.changed_reason || pause?.reason || "");
        const pausedChanged = fmtCentralTime(pause?.changed_at_ms, tzOffset);

        const ksState = ks?.enabled ? "ON" : "OFF";
        const ksReason = String(ks?.reason || "");

        const nextJobId = String(next?.job_id || "");
        const nextCallType = String(next?.call_type || "");
        const nextWhen = String(next?.next_action_at_label || next?.due_at_label || "");

        return (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div style={{ border: "1px solid #444", padding: 12 }}>
              <div style={{ opacity: 0.8, fontSize: 12 }}>Overall Status</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                {String(data?.status || "—")}
              </div>
              <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
                phase: {String(data?.phase || "—")}
              </div>
            </div>

            <div style={{ border: "1px solid #444", padding: 12 }}>
              <div style={{ opacity: 0.8, fontSize: 12 }}>Pause</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                {pausedState}
                {pausedMode ? ` • ${pausedMode}` : ""}
              </div>
              {pausedReason ? (
                <div style={{ marginTop: 6 }}>reason: {pausedReason}</div>
              ) : (
                <div style={{ marginTop: 6, opacity: 0.7 }}>reason: —</div>
              )}
              {pausedChanged ? (
                <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                  changed: {pausedChanged}
                </div>
              ) : (
                <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>changed: —</div>
              )}
            </div>

            <div style={{ border: "1px solid #444", padding: 12 }}>
              <div style={{ opacity: 0.8, fontSize: 12 }}>Kill-switch</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{ksState}</div>
              {ksReason ? (
                <div style={{ marginTop: 6 }}>reason: {ksReason}</div>
              ) : (
                <div style={{ marginTop: 6, opacity: 0.7 }}>reason: —</div>
              )}
            </div>

            <div style={{ border: "1px solid #444", padding: 12 }}>
              <div style={{ opacity: 0.8, fontSize: 12 }}>Next Job</div>
              {next ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>
                    {nextCallType || "job"} {nextWhen ? `• ${nextWhen}` : ""}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                    job_id: {nextJobId || "—"}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 6, opacity: 0.7 }}>No next job</div>
              )}
            </div>
          </div>
        );
      })()}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", opacity: 0.8 }}>Raw JSON</summary>
        <pre
          style={{
            background: "#111",
            color: "#eee",
            padding: 12,
            overflow: "auto",
            marginTop: 8,
          }}
        >
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
          style={{ flex: 1, padding: 8 }}
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button onClick={doPause} disabled={busy}>
          Pause
        </button>
        <button onClick={doResume} disabled={busy}>
          Resume
        </button>
      </div>
    </div>
  );
}
