// src/lib/opsFetch.ts
// OrthoCall UIX - single ops gateway client (proxy üzerinden)
//
// Türkçe: UIX tüm ops isteklerini buradan yapar.
// - Bearer token: Supabase session access_token
// - Base: VITE_UIX_PROXY_BASE (örn: /uix-proxy)

import { supabase } from './supabaseClient'; // <-- sende supabase client neredeyse burayı değiştir

export class OpsHttpError extends Error {
  status: number;
  code?: string;
  details?: any;
  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = 'OpsHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function joinUrl(base: string, path: string) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '');
  return `${b}/${p}`;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new OpsHttpError('auth_session_error', 401, 'auth_session_error', error);
  const token = data?.session?.access_token || '';
  if (!token) throw new OpsHttpError('missing_token', 401, 'missing_token');
  return token;
}

type OpsFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function opsFetch<T = any>(path: string, opts: OpsFetchOptions = {}): Promise<T> {
  const base = String(import.meta.env.VITE_UIX_PROXY_BASE || '/uix-proxy');
  const url = joinUrl(base, path);

  const token = await getAccessToken();

  const method = opts.method || 'GET';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...opts.headers,
  };

  let body: any = undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body, signal: opts.signal });

  // boş body ihtimali (204 vs)
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text };
  }

  if (!res.ok) {
    // proxy’nin döndüğü hata shape’i (ör: {error:{code,message}}) varsa yakala
    const code = json?.error?.code || json?.code;
    const msg = json?.error?.message || json?.message || `http_${res.status}`;
    throw new OpsHttpError(msg, res.status, code, json);
  }

  return json as T;
}
