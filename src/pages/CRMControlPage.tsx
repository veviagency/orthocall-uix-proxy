// V16.2

import { useMemo, useState } from "react";
import { opsFetch, classifyOpsError } from "../lib/opsClient";
import { useRole } from "../lib/useRole";

type LeadPreview = {
  lead_id: string;
  display_name: string;
  phone_e164: string;
  phone_last4: string;
  dnc: boolean;
  out_of_orthocall: boolean;
  current_state: string;
  has_future_jobs: boolean;
  open_jobs?: {
    queued: number;
    picked: number;
    running: number;
    total_open: number;
  };
  live_call_active: boolean;
  live_call?: {
    callSid?: string;
    status?: string;
  } | null;
};

function sanitizeCountryCode(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 4);
  return `+${digits || "1"}`;
}

function onlyPhoneDigits(raw: string) {
  return String(raw || "").replace(/\D/g, "").slice(0, 15);
}

function buildE164(countryCode: string, localNumber: string) {
  const cc = sanitizeCountryCode(countryCode);
  const local = onlyPhoneDigits(localNumber);
  if (!local) return "";
  return `${cc}${local}`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="smallMuted" style={{ marginBottom: 6 }}>
      {children}
    </div>
  );
}

function SummaryBox({ lead }: { lead: LeadPreview }) {
  const jobs = lead.open_jobs || { queued: 0, picked: 0, running: 0, total_open: 0 };

  return (
    <div
      style={{
        marginTop: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        padding: 12,
        background: "rgba(255,255,255,0.03)",
        overflow: "hidden",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.35 }}>
        {lead.display_name || "Unknown"}
      </div>

      <div className="smallMuted" style={{ marginTop: 6, wordBreak: "break-word" }}>
        Phone: {lead.phone_e164 || "—"}
      </div>

      <div className="smallMuted" style={{ marginTop: 6 }}>
        State: {lead.current_state}
        {lead.out_of_orthocall ? " • already manual" : ""}
        {lead.dnc ? " • DNC" : ""}
      </div>

      <div className="smallMuted" style={{ marginTop: 6 }}>
        Open jobs: queued={jobs.queued} • picked={jobs.picked} • running={jobs.running}
      </div>

      <div className="smallMuted" style={{ marginTop: 6 }}>
        Live call: {lead.live_call_active ? `yes (${lead.live_call?.status || "active"})` : "no"}
      </div>
    </div>
  );
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: 14,
        background: "rgba(255,255,255,0.02)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h3>
      <div className="smallMuted" style={{ marginBottom: 12, lineHeight: 1.45 }}>
        {subtitle}
      </div>
      {children}
    </div>
  );
}

function PhoneLookupRow({
  countryCode,
  setCountryCode,
  phone,
  setPhone,
  onFind,
  busy,
}: {
  countryCode: string;
  setCountryCode: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  onFind: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
      <input
        className="input"
        style={{
          width: 88,
          flex: "0 0 88px",
          textAlign: "center",
        }}
        value={countryCode}
        onChange={(e) => setCountryCode(sanitizeCountryCode(e.target.value))}
        placeholder="+1"
      />

      <input
        className="input"
        style={{
          flex: "1 1 220px",
          minWidth: 0,
        }}
        placeholder="5551234567"
        value={phone}
        onChange={(e) => setPhone(onlyPhoneDigits(e.target.value))}
      />

      <button className="btn" onClick={onFind} disabled={busy || !onlyPhoneDigits(phone)}>
        Find lead
      </button>
    </div>
  );
}

