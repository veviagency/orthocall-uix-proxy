// src/lib/useRole.ts
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type Role = "clinic_viewer" | "clinic_operator" | "clinic_admin" | "system_admin";

export function useRole() {
  const [role, setRole] = useState<Role | "">("");
  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [clinicName, setClinicName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);

      const u = await supabase.auth.getUser();
      const uid = u.data?.user?.id || "";
      if (!uid) {
        if (!alive) return;
        setRole("");
        setTenantId("");
        setUserId("");
        setClinicName("");
        setLoading(false);
        return;
      }

      // RLS: user sadece kendi membership satırlarını görebiliyor (sen kurdun)
      const q = await supabase
        .from("uix_memberships")
        .select("tenant_id, role")
        .eq("user_id", uid)
        .limit(1);

      const row = (q.data && q.data[0]) ? q.data[0] as any : null;

      const r = (row?.role || "") as Role;
      const tid = String(row?.tenant_id || "").trim();

      if (!alive) return;

      setRole(r || "");
      setTenantId(tid);
      setUserId(uid);

      // opsFetch otomatik kullanacak (single tenant için bile iyi)
      try { if (tid) localStorage.setItem("uix_tenant_id", tid); } catch {}

      // OrthoCall UIX: Klinik adı (hard-coded değil) -> uix_tenants'tan okunur
      try {
        if (tid) {
          const tq = await supabase
            .from("uix_tenants")
            .select("*")
            .eq("tenant_id", tid)
            .limit(1);

          const trow = (tq.data && tq.data[0]) ? (tq.data[0] as any) : null;

          const cn = String(
            trow?.clinic_name ||
            trow?.name ||
            trow?.tenant_name ||
            trow?.display_name ||
            ""
          ).trim();

          if (alive) {
            setClinicName(cn);
            try { if (cn) localStorage.setItem("uix_clinic_name", cn); } catch {}
          }
        }
      } catch (_) {}

      setLoading(false);
    }

    run().catch(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, []);

  return { role, tenantId, userId, clinicName, loading };
}
