// src/lib/opsClient.ts
// OrthoCall UIX — single Ops API client (V240 Step-9)
// - UIX daima /uix-proxy üzerinden konuşur (browser asla OPS_ADMIN_KEY görmez)
// - Authorization: Bearer <supabase access_token>
// - (opsiyonel) x-uix-tenant-id header'ı: multi-tenant'e hazır

import { supabase } from "./supabaseClient";

type OpsFetchOpts = {
  method?: "GET" | "POST";
  body?: any;
};

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function getAccessTokenOrThrow() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token || "";
  if (!token) throw new Error("missing_supabase_session");
  return token;
}

async function getUserIdSafe() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || "";
  } catch {
    return "";
  }
}

function getTenantIdHint() {
  // useRole() bu değeri set edecek (single-tenant'te boş olsa da çalışır)
  try {
    return String(localStorage.getItem("uix_tenant_id") || "").trim();
  } catch {
    return "";
  }
}

export async function opsFetch(path: string, opts: OpsFetchOpts = {}) {
  const base = (import.meta as any).env?.VITE_OPS_BASE_URL || "/uix-proxy";
  const url = joinUrl(base, path);

  const method = (opts.method || "GET").toUpperCase() as "GET" | "POST";
  const token = await getAccessTokenOrThrow();
  const user_id = await getUserIdSafe();
  const tenantId = getTenantIdHint();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (tenantId) headers["x-uix-tenant-id"] = tenantId;

  let body: string | undefined = undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json; charset=utf-8";
    const payload = (opts.body && typeof opts.body === "object")
      ? { ...opts.body, ...(user_id ? { user_id } : {}) }
      : (user_id ? { user_id } : {});
    body = JSON.stringify(payload);
  }

  const resp = await fetch(url, { method, headers, body });

  const ct = resp.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  const payload = isJson ? await resp.json().catch(() => null) : await resp.text().catch(() => "");

  if (!resp.ok) {
    const err = new Error(`ops_http_${resp.status}`);
    (err as any).status = resp.status;
    (err as any).payload = payload;
    throw err;
  }

  return payload;
}
