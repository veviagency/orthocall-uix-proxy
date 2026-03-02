import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabaseClient";
import { useRole } from "./lib/useRole";
import { StatusPage } from "./pages/StatusPage";
import { TodayPage } from "./pages/TodayPage";
import { RangePage } from "./pages/RangePage";
import { NextJobsPage } from "./pages/NextJobsPage";

function AuthGate({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<any>(null);
  const { clinicName } = useRole();

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
      <div className="appShell">
        <div className="card" style={{ maxWidth: 520, margin: "40px auto" }}>
          <h2>Login</h2>
          <p>Enter your email to receive a magic link.</p>

          <input
            className="input"
            placeholder="you@clinic.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button className="btn" style={{ marginTop: 10 }} onClick={sendLink}>
            Send magic link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell">
      <div className="topbar">
        <div>
          <div className="brand">OrthoCall UIX</div>
          {clinicName ? <div className="smallMuted">Clinic: {clinicName}</div> : null}
        </div>
        <div className="rightMeta">
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"status" | "today" | "range" | "jobs">("status");
  const { role, loading } = useRole();

  return (
    <AuthGate>
      <div className="card mainCard">
        <div className="hRow">
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
          </div>

          <div className="badge">role: {loading ? "loading..." : role || "none"}</div>
        </div>

        <div className="cardBody">
          {tab === "status" ? <StatusPage /> : null}
          {tab === "today" ? <TodayPage /> : null}
          {tab === "range" ? <RangePage /> : null}
          {tab === "jobs" ? <NextJobsPage /> : null}
        </div>

        <div className="panelFooter">
          <span>OrthoCall by</span>
          <a href="https://veviagency.com" target="_blank" rel="noreferrer">VeVi Agency</a>
        </div>
      </div>
    </AuthGate>
  );
}
