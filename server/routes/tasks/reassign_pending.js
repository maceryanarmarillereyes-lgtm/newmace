const { sendJson, requireAuthedUser, roleFlags, serviceSelect, serviceUpdate } = require('./_common');

function isUuid(v){
  return /^[0-9a-fA-F-]{20,}$/.test(String(v||''));
}

function normalizeStatus(raw){
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'completed') return 'Completed';
  if (s === 'ongoing') return 'Ongoing';
  if (s === 'with problem' || s === 'with_problem') return 'With Problem';
  return raw;
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const flags = roleFlags(auth.profile && auth.profile.role);
    if (!flags.isAdmin && !flags.isLead) return sendJson(res, 403, { ok: false, error: 'forbidden' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const distributionId = String(body.distribution_id || '').trim();
    const fromUserId = String(body.from_user_id || '').trim();
    const toUserId = String(body.to_user_id || '').trim();
    const selectedItemIds = Array.isArray(body.selected_item_ids)
      ? body.selected_item_ids.map((id) => String(id || '').trim()).filter((id) => isUuid(id))
      : [];

    if (!distributionId || !isUuid(distributionId)) return sendJson(res, 400, { ok: false, error: 'invalid_distribution_id' });
    if (!fromUserId || !isUuid(fromUserId)) return sendJson(res, 400, { ok: false, error: 'invalid_from_user_id' });
    if (!toUserId || !isUuid(toUserId)) return sendJson(res, 400, { ok: false, error: 'invalid_to_user_id' });
    if (fromUserId === toUserId) return sendJson(res, 400, { ok: false, error: 'same_user' });
    if (!selectedItemIds.length) return sendJson(res, 400, { ok: false, error: 'invalid_selected_item_ids' });

    // Ensure the distribution exists.
    const dOut = await serviceSelect('task_distributions', `select=*&id=eq.${encodeURIComponent(distributionId)}&limit=1`);
    if (!dOut.ok) return sendJson(res, 500, { ok: false, error: 'distribution_fetch_failed', details: dOut.json || dOut.text });
    const dist = Array.isArray(dOut.json) && dOut.json[0] ? dOut.json[0] : null;
    if (!dist) return sendJson(res, 404, { ok: false, error: 'distribution_not_found' });

    // Only transfer SELECTED + PENDING tasks.
    const status = 'Pending';
    const selectedIn = selectedItemIds.join(',');

    // 1) Update pending selected tasks that have no transfer history yet: set transferred_from.
    const matchBase = `distribution_id=eq.${encodeURIComponent(distributionId)}&assigned_to=eq.${encodeURIComponent(fromUserId)}&status=eq.${encodeURIComponent(status)}&id=in.(${selectedIn})`;

    let moved = 0;

    let out1 = await serviceUpdate('task_items', `${matchBase}&transferred_from=is.null`, {
      assigned_to: toUserId,
      transferred_from: fromUserId
    });
    if (out1.ok && Array.isArray(out1.json)) moved += out1.json.length;

    // 2) Update remaining selected pending tasks (already have transfer history): only set assigned_to.
    let out2 = await serviceUpdate('task_items', `${matchBase}&transferred_from=not.is.null`, {
      assigned_to: toUserId
    });
    if (out2.ok && Array.isArray(out2.json)) moved += out2.json.length;

    // Fallback for legacy schema column name task_distribution_id
    if (!out1.ok && !out2.ok) {
      const legacyMatch = `task_distribution_id=eq.${encodeURIComponent(distributionId)}&assigned_to=eq.${encodeURIComponent(fromUserId)}&status=eq.${encodeURIComponent(status)}&id=in.(${selectedIn})`;
      out1 = await serviceUpdate('task_items', `${legacyMatch}&transferred_from=is.null`, {
        assigned_to: toUserId,
        transferred_from: fromUserId
      });
      if (out1.ok && Array.isArray(out1.json)) moved += out1.json.length;
      out2 = await serviceUpdate('task_items', `${legacyMatch}&transferred_from=not.is.null`, {
        assigned_to: toUserId
      });
      if (out2.ok && Array.isArray(out2.json)) moved += out2.json.length;
    }

    // If the schema is missing columns (e.g. transferred_from), serviceUpdate may fail.
    // In that case, at least attempt to move selected pending tasks.
    if (moved === 0) {
      const patchOnly = await serviceUpdate('task_items', matchBase, { assigned_to: toUserId });
      if (patchOnly.ok && Array.isArray(patchOnly.json)) moved += patchOnly.json.length;
    }

    return sendJson(res, 200, { ok: true, distribution_id: distributionId, moved });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'reassign_failed', message: String(err && err.message ? err.message : err) });
  }
};
