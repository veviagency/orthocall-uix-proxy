
// src/App.tsx - V25.3
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabaseClient";
import { useRole } from "./lib/useRole";
import { StatusPage } from "./pages/StatusPage";
import { TodayPage } from "./pages/TodayPage";
import { RangePage } from "./pages/RangePage";
import { NextJobsPage } from "./pages/NextJobsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CRMControlPage } from "./pages/CRMControlPage";
const UIX_RELOGIN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UIX_LAST_LOGIN_AT_KEY = "orthocall_uix_last_login_at_ms_v1";

type LoginBackdropItem = {
  id: string;
  at: string;
  type: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
};

function loginActivityDotClass(it: LoginBackdropItem) {
  const level = String(it?.level || "").toLowerCase();
  const type = String(it?.type || "").toLowerCase();

  if (level === "error") return "activityDot activityDotError";
  if (level === "warn") return "activityDot activityDotWarn";

  if (
    type.includes("booking") ||
    type.includes("booked") ||
    type.includes("call start") ||
    type.includes("call initiated")
  ) {
    return "activityDot activityDotSuccess";
  }

  return "activityDot activityDotInfo";
}

function fmtCtClock(totalMinutes: number) {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hh24 = Math.floor(safe / 60) % 24;
  const mm = safe % 60;
  const suffix = hh24 >= 12 ? "PM" : "AM";
  const hh12 = hh24 % 12 || 12;
  return `${hh12}:${String(mm).padStart(2, "0")} ${suffix} CT`;
}

