// netlify/functions/_shared.js
'use strict';

const { createClient } = require('@supabase/supabase-js');

function _getEnv(name) {
  return String(process.env[name] || '').trim();
}

function _json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(obj)
  };
}

function _getBearerToken(authHeader) {
  const a = String(authHeader || '');
  if (!a.toLowerCase().startsWith('bearer ')) return '';
  return a.slice(7).trim();
}

function _mkSupabaseAdmin() {
  const url = _getEnv('SUPABASE_URL');
  const key = _getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function _requireUserAndMembership(req) {
  const admin = _mkSupabaseAdmin();

  const token = _getBearerToken(req.headers.authorization);
  if (!token) return { ok: false, error: 'missing_user_token', status: 401 };

  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u || !u.user) return { ok: false, error: 'invalid_user_token', status: 401 };

  const user_id = u.user.id;

  // tenant seçimi: header > query
  const tenant_id = String(req.headers['x-uix-tenant-id'] || req.query.tenant_id || '').trim();
  if (!tenant_id) return { ok: false, error: 'missing_tenant_id', status: 400, user_id };

  const { data: m, error: me } = await admin
    .from('uix_memberships')
    .select('tenant_id,role')
    .eq('user_id', user_id)
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  if (me) return { ok: false, error: 'membership_lookup_failed', status: 500, user_id };
  if (!m) return { ok: false, error: 'not_a_member', status: 403, user_id };

  return { ok: true, user_id, tenant_id, role: String(m.role || '') };
}

function _roleAllowsRead(role) {
  return ['clinic_viewer', 'clinic_operator', 'clinic_admin', 'system_admin'].includes(role);
}

async function _forwardToOps(pathWithQuery) {
  const base = _getEnv('OPS_BASE_URL');
  const key = _getEnv('OPS_ADMIN_KEY');
  if (!base || !key) throw new Error('OPS_BASE_URL / OPS_ADMIN_KEY missing');

  const url = base.replace(/\/$/, '') + pathWithQuery;

  const r = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}` }
  });

  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = { ok: false, raw: text }; }

  return { status: r.status, data };
}

module.exports = {
  _json,
  _requireUserAndMembership,
  _roleAllowsRead,
  _forwardToOps
};