export function CRMControlPage() {
  const { role, loading: roleLoading } = useRole();

  const canUse =
    role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  const [moveCountryCode, setMoveCountryCode] = useState("+1");
  const [movePhone, setMovePhone] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [movePreview, setMovePreview] = useState<LeadPreview | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveErr, setMoveErr] = useState("");
  const [moveOk, setMoveOk] = useState("");

  const [noteCountryCode, setNoteCountryCode] = useState("+1");
  const [notePhone, setNotePhone] = useState("");
  const [noteText, setNoteText] = useState("");
  const [notePreview, setNotePreview] = useState<LeadPreview | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteErr, setNoteErr] = useState("");
  const [noteOk, setNoteOk] = useState("");

  const moveDisabled = useMemo(() => {
    return (
      !movePreview ||
      !moveConfirm ||
      !moveReason.trim() ||
      !!movePreview.live_call_active ||
      !!movePreview.out_of_orthocall ||
      moveLoading
    );
  }, [movePreview, moveConfirm, moveReason, moveLoading]);

  const noteDisabled = useMemo(() => {
    return !notePreview || !noteText.trim() || noteLoading;
  }, [notePreview, noteText, noteLoading]);

  function resetMoveResolvedState() {
    setMovePreview(null);
    setMoveErr("");
    setMoveOk("");
    setMoveConfirm(false);
    setMoveReason("");
  }

  function resetNoteResolvedState() {
    setNotePreview(null);
    setNoteErr("");
    setNoteOk("");
    setNoteText("");
  }

  async function resolveMoveLead() {
    setMoveErr("");
    setMoveOk("");
    setMovePreview(null);

    try {
      const phone = buildE164(moveCountryCode, movePhone);
      if (!phone) throw new Error("phone_required");

      setMoveLoading(true);
      const r = await opsFetch(`/crm/lead?phone=${encodeURIComponent(phone)}`);
      setMovePreview((r as any)?.lead || null);
    } catch (e: any) {
      const info = classifyOpsError(e);
      setMoveErr(info.detail || String(e?.message || e));
    } finally {
      setMoveLoading(false);
    }
  }

  async function submitMove() {
    setMoveErr("");
    setMoveOk("");

    try {
      const phone = buildE164(moveCountryCode, movePhone);
      if (!phone) throw new Error("phone_required");

      setMoveLoading(true);
      const r = await opsFetch("/crm/move-to-manual", {
        method: "POST",
        body: {
          phone,
          reason: moveReason.trim(),
          confirm_move_to_manual: moveConfirm,
        },
      });

      const lead = (r as any)?.lead || null;
      setMovePreview(lead);
      setMoveOk("Lead was moved to Manual successfully.");
      setMoveConfirm(false);
      setMoveReason("");
    } catch (e: any) {
      const info = classifyOpsError(e);
      setMoveErr(info.detail || String(e?.message || e));
    } finally {
      setMoveLoading(false);
    }
  }

  async function resolveNoteLead() {
    setNoteErr("");
    setNoteOk("");
    setNotePreview(null);

    try {
      const phone = buildE164(noteCountryCode, notePhone);
      if (!phone) throw new Error("phone_required");

      setNoteLoading(true);
      const r = await opsFetch(`/crm/lead?phone=${encodeURIComponent(phone)}`);
      setNotePreview((r as any)?.lead || null);
    } catch (e: any) {
      const info = classifyOpsError(e);
      setNoteErr(info.detail || String(e?.message || e));
    } finally {
      setNoteLoading(false);
    }
  }

  async function submitNote() {
    setNoteErr("");
    setNoteOk("");

    try {
      const phone = buildE164(noteCountryCode, notePhone);
      if (!phone) throw new Error("phone_required");

      setNoteLoading(true);
      const r = await opsFetch("/crm/add-comment", {
        method: "POST",
        body: {
          phone,
          note: noteText.trim(),
        },
      });

      setNotePreview((r as any)?.lead || null);
      setNoteOk("Internal comment was added successfully.");
      setNoteText("");
    } catch (e: any) {
      const info = classifyOpsError(e);
      setNoteErr(info.detail || String(e?.message || e));
    } finally {
      setNoteLoading(false);
    }
  }

  if (roleLoading) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>CRM Control</h2>
        <div className="smallMuted">Loading role...</div>
      </div>
    );
  }

  if (!canUse) {
    return (
      <div>
        <h2 style={{ marginTop: 0 }}>CRM Control</h2>
        <div className="smallMuted">Not authorized for this page.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, minWidth: 0 }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>CRM Control</h2>
      <div className="smallMuted" style={{ marginBottom: 16 }}>
        Controlled CRM actions for leads already inside OrthoCall.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <CardShell
          title="Move to Manual"
          subtitle="This action moves the lead to Manual Review and cancels future OrthoCall jobs for that lead."
        >
          <FieldLabel>Phone</FieldLabel>

          <PhoneLookupRow
            countryCode={moveCountryCode}
            setCountryCode={(v) => {
              setMoveCountryCode(v);
              resetMoveResolvedState();
            }}
            phone={movePhone}
            setPhone={(v) => {
              setMovePhone(v);
              resetMoveResolvedState();
            }}
            onFind={resolveMoveLead}
            busy={moveLoading}
          />

          {moveErr ? (
            <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)", wordBreak: "break-word" }}>
              {moveErr}
            </div>
          ) : null}

          {moveOk ? (
            <div style={{ marginTop: 10, color: "rgba(120,255,170,0.95)", wordBreak: "break-word" }}>
              {moveOk}
            </div>
          ) : null}

          {movePreview ? (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                minWidth: 0,
              }}
            >
              <SummaryBox lead={movePreview} />

              <label
                className="smallMuted"
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  marginTop: 14,
                  lineHeight: 1.45,
                }}
              >
                <input
                  type="checkbox"
                  checked={moveConfirm}
                  onChange={(e) => setMoveConfirm(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  I understand that moving this lead to Manual will stop OrthoCall automation and
                  cancel future scheduled jobs for this lead.
                </span>
              </label>

              <div style={{ marginTop: 12 }}>
                <FieldLabel>Reason</FieldLabel>
                <textarea
                  className="input"
                  rows={4}
                  style={{ minHeight: 104 }}
                  placeholder="This reason will be added automatically as an internal CRM note so the team can understand later why the lead was moved to Manual."
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                />
              </div>

              {movePreview.live_call_active ? (
                <div className="smallMuted" style={{ marginTop: 10 }}>
                  Move is blocked while this lead has an active live call.
                </div>
              ) : null}

              {movePreview.out_of_orthocall ? (
                <div className="smallMuted" style={{ marginTop: 10 }}>
                  This lead is already in Manual.
                </div>
              ) : null}

              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={submitMove} disabled={moveDisabled}>
                  Move
                </button>
              </div>
            </div>
          ) : null}
        </CardShell>

        <CardShell
          title="Add Internal Comment"
          subtitle="This action only adds an internal Trello note. It does not change automation state."
        >
          <FieldLabel>Phone</FieldLabel>

          <PhoneLookupRow
            countryCode={noteCountryCode}
            setCountryCode={(v) => {
              setNoteCountryCode(v);
              resetNoteResolvedState();
            }}
            phone={notePhone}
            setPhone={(v) => {
              setNotePhone(v);
              resetNoteResolvedState();
            }}
            onFind={resolveNoteLead}
            busy={noteLoading}
          />

          {noteErr ? (
            <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)", wordBreak: "break-word" }}>
              {noteErr}
            </div>
          ) : null}

          {noteOk ? (
            <div style={{ marginTop: 10, color: "rgba(120,255,170,0.95)", wordBreak: "break-word" }}>
              {noteOk}
            </div>
          ) : null}

          {notePreview ? (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                minWidth: 0,
              }}
            >
              <SummaryBox lead={notePreview} />

              <div style={{ marginTop: 12 }}>
                <FieldLabel>Internal note</FieldLabel>
                <textarea
                  className="input"
                  rows={5}
                  style={{ minHeight: 120 }}
                  placeholder="Write the internal comment that should be added to the CRM card."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
              </div>

              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={submitNote} disabled={noteDisabled}>
                  Add comment
                </button>
              </div>
            </div>
          ) : null}
        </CardShell>
      </div>
    </div>
  );
}
