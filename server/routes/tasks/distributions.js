const { sendJson, requireAuthedUser, serviceSelect, serviceInsert } = require('./_common');

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const uid = String(auth.authed.id || '');

    if (req.method === 'GET') {
      const out = await serviceSelect('task_distributions', `select=*&created_by=eq.${encodeURIComponent(uid)}&order=created_at.desc`);
      if (!out.ok) return sendJson(res, 500, { ok: false, error: 'distribution_query_failed', details: out.json || out.text });

      const rows = Array.isArray(out.json) ? out.json : [];
      const ids = rows.map((r) => String(r.id || '')).filter(Boolean);
      let stats = {};

      if (ids.length) {
        const itemRes = await serviceSelect('task_items', `select=id,distribution_id,status&distribution_id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`);
        const items = itemRes.ok && Array.isArray(itemRes.json) ? itemRes.json : [];
        stats = items.reduce((acc, it) => {
          const key = String(it.distribution_id || '');
          if (!acc[key]) acc[key] = { total: 0, done: 0 };
          acc[key].total += 1;
          if (String(it.status || '').toUpperCase() === 'DONE') acc[key].done += 1;
          return acc;
        }, {});
      }

      return sendJson(res, 200, {
        ok: true,
        rows: rows.map((row) => {
          const x = stats[String(row.id)] || { total: 0, done: 0 };
          return Object.assign({}, row, { total_items: x.total, done_items: x.done });
        })
      });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const title = String(body.title || '').trim();
      const items = Array.isArray(body.items) ? body.items : [];
      if (!title) return sendJson(res, 400, { ok: false, error: 'missing_title' });
      if (!items.length) return sendJson(res, 400, { ok: false, error: 'missing_items' });

      const insertDist = await serviceInsert('task_distributions', [{ title, created_by: uid }]);
      if (!insertDist.ok) return sendJson(res, 500, { ok: false, error: 'distribution_create_failed', details: insertDist.json || insertDist.text });

      const distribution = insertDist.json && insertDist.json[0] ? insertDist.json[0] : null;
      const distributionId = distribution && distribution.id ? distribution.id : null;
      if (!distributionId) return sendJson(res, 500, { ok: false, error: 'distribution_id_missing' });

      const payload = items
        .map((item) => {
          const description = String((item && item.description) || '').trim();
          const assignedTo = String((item && item.assigned_to) || '').trim();
          const deadline = item && item.deadline ? String(item.deadline) : null;
          const referenceUrl = String((item && item.reference_url) || '').trim() || null;
          if (!description || !assignedTo) return null;
          return {
            distribution_id: distributionId,
            description,
            assigned_to: assignedTo,
            deadline,
            reference_url: referenceUrl,
            status: 'PENDING',
            remarks: ''
          };
        })
        .filter(Boolean);

      if (!payload.length) return sendJson(res, 400, { ok: false, error: 'valid_items_required' });

      const insertItems = await serviceInsert('task_items', payload);
      if (!insertItems.ok) return sendJson(res, 500, { ok: false, error: 'task_items_create_failed', details: insertItems.json || insertItems.text });

      return sendJson(res, 200, { ok: true, distribution, items: Array.isArray(insertItems.json) ? insertItems.json : [] });
    }

    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'distributions_failed', message: String(err && err.message ? err.message : err) });
  }
};
