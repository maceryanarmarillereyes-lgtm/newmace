const { sendJson, requireAuthedUser, serviceUpdate } = require('./_common');

function normalizeTaskItemStatus(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return 'Pending';
  const upper = raw.toUpperCase();
  if (upper === 'PENDING') return 'Pending';
  if (upper === 'IN_PROGRESS' || upper === 'ONGOING') return 'Ongoing';
  if (upper === 'DONE' || upper === 'COMPLETED') return 'Completed';
  if (upper === 'WITH_PROBLEM' || upper === 'WITH PROBLEM') return 'With Problem';
  // Allow already-canonical values
  if (raw === 'Pending' || raw === 'Ongoing' || raw === 'Completed' || raw === 'With Problem') return raw;
  return raw;
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'PATCH') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(body.task_item_id || '').trim();
    if (!id) return sendJson(res, 400, { ok: false, error: 'missing_task_item_id' });

    const status = normalizeTaskItemStatus(body.status);
    const allowed = ['Pending', 'Ongoing', 'Completed', 'With Problem'];
    if (!allowed.includes(status)) return sendJson(res, 400, { ok: false, error: 'invalid_status' });

    const remarks = String(body.remarks || '');
    const problemNotes = body.problem_notes == null ? null : String(body.problem_notes);

    const patch = {
      status,
      remarks,
      updated_at: new Date().toISOString()
    };

    // Only send problem_notes if provided (schema may not have it yet)
    if (problemNotes != null) patch.problem_notes = problemNotes;

    const uid = encodeURIComponent(String(auth.authed.id || ''));
    const out = await serviceUpdate('task_items', patch, { id: `eq.${encodeURIComponent(id)}`, assigned_to: `eq.${uid}` });
    if (!out.ok) return sendJson(res, 500, { ok: false, error: 'task_item_update_failed', details: out.json || out.text });

    const row = Array.isArray(out.json) ? out.json[0] : null;
    return sendJson(res, 200, { ok: true, row });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'item_status_failed', message: String(err && err.message ? err.message : err) });
  }
};