function buildLoginBackdropItems(): LoginBackdropItem[] {
  const firstNames = [
    "Emma", "Liam", "Ava", "Noah", "Mia", "Ethan", "Sofia", "Lucas", "Harper",
    "Mason", "Ella", "Logan", "Chloe", "James", "Grace", "Henry", "Nora", "Jack",
    "Lily", "Owen", "Aria", "Levi", "Zoey", "Wyatt", "Layla", "Leo", "Hazel",
    "Ezra", "Scarlett", "Hudson", "Stella", "Elijah", "Violet", "Asher", "Lucy", "Julian",
  ];

  const lastInitials = [
    "R", "M", "T", "C", "B", "S", "H", "D", "P", "W", "K", "G",
    "F", "N", "J", "L", "Y", "A", "Q", "E", "I", "O", "U", "V",
    "X", "Z", "C", "R", "M", "T", "B", "S", "H", "D", "P", "W",
  ];

  const phoneLast4 = [
    "1482", "5621", "9034", "2718", "4406", "1189", "6742", "3501", "8257",
    "6140", "2294", "7813", "4965", "1328", "9071", "5840", "2683", "7139",
    "4552", "6098", "3417", "8204", "1765", "9326", "5084", "2471", "6650",
    "3842", "7195", "1457", "8031", "2946", "5710", "4388", "9602", "1274",
  ];

  const eventTemplates = [
    {
      type: "Call initiated",
      level: "success" as const,
      build: (lead: string) => `${lead} · outbound call started.`,
    },
    {
      type: "No answer",
      level: "warn" as const,
      build: (lead: string, followUp: string) => `${lead} · no answer, follow-up queued for ${followUp}.`,
    },
    {
      type: "Voicemail",
      level: "info" as const,
      build: (lead: string) => `${lead} · voicemail detected, retry window prepared.`,
    },
    {
      type: "Booking confirmed",
      level: "success" as const,
      build: (lead: string, followUp: string) => `${lead} · consult booked for ${followUp}.`,
    },
    {
      type: "Manual review",
      level: "warn" as const,
      build: (lead: string) => `${lead} · transfer question flagged for human review.`,
    },
    {
      type: "Reminder email",
      level: "info" as const,
      build: (lead: string) => `${lead} · follow-up email sent after connected call.`,
    },
    {
      type: "DNC updated",
      level: "error" as const,
      build: (lead: string) => `${lead} · do-not-call request recorded.`,
    },
    {
      type: "Reminder queued",
      level: "info" as const,
      build: (lead: string, followUp: string) => `${lead} · reminder job queued for ${followUp}.`,
    },
  ];

  const items: LoginBackdropItem[] = [];

  for (let i = 0; i < 36; i++) {
    const leadLabel = `${firstNames[i]} ${lastInitials[i]}. • …${phoneLast4[i]}`;
    const template = eventTemplates[i % eventTemplates.length];
    const atMinutes = 8 * 60 + ((i * 17) % (10 * 60));
    const nextMinutes = atMinutes + 55 + ((i * 11) % 95);

    items.push({
      id: `login-bg-${i}`,
      at: fmtCtClock(atMinutes),
      type: template.type,
      level: template.level,
      message: template.build(leadLabel, fmtCtClock(nextMinutes)),
    });
  }

  return items;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loginNotice, setLoginNotice] = useState("");
  const { clinicName, role, loading } = useRole();
  const forcedLogoutTimerRef = useRef<number | null>(null);

  // OrthoCall UIX: login ekranında gerçek hissi veren, güvenli detay seviyesinde demo event akışı.
  const loginActivityLanes = useMemo(() => {
    const items = buildLoginBackdropItems();
    return [
      items.filter((_, i) => i % 3 === 0),
      items.filter((_, i) => i % 3 === 1),
      items.filter((_, i) => i % 3 === 2),
    ];
  }, []);

  function readLastLoginAtMs() {
    try {
      const raw = localStorage.getItem(UIX_LAST_LOGIN_AT_KEY) || "";
      const ms = parseInt(raw, 10);
      return Number.isFinite(ms) ? ms : NaN;
    } catch (_) {
      return NaN;
    }
  }

  function writeLastLoginAtNow() {
    try {
      localStorage.setItem(UIX_LAST_LOGIN_AT_KEY, String(Date.now()));
    } catch (_) {}
  }

  function clearLastLoginAt() {
    try {
      localStorage.removeItem(UIX_LAST_LOGIN_AT_KEY);
    } catch (_) {}
  }

  function clearForcedLogoutTimer() {
    if (forcedLogoutTimerRef.current != null) {
      window.clearTimeout(forcedLogoutTimerRef.current);
      forcedLogoutTimerRef.current = null;
    }
  }

  async function forceLocalRelogin(reason: string) {
    clearForcedLogoutTimer();
    clearLastLoginAt();
    setLoginNotice(reason);
    await supabase.auth.signOut({ scope: "local" });
    setSession(null);
  }

  function armForcedLogoutTimer(lastLoginAtMs: number) {
    clearForcedLogoutTimer();

    const remainingMs = UIX_RELOGIN_MAX_AGE_MS - (Date.now() - lastLoginAtMs);
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      void forceLocalRelogin("Session expired. Please sign in again.");
      return;
    }

    forcedLogoutTimerRef.current = window.setTimeout(() => {
      void forceLocalRelogin("Session expired. Please sign in again.");
    }, remainingMs);
  }

  useEffect(() => {
    let alive = true;

    async function applySessionGate(nextSession: any, options?: { markFreshLogin?: boolean }) {
      const incoming = nextSession || null;
      const markFreshLogin = !!options?.markFreshLogin;

      if (!alive) return;

      if (!incoming) {
        clearForcedLogoutTimer();
        clearLastLoginAt();
        setSession(null);
        return;
      }

      if (markFreshLogin) {
        writeLastLoginAtNow();
        setLoginNotice("");
      }

      const lastLoginAtMs = readLastLoginAtMs();
      const ageMs = Number.isFinite(lastLoginAtMs)
        ? Date.now() - lastLoginAtMs
        : Number.POSITIVE_INFINITY;

      if (!Number.isFinite(lastLoginAtMs) || ageMs >= UIX_RELOGIN_MAX_AGE_MS) {
        await forceLocalRelogin("Session expired. Please sign in again.");
        return;
      }

      armForcedLogoutTimer(lastLoginAtMs);
      setSession(incoming);
    }

    supabase.auth.getSession().then(({ data }) => {
      void applySessionGate(data.session || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      if (evt === "SIGNED_OUT") {
        clearForcedLogoutTimer();
        clearLastLoginAt();
        setSession(null);
        return;
      }

      void applySessionGate(s, { markFreshLogin: evt === "SIGNED_IN" });
    });

    return () => {
      alive = false;
      clearForcedLogoutTimer();
      sub.subscription.unsubscribe();
    };
  }, []);

  async function sendLink() {
    if (!email.trim()) return alert("Email required");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return alert(error.message);
    alert("Magic link sent. Open your email and click the link.");
  }

  async function signOut() {
    clearForcedLogoutTimer();
    clearLastLoginAt();
    setLoginNotice("");
    await supabase.auth.signOut({ scope: "local" });
  }

  if (!session) {
    return (
      <div className="appShell loginShell">
        <div className="loginActivityBackdrop" aria-hidden="true">
          {loginActivityLanes.map((lane, laneIdx) => (
            <div
              key={`lane-${laneIdx}`}
              className={`loginActivityLane loginActivityLane${laneIdx + 1}`}
            >
              <div className="loginActivityTrack">
                {[...lane, ...lane].map((it, idx) => (
                  <div key={`${it.id}-${idx}`} className="loginGhostCard">
                    <div className="loginGhostMeta">
                      <div className="loginGhostMetaLeft">
                        <span className={loginActivityDotClass(it)} />
                        <span className="loginGhostType">{it.type}</span>
                      </div>
                      <span>{it.at}</span>
                    </div>

                    <div className="loginGhostMessage">{it.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card loginCard">
          <div className="loginBadge">Secure clinic access</div>

          <div className="brandCluster" style={{ marginBottom: 14 }}>
            <div className="brand brandLg">OrthoCall UIX</div>
            <div className="smallMuted">
              Enter your email to receive a secure magic link.
            </div>
          </div>

          {loginNotice ? <div className="loginNotice">{loginNotice}</div> : null}

          <input
            className="input"
            placeholder="you@clinic.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="loginActions">
            <button className="btn" onClick={sendLink}>
              Send magic link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell">
      <div className="topbar">
        <div className="brandCluster">
          <div className="brand brandLg">OrthoCall UIX</div>
          {clinicName ? <div className="smallMuted">Clinic: {clinicName}</div> : null}
        </div>

        <div className="rightMeta">
          <div className="badge">
            Role: {loading ? "Loading..." : humanRoleLabel(role)}
          </div>

          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      {children}
    </div>
  );
}


function humanRoleLabel(role?: string) {
  const r = String(role || "").trim().toLowerCase();
  if (r === "system_admin" || r === "admin") return "Admin";
  if (r === "clinic_admin") return "Clinic Admin";
  if (r === "clinic_operator") return "Clinic Operator";
  if (r === "clinic_viewer") return "Clinic Viewer";
  return r ? r : "Unknown";
}

export default function App() {
  const [tab, setTab] = useState<"status" | "today" | "range" | "jobs" | "crm" | "settings">("status");
  const { role } = useRole();

  // OrthoCall UIX: CRM Control sadece operator/admin/system_admin
  const canSeeCrmControl =
    role === "clinic_operator" || role === "clinic_admin" || role === "system_admin";

  // OrthoCall UIX: Settings sekmesi sadece clinic_admin + system_admin
  const canSeeSettings = role === "clinic_admin" || role === "system_admin";

  useEffect(() => {
    // Türkçe: Rol düşerse (örn. viewer) korumalı sekmelerde kalmasın.
    if (tab === "crm" && !canSeeCrmControl) setTab("status");
    if (tab === "settings" && !canSeeSettings) setTab("status");
  }, [tab, canSeeCrmControl, canSeeSettings]);

  return (
    <AuthGate>
      <div className="card mainCard">
        <div className="panelNav">
          <div className="tabs">
            <button
              className={`tabBtn ${tab === "status" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("status")}
            >
              Status
            </button>

            <button
              className={`tabBtn ${tab === "today" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("today")}
            >
              Today
            </button>

            <button
              className={`tabBtn ${tab === "range" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("range")}
            >
              Range
            </button>

            <button
              className={`tabBtn ${tab === "jobs" ? "tabBtnActive" : ""}`}
              onClick={() => setTab("jobs")}
            >
              Next Jobs
            </button>

            {canSeeCrmControl ? (
              <button
                className={`tabBtn ${tab === "crm" ? "tabBtnActive" : ""}`}
                onClick={() => setTab("crm")}
              >
                CRM Control
              </button>
            ) : null}

            {canSeeSettings ? (
              <button
                className={`tabBtn ${tab === "settings" ? "tabBtnActive" : ""}`}
                onClick={() => setTab("settings")}
              >
                Settings
              </button>
            ) : null}
          </div>
        </div>

        <div className="cardBody">
          {tab === "status" ? <StatusPage /> : null}
          {tab === "today" ? <TodayPage /> : null}
          {tab === "range" ? <RangePage /> : null}
          {tab === "jobs" ? <NextJobsPage /> : null}
          {tab === "crm" ? <CRMControlPage /> : null}
          {tab === "settings" ? <SettingsPage /> : null}
        </div>

        <div className="panelFooter">
          <span>OrthoCall by</span>
          <a href="https://veviagency.com" target="_blank" rel="noreferrer">
            VeVi Agency
          </a>
        </div>
      </div>
    </AuthGate>
  );
}
