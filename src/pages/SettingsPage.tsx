// src/pages/SettingsPage.tsx - V12
import { useEffect, useMemo, useState } from "react";
import { opsFetch, classifyOpsError } from "../lib/opsClient";
import { useRole } from "../lib/useRole";

type CallTypeKey = "NEW_LEAD" | "FOLLOW_UP" | "REMINDER_24H" | "REMINDER_2H";
type Toggle01 = 0 | 1;

type EmailMatrix = Record<
  CallTypeKey,
  {
    clinic_email: Toggle01;
    lead_email: Toggle01;
  }
>;

function isValidEmailOrEmpty(s: string) {
  const v = String(s || "").trim();
  if (!v) return true;
  // simple + safe
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeTimeHHMM(raw: string) {
  // Türkçe: UI hatasını azaltmak için "9.15" / "9:15" / "09:15" -> "09:15"
  const s0 = String(raw || "").trim();
  if (!s0) return "";

  const s = s0.replace(".", ":").replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
  if (hh < 0 || hh > 23) return "";
  if (mm < 0 || mm > 59) return "";

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toMinutesOrNaN(hhmm: string) {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function ToggleButton({
  value,
  onChange,
  disabled,
}: {
  value: Toggle01;
  onChange: (v: Toggle01) => void;
  disabled?: boolean;
}) {
  const on = value === 1;
  return (
    <button
      type="button"
      className="btn"
      disabled={!!disabled}
      onClick={() => onChange(on ? 0 : 1)}
      style={{
        width: 64,
        margin: "0 auto",
        justifyContent: "center",
        borderRadius: 999,
        fontWeight: 900,
        borderColor: on ? "rgba(46, 204, 113, 0.55)" : "rgba(231, 76, 60, 0.55)",
        background: on ? "rgba(46, 204, 113, 0.16)" : "rgba(231, 76, 60, 0.12)",
        opacity: disabled ? 0.5 : 1,
      }}
      aria-pressed={on}
    >
      {on ? "1" : "0"}
    </button>
  );
}

function defaultMatrix(): EmailMatrix {
  // Türkçe: Server settings endpoint hazır olana kadar sadece UI default.
  // (Davranışı değiştirmez; gerçek davranış server/env tarafında.)
  return {
    NEW_LEAD: { clinic_email: 1, lead_email: 1 },
    FOLLOW_UP: { clinic_email: 1, lead_email: 1 },
    REMINDER_24H: { clinic_email: 1, lead_email: 1 },
    REMINDER_2H: { clinic_email: 1, lead_email: 1 },
  };
}

export function SettingsPage() {
  const { role, userId, loading: roleLoading } = useRole();

  const canEdit = role === "clinic_admin" || role === "system_admin";

  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const [reason, setReason] = useState("");

  // Calling hours override (empty => server/env default)
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  // Email policy matrix override
  const [matrix, setMatrix] = useState<EmailMatrix>(() => defaultMatrix());

  // Clinic email recipient override
  const [clinicEmailTo, setClinicEmailTo] = useState<string>("");

  const startNorm = useMemo(() => normalizeTimeHHMM(startTime), [startTime]);
  const endNorm = useMemo(() => normalizeTimeHHMM(endTime), [endTime]);

  const timeFormatOk =
    (!startTime.trim() || !!startNorm) && (!endTime.trim() || !!endNorm);

  const timeOrderOk = useMemo(() => {
    // empty means "use default" => ok
    if (!startTime.trim() || !endTime.trim()) return true;
    if (!startNorm || !endNorm) return false;
    const a = toMinutesOrNaN(startNorm);
    const b = toMinutesOrNaN(endNorm);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return a < b;
  }, [startTime, endTime, startNorm, endNorm]);

  const emailOk = useMemo(() => isValidEmailOrEmpty(clinicEmailTo), [clinicEmailTo]);

  const canSave = reason.trim() && timeFormatOk && timeOrderOk && emailOk;

  async function loadFromServer() {
    setLoadErr("");
    setLoading(true);
    try {
      const r: any = await opsFetch("/settings", { method: "GET" });

      // Türkçe: Endpoint şekli Part-2'de netleşecek; burası toleranslı parse.
      const root =
        r && typeof r === "object" && r.settings && typeof r.settings === "object"
          ? r.settings
          : r;

      const ch =
        root && typeof root.calling_hours === "object"
          ? root.calling_hours
          : (root?.call_hours || {});
      const st = String(ch?.start || ch?.start_hhmm || "").trim();
      const en = String(ch?.end || ch?.end_hhmm || "").trim();

      const m =
        root && typeof root.email_matrix === "object"
          ? root.email_matrix
          : (root?.email_policy?.matrix || null);

      const nextMatrix: EmailMatrix = {
        NEW_LEAD: {
          clinic_email: Number(m?.NEW_LEAD?.clinic_email) ? 1 : 0,
          lead_email: Number(m?.NEW_LEAD?.lead_email) ? 1 : 0,
        },
        FOLLOW_UP: {
          clinic_email: Number(m?.FOLLOW_UP?.clinic_email) ? 1 : 0,
          lead_email: Number(m?.FOLLOW_UP?.lead_email) ? 1 : 0,
        },
        REMINDER_24H: {
          clinic_email: Number(m?.REMINDER_24H?.clinic_email) ? 1 : 0,
          lead_email: Number(m?.REMINDER_24H?.lead_email) ? 1 : 0,
        },
        REMINDER_2H: {
          clinic_email: Number(m?.REMINDER_2H?.clinic_email) ? 1 : 0,
          lead_email: Number(m?.REMINDER_2H?.lead_email) ? 1 : 0,
        },
      };

      const ce = String(root?.clinic_email_to_override || root?.clinic_email_to || "").trim();

      setStartTime(st);
      setEndTime(en);
      setMatrix(nextMatrix);
      setClinicEmailTo(ce);
    } catch (e: any) {
      const c = classifyOpsError(e);
      setLoadErr(c.detail || (e && e.message ? String(e.message) : String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Türkçe: Hook order safety + gereksiz 403/404 spam önleme:
    // - role yüklenmeden istek atma
    // - sadece yetkili rolde load et
    if (roleLoading) return;
    if (!canEdit) return;

    // Türkçe: Server endpoint hazırsa doldursun; değilse UI boş/placeholder kalsın.
    loadFromServer().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, canEdit]);

  async function save() {
    if (!canSave) return;

    setLoading(true);
    setLoadErr("");
    try {
      const patch = {
        calling_hours: {
          // empty => server/env default; Part-2 server validate edecek
          start: startTime.trim(),
          end: endTime.trim(),
        },
        email_matrix: matrix,
        clinic_email_to_override: clinicEmailTo.trim(),
      };

      await opsFetch("/settings", {
        method: "POST",
        body: {
          reason: reason.trim(),
          user_id: userId || "",
          patch,
        },
      });

      alert("Saved.");
      setReason("");
      await loadFromServer();
    } catch (e: any) {
      const c = classifyOpsError(e);
      setLoadErr(c.detail || (e && e.message ? String(e.message) : String(e)));
    } finally {
      setLoading(false);
    }
  }

  function rowLabel(k: CallTypeKey) {
    if (k === "NEW_LEAD") return "First Call";
    if (k === "FOLLOW_UP") return "Follow-Up Call";
    if (k === "REMINDER_24H") return "24 Hour Reminder";
    return "2 Hour Reminder";
  }

  // OrthoCall UIX: Hook order safety
  // Türkçe: İlk render'da role boş/unknown olabilir. Bu yüzden "Not authorized" early-return yapmak
  // hook sırasını bozar (React error #310). Önce tüm hook'lar çalışsın, sonra guard.
  if (roleLoading) {
    return (
      <div style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <div className="smallMuted">Loading role...</div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <div className="bannerDanger">Not authorized.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="hRow" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <div className="smallMuted" style={{ marginTop: 4 }}>
            Admin-Only Control
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={loadFromServer} disabled={loading}>
            Reload
          </button>
        </div>
      </div>

      {loadErr ? (
        <div className="bannerDanger">
          <b>Settings API error</b>
          <div style={{ marginTop: 6 }}>{loadErr}</div>
          <div className="smallMuted" style={{ marginTop: 6 }}>
            Note: If this is <span style={{ fontWeight: 800 }}>ops_http_404</span>, Part-2 backend endpoint is not deployed yet.
          </div>
        </div>
      ) : null}

      {/* Calling Hours */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(0,0,0,0.18)",
          marginTop: 10,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Calling Hours</div>
        <div className="smallMuted" style={{ marginBottom: 10 }}>
          Enter in 24-hour format (HH:MM). Example: 09:15. Leave empty to use system defaults.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "40% 10% 40%",
            justifyContent: "center",
            alignItems: "start",
          }}
        >
          <div>
            <div className="smallMuted" style={{ marginBottom: 6 }}>Start time</div>
            <input
              className="input"
              placeholder="Enter start time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              onBlur={() => {
                const n = normalizeTimeHHMM(startTime);
                if (n) setStartTime(n);
              }}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>

          <div />

          <div>
            <div className="smallMuted" style={{ marginBottom: 6 }}>End time</div>
            <input
              className="input"
              placeholder="Enter end time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              onBlur={() => {
                const n = normalizeTimeHHMM(endTime);
                if (n) setEndTime(n);
              }}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {!timeFormatOk ? (
          <div style={{ marginTop: 10, color: "crimson", fontWeight: 700 }}>
            Invalid time format. Use HH:MM (24-hour).
          </div>
        ) : null}

        {timeFormatOk && !timeOrderOk ? (
          <div style={{ marginTop: 10, color: "crimson", fontWeight: 700 }}>
            Start time must be earlier than end time.
          </div>
        ) : null}
      </div>

      {/* Email Permissions */}
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(0,0,0,0.18)",
          marginTop: 12,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Email Permissions</div>
        <div className="smallMuted" style={{ marginBottom: 10 }}>
          Toggle 0/1 per call type. Leave Clinic email recipient empty to use server/env default.
        </div>

        <div style={{ margin: "0 auto 12px auto", maxWidth: 920 }}>
          <div className="smallMuted" style={{ marginBottom: 6 }}>Clinic email recipient (override)</div>
          <input
            className="input"
            placeholder="you@clinic.com"
            value={clinicEmailTo}
            onChange={(e) => setClinicEmailTo(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
          {!emailOk ? (
            <div style={{ marginTop: 8, color: "crimson", fontWeight: 700 }}>
              Invalid email format.
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr",
            gap: 10,
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div className="badge" style={{ justifySelf: "center" }}>Call Types</div>
          <div className="badge" style={{ justifySelf: "center" }}>Clinic Email</div>
          <div className="badge" style={{ justifySelf: "center" }}>Lead Email</div>

          {(["NEW_LEAD", "FOLLOW_UP", "REMINDER_24H", "REMINDER_2H"] as CallTypeKey[]).map((k) => (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ fontWeight: 800, justifySelf: "center" }}>{rowLabel(k)}</div>

              <ToggleButton
                value={matrix[k].clinic_email}
                onChange={(v) =>
                  setMatrix((prev) => ({
                    ...prev,
                    [k]: { ...prev[k], clinic_email: v },
                  }))
                }
              />

              <ToggleButton
                value={matrix[k].lead_email}
                onChange={(v) =>
                  setMatrix((prev) => ({
                    ...prev,
                    [k]: { ...prev[k], lead_email: v },
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* Save Panel */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            style={{ flex: "1 1 360px" }}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button className="btn" onClick={save} disabled={!canSave || loading}>
            Save
          </button>
        </div>

        {!reason.trim() ? (
          <div className="smallMuted" style={{ marginTop: 8 }}>
            Reason is required for audit trail.
          </div>
        ) : null}
      </div>
    </div>
  );
}
