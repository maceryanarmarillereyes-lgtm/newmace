/**
 * Cloudflare Pages Functions router for /api/*
 *
 * This adapts Fetch API Request/Response into the Node-style (req, res)
 * handlers that live under /server/routes (same code used by Vercel).
 *
 * IMPORTANT:
 * - We shim process.env from context.env so existing server code works.
 * - We provide req.bodyText so routes that parse body can work without Node streams.
 */

import envRoute from '../../server/routes/env.js';
import healthRoute from '../../server/routes/health.js';
import debugLogRoute from '../../server/routes/debug/log.js';
import keepAliveRoute from '../../server/routes/keep_alive.js';

import mailboxAssignRoute from '../../server/routes/mailbox/assign.js';
import mailboxConfirmRoute from '../../server/routes/mailbox/confirm.js';

import mailboxOverrideGetRoute from '../../server/routes/mailbox_override/get.js';
import mailboxOverrideSetRoute from '../../server/routes/mailbox_override/set.js';

import presenceHeartbeatRoute from '../../server/routes/presence/heartbeat.js';
import presenceListRoute from '../../server/routes/presence/list.js';

import syncPushRoute from '../../server/routes/sync/push.js';

import usersCreateRoute from '../../server/routes/users/create.js';
import usersDeleteRoute from '../../server/routes/users/delete.js';
import usersEnsureProfileRoute from '../../server/routes/users/ensure_profile.js';
import usersListRoute from '../../server/routes/users/list.js';
import usersMeRoute from '../../server/routes/users/me.js';
import usersRemoveAvatarRoute from '../../server/routes/users/remove_avatar.js';
import usersResolveEmailRoute from '../../server/routes/users/resolve_email.js';
import usersUpdateMeRoute from '../../server/routes/users/update_me.js';
import usersUpdateUserRoute from '../../server/routes/users/update_user.js';
import usersUploadAvatarRoute from '../../server/routes/users/upload_avatar.js';

const ROUTES = {
  'env': envRoute,
  'health': healthRoute,
  'debug/log': debugLogRoute,

  'keep_alive': keepAliveRoute,
  'keep_alive.js': keepAliveRoute,

  'mailbox/assign': mailboxAssignRoute,
  'mailbox/confirm': mailboxConfirmRoute,

  'mailbox_override/get': mailboxOverrideGetRoute,
  'mailbox_override/set': mailboxOverrideSetRoute,

  'presence/heartbeat': presenceHeartbeatRoute,
  'presence/list': presenceListRoute,

  'sync/push': syncPushRoute,

  'users/create': usersCreateRoute,
  'users/delete': usersDeleteRoute,
  'users/ensure_profile': usersEnsureProfileRoute,
  'users/list': usersListRoute,
  'users/me': usersMeRoute,
  'users/remove_avatar': usersRemoveAvatarRoute,
  'users/resolve_email': usersResolveEmailRoute,
  'users/update_me': usersUpdateMeRoute,
  'users/update_user': usersUpdateUserRoute,
  'users/upload_avatar': usersUploadAvatarRoute,
};

function normalizePath(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) raw = raw.join('/');
  raw = String(raw);
  raw = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  return raw;
}

function toNodeHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) out[k.toLowerCase()] = v;
  return out;
}

class NodeLikeRes {
  constructor() {
    this.statusCode = 200;
    this._headers = {};
    this._body = '';
  }
  setHeader(name, value) {
    this._headers[String(name).toLowerCase()] = String(value);
  }
  getHeader(name) {
    return this._headers[String(name).toLowerCase()];
  }
  end(chunk) {
    if (chunk !== undefined) this._body += String(chunk);
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  // Shim process.env for server code that expects it (Vercel-style).
  if (!globalThis.process) globalThis.process = { env: {} };
  if (!globalThis.process.env) globalThis.process.env = {};
  // Only copy string values.
  for (const [k, v] of Object.entries(env || {})) {
    globalThis.process.env[k] = String(v);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const routeKey = normalizePath(path);

  const handler = ROUTES[routeKey];
  if (!handler) {
    return new Response(JSON.stringify({ ok: false, error: 'not_found', route: routeKey }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  // Build Node-like req/res
  const nodeReq = {
    method: request.method,
    headers: toNodeHeaders(request.headers),
    url: url.pathname + url.search, // Node routes use this with new URL(req.url, 'http://localhost')
    bodyText: undefined,
  };

  // Provide body for routes that parse JSON/form.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try { nodeReq.bodyText = await request.text(); } catch (_) { /* ignore */ }
  }

  const nodeRes = new NodeLikeRes();

  try {
    await handler(nodeReq, nodeRes);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: 'handler_error', message: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const headers = new Headers(nodeRes._headers);
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');

  return new Response(nodeRes._body || '', { status: nodeRes.statusCode || 200, headers });
}
