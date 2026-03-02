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

// OrthoCall UIX: Connectivity classification
// Türkçe: UIX ekranları "OK / SERVER_DOWN / AUTH / PROXY_ERROR" gösterebilsin.
export type ConnectivityState = "OK" | "SERVER_DOWN" | "AUTH" | "PROXY_ERROR";

export function classifyOpsError(e: any): { state: ConnectivityState; detail: string } {
  const msg = (e && e.message) ? String(e.message) : String(e || "");
  const status = (e && (e as any).status) ? Number((e as any).status) : NaN;

  // Supabase session yoksa: AUTH
  if (msg === "missing_supabase_session") {
    return { state: "AUTH", detail: "AUTH: missing_supabase_session" };
  }

  // HTTP 401/403: AUTH
  if (status === 401 || status === 403) {
    return { state: "AUTH", detail: `AUTH: ops_http_${status}` };
  }

  // ops_http_* : PROXY_ERROR (proxy / ops server response error)
  if (msg.startsWith("ops_http_")) {
    // 404 gibi durumlar (OPS kapalı / route yok) da burada PROXY_ERROR olarak görünür
    return { state: "PROXY_ERROR", detail: `PROXY_ERROR: ${msg}` };
  }

  // fetch/network fail: SERVER_DOWN
  const low = msg.toLowerCase();
  if (
    low.includes("failed to fetch") ||
    low.includes("networkerror") ||
    low.includes("fetch failed") ||
    low.includes("load failed") ||
    low.includes("timeout") ||
    low.includes("abort")
  ) {
    return { state: "SERVER_DOWN", detail: `SERVER_DOWN: ${msg}` };
  }

  // default
  return { state: "PROXY_ERROR", detail: `PROXY_ERROR: ${msg}` };
}

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
    // OrthoCall UIX: bubble up server error details to help debugging
    // Türkçe: 500/403 gibi durumlarda backend'in {error:"..."} mesajını UIX'te görebilelim.
    let extra = "";
    try {
      if (payload && typeof payload === "object") {
        const eMsg = (payload as any).error || (payload as any).message || "";
        if (eMsg) extra = ` | ${String(eMsg)}`;
      } else if (typeof payload === "string" && payload.trim()) {
        extra = ` | ${payload.trim().slice(0, 200)}`;
      }
    } catch {}

    const err = new Error(`ops_http_${resp.status}${extra}`);
    (err as any).status = resp.status;
    (err as any).payload = payload;
    throw err;
  }

  return payload;
}
