// V16

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

function onlyUsDigits(raw: string) {
  return String(raw || "").replace(/\D/g, "").slice(0, 10);
}

function asE164FromUiDigits(digits10: string) {
  const d = onlyUsDigits(digits10);
  return d ? `+1${d}` : "";
}

function SummaryBox({ lead }: { lead: LeadPreview }) {
  const jobs = lead.open_jobs || { queued: 0, picked: 0, running: 0, total_open: 0 };

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 12,
        padding: 12,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontWeight: 800 }}>{lead.display_name || "Unknown"}</div>
      <div className="smallMuted" style={{ marginTop: 6 }}>
        phone: {lead.phone_e164 || "—"}
      </div>
      <div className="smallMuted" style={{ marginTop: 6 }}>
        state: {lead.current_state}
        {lead.out_of_orthocall ? " • already manual" : ""}
        {lead.dnc ? " • DNC" : ""}
      </div>
      <div className="smallMuted" style={{ marginTop: 6 }}>
        open jobs: queued={jobs.queued} • picked={jobs.picked} • running={jobs.running}
      </div>
      <div className="smallMuted" style={{ marginTop: 6 }}>
        live call: {lead.live_call_active ? `yes (${lead.live_call?.status || "active"})` : "no"}
      </div>
    </div>
  );
}

export function CRMControlPage() {
  const { role, loading: roleLoading } = useRole();

  const canUse =
    role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  const [movePhone, setMovePhone] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [movePreview, setMovePreview] = useState<LeadPreview | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveErr, setMoveErr] = useState("");
  const [moveOk, setMoveOk] = useState("");

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

  async function resolveMoveLead() {
    setMoveErr("");
    setMoveOk("");
    setMovePreview(null);

    try {
      const phone = asE164FromUiDigits(movePhone);
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
      const phone = asE164FromUiDigits(movePhone);
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
      const phone = asE164FromUiDigits(notePhone);
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
      const phone = asE164FromUiDigits(notePhone);
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
    <div>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>CRM Control</h2>
      <div className="smallMuted" style={{ marginBottom: 16 }}>
        Controlled CRM actions for leads already inside OrthoCall.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Move to Manual</h3>
          <div className="smallMuted" style={{ marginBottom: 12 }}>
            This action moves the lead to Manual Review and cancels future OrthoCall jobs for that lead.
          </div>

          <div className="smallMuted" style={{ marginBottom: 6 }}>Phone</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                minWidth: 52,
                textAlign: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "rgba(255,255,255,0.78)",
              }}
            >
              +1
            </div>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="5551234567"
              value={movePhone}
              onChange={(e) => {
                setMovePhone(onlyUsDigits(e.target.value));
                setMovePreview(null);
                setMoveErr("");
                setMoveOk("");
              }}
            />
            <button className="btn" onClick={resolveMoveLead} disabled={moveLoading}>
              Find lead
            </button>
          </div>

          {movePreview ? <SummaryBox lead={movePreview} /> : null}

          <label
            className="smallMuted"
            style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 14 }}
          >
            <input
              type="checkbox"
              checked={moveConfirm}
              onChange={(e) => setMoveConfirm(e.target.checked)}
            />
            <span>
              I understand that moving this lead to Manual will stop OrthoCall automation and
              cancel future scheduled jobs for this lead.
            </span>
          </label>

          <div className="smallMuted" style={{ marginTop: 12, marginBottom: 6 }}>
            Reason
          </div>
          <textarea
            className="input"
            rows={4}
            placeholder="This reason will be added automatically as an internal CRM note so the team can understand later why the lead was moved to Manual."
            value={moveReason}
            onChange={(e) => setMoveReason(e.target.value)}
          />

          {movePreview?.live_call_active ? (
            <div className="smallMuted" style={{ marginTop: 10 }}>
              Move is blocked while this lead has an active live call.
            </div>
          ) : null}

          {movePreview?.out_of_orthocall ? (
            <div className="smallMuted" style={{ marginTop: 10 }}>
              This lead is already in Manual.
            </div>
          ) : null}

          {moveErr ? (
            <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)" }}>{moveErr}</div>
          ) : null}
          {moveOk ? (
            <div style={{ marginTop: 10, color: "rgba(120,255,170,0.95)" }}>{moveOk}</div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={submitMove} disabled={moveDisabled}>
              Move
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Add Internal Comment</h3>
          <div className="smallMuted" style={{ marginBottom: 12 }}>
            This action only adds an internal Trello note. It does not change automation state.
          </div>

          <div className="smallMuted" style={{ marginBottom: 6 }}>Phone</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div
              style={{
                minWidth: 52,
                textAlign: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "rgba(255,255,255,0.78)",
              }}
            >
              +1
            </div>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="5551234567"
              value={notePhone}
              onChange={(e) => {
                setNotePhone(onlyUsDigits(e.target.value));
                setNotePreview(null);
                setNoteErr("");
                setNoteOk("");
              }}
            />
            <button className="btn" onClick={resolveNoteLead} disabled={noteLoading}>
              Find lead
            </button>
          </div>

          {notePreview ? <SummaryBox lead={notePreview} /> : null}

          <div className="smallMuted" style={{ marginTop: 12, marginBottom: 6 }}>
            Internal note
          </div>
          <textarea
            className="input"
            rows={5}
            placeholder="Write the internal comment that should be added to the CRM card."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />

          {noteErr ? (
            <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)" }}>{noteErr}</div>
          ) : null}
          {noteOk ? (
            <div style={{ marginTop: 10, color: "rgba(120,255,170,0.95)" }}>{noteOk}</div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={submitNote} disabled={noteDisabled}>
              Add comment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
