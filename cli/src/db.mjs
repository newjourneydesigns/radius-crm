// Tiny PostgREST client over fetch — no SDK dependency.
// Service role key bypasses RLS, so this CLI has full read/write.

import { resolveCreds } from './env.mjs';

let _creds;
function creds() {
  if (!_creds) _creds = resolveCreds();
  return _creds;
}

function headers(extra = {}) {
  const { serviceKey } = creds();
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function buildUrl(table, params = {}) {
  const { url } = creds();
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((vv) => qp.append(k, vv));
    else qp.append(k, v);
  }
  const qs = qp.toString();
  return `${url}/rest/v1/${table}${qs ? `?${qs}` : ''}`;
}

async function request(method, table, { params = {}, body, prefer } = {}) {
  const res = await fetch(buildUrl(table, params), {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch {}
    throw new Error(`PostgREST ${method} ${table} ${res.status}: ${msg}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const db = {
  async select(table, { filters = {}, select = '*', order, limit } = {}) {
    const params = { select, ...filters };
    if (order) params.order = order;
    if (limit) params.limit = String(limit);
    return request('GET', table, { params });
  },
  async insert(table, body) {
    return request('POST', table, { body, prefer: 'return=representation' });
  },
  async update(table, filters, body) {
    return request('PATCH', table, {
      params: filters,
      body,
      prefer: 'return=representation',
    });
  },
  async delete(table, filters) {
    return request('DELETE', table, {
      params: filters,
      prefer: 'return=representation',
    });
  },
};
