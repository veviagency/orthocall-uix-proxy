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
  }, []);

  const canControl = role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12, fontWeight: 600 }}>
        {utcLabel(tzOffset)}
      </div>

      {data?.kill_switch?.enabled ? (
        <div style={{ padding: 12, border: "1px solid #ff4d4f", marginBottom: 12 }}>
          <b>Kill-switch is ON</b>
          <div>{String(data?.kill_switch?.reason || "")}</div>
        </div>
      ) : null}

      {err ? <div style={{ color: "crimson" }}>{err}</div> : null}

      <h2>Status</h2>
      <pre style={{ background: "#111", color: "#eee", padding: 12, overflow: "auto" }}>
        {JSON.stringify(data, null, 2)}
      </pre>

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
        <button onClick={doPause} disabled={busy}>Pause</button>
        <button onClick={doResume} disabled={busy}>Resume</button>
      </div>
    </div>
  );
}
