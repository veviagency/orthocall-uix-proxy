# UIX Contract v1 (OrthoCall Ops)

## Scope (UIX Pages)
UIX always has these pages:
- Status
- Today
- Range
- Next Jobs

“Pause/Resume” lives on Status (visible by role).

## Roles (enum)
- clinic_viewer (default) — read-only
- clinic_operator — read + Pause/Resume
- clinic_admin — read + Pause/Resume
- (future) system_admin — read + admin panels

## Auth & Security
- Ops endpoints are disabled by default: OPS_ENABLED=0
- When enabled: Authorization header required:
  Authorization: Bearer <OPS_ADMIN_KEY>
- OPS_ADMIN_KEY must never be exposed to the browser (proxy only).
- CORS: if Origin header exists, it must be allowlisted (deny-by-default).

---

## Ops Read APIs

### GET /ops/status?clinic_id=...
Response (shape)
{
  "ok": true,
  "ts": "2026-02-28T00:00:00.000Z",
  "central_day": "2026-02-27",
  "tz_offset_hours": -8,
  "phase": "paused|in_call|active|waiting_for_time|ready|waiting",
  "pause": {
    "paused_state": "RUNNING|PAUSED",
    "paused_mode": "MANUAL|AUTO|",
    "changed_at_ms": 0,
    "changed_by": "",
    "changed_reason": ""
  },
  "pause_manual": { ...same shape... },
  "last_activity_ms": 0,
  "last_event_type": "",
  "next_job": {
    "job_id": "",
    "clinic_id": "",
    "lead_id": "",
    "call_type": "",
    "next_action_at_ms": 0,
    "next_action_at_label": "YYYY-MM-DD HH.mm"
  },
  "kill_switch": {
    "enabled": false,
    "env_enabled": false,
    "runtime_enabled": false,
    "reason": "",
    "updated_at_ms": 0
  }
}

### GET /ops/metrics/today
Response (shape)
{
  "ok": true,
  "day": "YYYY-MM-DD",
  "tz_offset_hours": -8,
  "updated_at_ms": 0,
  "totals": {
    "jobs_total": 0,
    "jobs_by_type": {},
    "calls_final_total": 0,
    "calls_by_status": {},
    "calls_connected": 0,
    "calls_60s": 0,
    "emails_total": 0,
    "emails_by_target": {},
    "dnc_marked": 0,
    "booking_ready": 0
  }
}

### GET /ops/metrics/range?from=YYYY-MM-DD&to=YYYY-MM-DD
Response (shape)
{
  "ok": true,
  "from": "YYYY-MM-DD",
  "to": "YYYY-MM-DD",
  "tz_offset_hours": -8,
  "days": [
    { "day": "YYYY-MM-DD", "updated_at_ms": 0, "totals": { ...same as today.totals... } }
  ],
  "totals": { ...same as today.totals... }
}

### GET /ops/next-jobs?limit=3&clinic_id=...
Response (shape)
{
  "ok": true,
  "tz_offset_hours": -8,
  "jobs": [
    {
      "job_id": "",
      "clinic_id": "",
      "lead_id": "",
      "call_type": "",
      "next_action_at_ms": 0,
      "next_action_at_label": "YYYY-MM-DD HH.mm",
      "lead_hint": { "first_name": "", "last_initial": "", "phone_last4": "" }
    }
  ]
}

---

## Control Surface v1 (Pause/Resume)

### POST /ops/pause
Request:
{ "reason": "optional", "user_id": "optional", "mode": "MANUAL" }

Response:
{ "ok": true, "control": { "paused_state":"PAUSED", "paused_mode":"MANUAL", "changed_at_ms":0, "changed_by":"", "changed_reason":"" } }

### POST /ops/resume
Request:
{ "reason": "optional", "user_id": "optional" }

Response:
{ "ok": true, "control": { "paused_state":"RUNNING", "paused_mode":"", "changed_at_ms":0, "changed_by":"", "changed_reason":"" } }

---

## Contract Test (curl)
# NOTE: ops must be enabled (OPS_ENABLED=1)

curl -sS -H "Authorization: Bearer $OPS_ADMIN_KEY" "$BASE_URL/ops/status"
curl -sS -H "Authorization: Bearer $OPS_ADMIN_KEY" "$BASE_URL/ops/metrics/today"
curl -sS -H "Authorization: Bearer $OPS_ADMIN_KEY" "$BASE_URL/ops/metrics/range?from=2026-02-21&to=2026-02-28"
curl -sS -H "Authorization: Bearer $OPS_ADMIN_KEY" "$BASE_URL/ops/next-jobs?limit=3"
