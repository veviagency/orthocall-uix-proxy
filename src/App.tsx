
// src/App.tsx - V25
import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabaseClient";
import { useRole } from "./lib/useRole";
import { StatusPage } from "./pages/StatusPage";
import { TodayPage } from "./pages/TodayPage";
import { RangePage } from "./pages/RangePage";
import { NextJobsPage } from "./pages/NextJobsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CRMControlPage } from "./pages/CRMControlPage";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<any>(null);
  const { clinicName, role, loading } = useRole();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
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
    await supabase.auth.signOut();
  }

  if (!session) {
    return (
      <div className="appShell loginShell">
        <div className="card loginCard">
          <div className="loginBadge">Secure clinic access</div>

          <div className="brandCluster" style={{ marginBottom: 14 }}>
            <div className="brand brandLg">OrthoCall UIX</div>
            <div className="smallMuted">
              Enter your email to receive a secure magic link.
            </div>
          </div>

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
