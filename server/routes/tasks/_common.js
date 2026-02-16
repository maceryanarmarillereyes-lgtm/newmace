const { getUserFromJwt, getProfileForUserId, serviceFetch, serviceSelect, serviceInsert, serviceUpdate } = require('../../lib/supabase');

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function requireAuthedUser(req) {
  const auth = String((req && req.headers && req.headers.authorization) || '');
  const jwt = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  const authed = await getUserFromJwt(jwt);
  if (!authed) return null;
  const profile = await getProfileForUserId(authed.id);
  return { authed, profile };
}

function roleFlags(roleRaw) {
  const role = String(roleRaw || '').toUpperCase();
  return {
    isAdmin: role === 'SUPER_ADMIN' || role === 'SUPER_USER' || role === 'ADMIN',
    isLead: role === 'TEAM_LEAD'
  };
}

function escLike(v) {
  return encodeURIComponent(String(v || '').replace(/%/g, '\\%').replace(/,/g, '\\,'));
}

module.exports = {
  sendJson,
  requireAuthedUser,
  roleFlags,
  escLike,
  serviceFetch,
  serviceSelect,
  serviceInsert,
  serviceUpdate
};
