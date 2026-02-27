'use strict';

const { _json, _requireUserAndMembership, _roleAllowsRead, _forwardToOps } = require('./_shared');

exports.handler = async (event) => {
  try {
    const req = { headers: event.headers || {}, query: event.queryStringParameters || {} };
    const auth = await _requireUserAndMembership(req);
    if (!auth.ok) return _json(auth.status, { ok: false, error: auth.error });

    if (!_roleAllowsRead(auth.role)) return _json(403, { ok: false, error: 'role_forbidden' });

    // tenant -> clinic mapping: şimdilik 1:1 kabul edelim
    // Türkçe: İleride tenant_id -> clinic_id map tablosu eklenecek.
    const clinic_id = String(req.query.clinic_id || '').trim();

    const q = clinic_id ? `?clinic_id=${encodeURIComponent(clinic_id)}` : '';
    const out = await _forwardToOps(`/ops/status${q}`);
    return _json(out.status, out.data);
  } catch (e) {
    return _json(500, { ok: false, error: e && e.message ? e.message : String(e) });
  }
};
