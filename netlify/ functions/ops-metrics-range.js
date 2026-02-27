'use strict';

const { _json, _requireUserAndMembership, _roleAllowsRead, _forwardToOps } = require('./_shared');

exports.handler = async (event) => {
  try {
    const req = { headers: event.headers || {}, query: event.queryStringParameters || {} };
    const auth = await _requireUserAndMembership(req);
    if (!auth.ok) return _json(auth.status, { ok: false, error: auth.error });

    if (!_roleAllowsRead(auth.role)) return _json(403, { ok: false, error: 'role_forbidden' });

    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);

    const out = await _forwardToOps(`/ops/metrics/range?${qs.toString()}`);
    return _json(out.status, out.data);
  } catch (e) {
    return _json(500, { ok: false, error: e && e.message ? e.message : String(e) });
  }
};
