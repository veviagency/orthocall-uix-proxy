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
      <div style={{ padding: 16, maxWidth: 520 }}>
        <h2>Login</h2>
        <p>Enter your email to receive a magic link.</p>
        <input
          style={{ width: "100%", padding: 10 }}
          placeholder="you@clinic.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button style={{ marginTop: 10 }} onClick={sendLink}>Send magic link</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: 12, borderBottom: "1px solid #444", display: "flex", justifyContent: "space-between" }}>
        <div>Logged in</div>
        <button onClick={signOut}>Sign out</button>
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
      <div style={{ padding: 12, borderBottom: "1px solid #444", display: "flex", gap: 8 }}>
        <button onClick={() => setTab("status")}>Status</button>
        <button onClick={() => setTab("today")}>Today</button>
        <button onClick={() => setTab("range")}>Range</button>
        <button onClick={() => setTab("jobs")}>Next Jobs</button>
        <div style={{ marginLeft: "auto", opacity: 0.8 }}>
          role: {loading ? "loading..." : (role || "none")}
        </div>
      </div>

      {tab === "status" ? <StatusPage /> : null}
      {tab === "today" ? <TodayPage /> : null}
      {tab === "range" ? <RangePage /> : null}
      {tab === "jobs" ? <NextJobsPage /> : null}
    </AuthGate>
  );
}
