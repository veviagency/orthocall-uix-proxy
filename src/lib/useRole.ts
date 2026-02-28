import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type Role = "clinic_viewer" | "clinic_operator" | "clinic_admin" | "system_admin";

export function useRole() {
  const [role, setRole] = useState<Role | "">("");
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const u = await supabase.auth.getUser();
      const uid = u.data?.user?.id || "";
      if (!uid) {
        if (!alive) return;
        setRole(""); setTenantId(""); setLoading(false);
        return;
      }

      const q = await supabase
        .from("uix_memberships")
        .select("tenant_id, role")
        .eq("user_id", uid)
        .limit(1);

      const row = q.data?.[0] as any;
      const r = String(row?.role || "") as Role;
      const tid = String(row?.tenant_id || "").trim();

      if (!alive) return;

      setRole(r || "");
      setTenantId(tid);
      try { if (tid) localStorage.setItem("uix_tenant_id", tid); } catch {}
      setLoading(false);
    })().catch(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, []);

  return { role, tenantId, loading };
}
