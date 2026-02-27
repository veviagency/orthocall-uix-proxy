'use strict';

const { _json, _requireUserAndMembership, _roleAllowsRead, _forwardToOps } = require('./_shared');

exports.handler = async (event) => {
  try {
    const req = { headers: event.headers || {}, query: event.queryStringParameters || {} };
    const auth = await _requireUserAndMembership(req);
    if (!auth.ok) return _json(auth.status, { ok: false, error: auth.error });

    if (!_roleAllowsRead(auth.role)) return _json(403, { ok: false, error: 'role_forbidden' });

    const limit = String(req.query.limit || '3').trim();
    const clinic_id = String(req.query.clinic_id || '').trim();

    const qs = new URLSearchParams();
    if (limit) qs.set('limit', limit);
    if (clinic_id) qs.set('clinic_id', clinic_id);

    const out = await _forwardToOps(`/ops/next-jobs?${qs.toString()}`);
    return _json(out.status, out.data);
  } catch (e) {
    return _json(500, { ok: false, error: e && e.message ? e.message : String(e) });
  }
};
