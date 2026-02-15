const { sendJson, requireAuthedUser, serviceFetch, serviceSelect, serviceInsert } = require('./_common');

const OWNER_COLUMNS = ['created_by', 'created_by_user_id', 'owner_id', 'user_id'];
const ITEM_DISTRIBUTION_COLUMNS = ['distribution_id', 'task_distribution_id'];

function mapColumns(item) {
  const src = item && typeof item === 'object' ? item : {};
  const normalized = {
    caseNumber: String(src.case_number == null ? '' : src.case_number).trim(),
    site: String(src.site == null ? '' : src.site).trim(),
    description: String(src.description == null ? '' : src.description).trim(),
    assignedTo: String(src.assigned_to == null ? '' : src.assigned_to).trim(),
    deadline: String(src.deadline == null ? '' : src.deadline).trim(),
    referenceUrl: String(src.reference_url == null ? '' : src.reference_url).trim()
  };
  normalized.normalizedReferenceUrl = /^https?:\/\//i.test(normalized.referenceUrl) ? normalized.referenceUrl : '';
  return normalized;
}

function ownerIdFromDistribution(distribution) {
  const row = distribution && typeof distribution === 'object' ? distribution : {};
  for (const key of OWNER_COLUMNS) {
    const value = String(row[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function isMissingColumnError(out, key) {
  const errorText = JSON.stringify((out && (out.json || out.text)) || '').toLowerCase();
  return errorText.includes('column') && errorText.includes(String(key || '').toLowerCase());
}

function isSchemaShapeError(out) {
  const errorText = JSON.stringify((out && (out.json || out.text)) || '').toLowerCase();
  return errorText.includes('column') || errorText.includes('relation') || errorText.includes('does not exist');
}

async function queryDistributionsByOwner(uid) {
  for (const key of OWNER_COLUMNS) {
    const out = await serviceSelect('task_distributions', `select=*&${encodeURIComponent(key)}=eq.${encodeURIComponent(uid)}&order=created_at.desc`);
    if (out.ok) return { ok: true, out, ownerColumn: key };
    if (!isMissingColumnError(out, key)) return { ok: false, out, ownerColumn: key };
  }

  // Last-resort fallback: fetch recent rows without owner filter and safely filter in-memory.
  const fallback = await serviceSelect('task_distributions', 'select=*&order=created_at.desc&limit=300');
  if (!fallback.ok) {
    if (isSchemaShapeError(fallback)) return { ok: true, out: { ok: true, json: [] }, ownerColumn: '' };
    return { ok: false, out: fallback, ownerColumn: '' };
  }

  const rows = Array.isArray(fallback.json) ? fallback.json : [];
  const filtered = rows.filter((row) => ownerIdFromDistribution(row) === uid);
  return { ok: true, out: { ok: true, json: filtered }, ownerColumn: '' };
}

async function queryItemsByDistributionIds(ids) {
  if (!ids.length) return { ok: true, out: { ok: true, json: [] }, distributionColumn: ITEM_DISTRIBUTION_COLUMNS[0] };

  const encodedIds = ids.map((id) => encodeURIComponent(id)).join(',');
  for (const key of ITEM_DISTRIBUTION_COLUMNS) {
    const out = await serviceSelect('task_items', `select=id,${key},status&${encodeURIComponent(key)}=in.(${encodedIds})`);
    if (out.ok) return { ok: true, out, distributionColumn: key };
    if (!isMissingColumnError(out, key)) return { ok: false, out, distributionColumn: key };
  }

  return { ok: true, out: { ok: true, json: [] }, distributionColumn: ITEM_DISTRIBUTION_COLUMNS[0] };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];
  rows.forEach((row) => {
    const sig = [row.caseNumber, row.site, row.description, row.assignedTo, row.deadline, row.normalizedReferenceUrl]
      .map((v) => String(v || '').toLowerCase())
      .join('||');
    if (!sig || seen.has(sig)) return;
    seen.add(sig);
    deduped.push(row);
  });
  return deduped;
}

async function insertDistributionRow(title, uid) {
  for (const key of OWNER_COLUMNS) {
    const insertDist = await serviceInsert('task_distributions', [{ title, [key]: uid }]);
    if (insertDist.ok) return { ok: true, row: insertDist.json && insertDist.json[0] ? insertDist.json[0] : null };
    if (!isMissingColumnError(insertDist, key)) return { ok: false, out: insertDist };
  }

  // Fallback when owner columns vary unexpectedly; rely on DB defaults/triggers if present.
  const fallbackDist = await serviceInsert('task_distributions', [{ title }]);
  if (fallbackDist.ok) return { ok: true, row: fallbackDist.json && fallbackDist.json[0] ? fallbackDist.json[0] : null };

  return { ok: false, out: fallbackDist };
}

async function insertTaskItems(distributionId, normalizedRows) {
  const baseRows = normalizedRows.map((row) => ({
    case_number: row.caseNumber,
    site: row.site,
    description: row.description,
    assigned_to: row.assignedTo,
    deadline: row.deadline || null,
    deadline_at: row.deadline || null,
    reference_url: row.normalizedReferenceUrl || '',
    status: 'PENDING',
    remarks: ''
  }));

  for (const linkKey of ITEM_DISTRIBUTION_COLUMNS) {
    const payload = baseRows.map((row) => Object.assign({}, row, { [linkKey]: distributionId }));
    let insertItems = await serviceInsert('task_items', payload);
    if (insertItems.ok) return insertItems;

    const distributionColumnMissing = isMissingColumnError(insertItems, linkKey);
    const deadlineColumnMissing = isMissingColumnError(insertItems, 'deadline');

    if (deadlineColumnMissing) {
      const fallbackPayload = payload.map((row) => {
        const next = Object.assign({}, row);
        delete next.deadline;
        return next;
      });
      insertItems = await serviceInsert('task_items', fallbackPayload);
      if (insertItems.ok) return insertItems;
      if (!distributionColumnMissing && !isMissingColumnError(insertItems, linkKey)) return insertItems;
    }

    if (!distributionColumnMissing) return insertItems;
  }

  return { ok: false, json: null, text: 'task_item_distribution_column_not_found' };
}

async function deleteDistribution(distributionId) {
  for (const key of ITEM_DISTRIBUTION_COLUMNS) {
    const deleteItems = await serviceFetch(`/rest/v1/task_items?${encodeURIComponent(key)}=eq.${encodeURIComponent(distributionId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
    if (deleteItems.ok) break;
    if (!isMissingColumnError(deleteItems, key)) return deleteItems;
  }

  return serviceFetch(`/rest/v1/task_distributions?id=eq.${encodeURIComponent(distributionId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
}

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
    const uid = String(auth.authed.id || '');

    if (req.method === 'GET') {
      const queryRes = await queryDistributionsByOwner(uid);
      if (!queryRes.ok) {
        if (isSchemaShapeError(queryRes.out)) return sendJson(res, 200, { ok: true, rows: [] });
        return sendJson(res, 500, { ok: false, error: 'distribution_query_failed', details: queryRes.out.json || queryRes.out.text });
      }

      const rows = Array.isArray(queryRes.out.json) ? queryRes.out.json : [];
      const ids = rows.map((r) => String(r.id || '')).filter(Boolean);
      let stats = {};

      if (ids.length) {
        const itemResData = await queryItemsByDistributionIds(ids);
        if (itemResData.ok) {
          const itemRes = itemResData.out;
          const distributionColumn = itemResData.distributionColumn;
          const items = itemRes.ok && Array.isArray(itemRes.json) ? itemRes.json : [];
          stats = items.reduce((acc, it) => {
            const key = String(it[distributionColumn] || '');
            if (!acc[key]) acc[key] = { total: 0, done: 0, pending: 0 };
            acc[key].total += 1;
            if (String(it.status || '').toUpperCase() === 'DONE') acc[key].done += 1;
            else acc[key].pending += 1;
            return acc;
          }, {});
        }
      }

      return sendJson(res, 200, {
        ok: true,
        rows: rows.map((row) => {
          const x = stats[String(row.id)] || { total: 0, done: 0, pending: 0 };
          return Object.assign({}, row, { total_items: x.total, done_items: x.done, pending_items: x.pending });
        })
      });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const title = String(body.title || '').trim();
      const items = Array.isArray(body.items) ? body.items : [];
      if (!title) return sendJson(res, 400, { ok: false, error: 'missing_title' });
      if (!items.length) return sendJson(res, 400, { ok: false, error: 'missing_items' });

      const normalizedRows = dedupeRows(items
        .map((item) => mapColumns(item))
        .filter((item) => item.description && item.assignedTo));

      if (!normalizedRows.length) return sendJson(res, 400, { ok: false, error: 'valid_items_required' });

      const insertDist = await insertDistributionRow(title, uid);
      if (!insertDist.ok) return sendJson(res, 500, { ok: false, error: 'distribution_create_failed', details: insertDist.out && (insertDist.out.json || insertDist.out.text) });

      const distribution = insertDist.row;
      const distributionId = distribution && distribution.id ? distribution.id : null;
      if (!distributionId) return sendJson(res, 500, { ok: false, error: 'distribution_id_missing' });

      const insertItems = await insertTaskItems(distributionId, normalizedRows);
      if (!insertItems.ok) return sendJson(res, 500, { ok: false, error: 'task_items_create_failed', details: insertItems.json || insertItems.text });

      return sendJson(res, 200, { ok: true, distribution, items: Array.isArray(insertItems.json) ? insertItems.json : [] });
    }

    if (req.method === 'DELETE') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const queryId = req.query && req.query.distribution_id;
      const distributionId = String(body.distribution_id || queryId || '').trim();
      if (!distributionId) return sendJson(res, 400, { ok: false, error: 'missing_distribution_id' });

      const d = await serviceSelect('task_distributions', `select=*&id=eq.${encodeURIComponent(distributionId)}&limit=1`);
      if (!d.ok) return sendJson(res, 500, { ok: false, error: 'distribution_fetch_failed', details: d.json || d.text });
      const distribution = Array.isArray(d.json) && d.json[0] ? d.json[0] : null;
      if (!distribution) return sendJson(res, 404, { ok: false, error: 'distribution_not_found' });

      const ownerId = ownerIdFromDistribution(distribution);
      if (ownerId && ownerId !== uid) return sendJson(res, 403, { ok: false, error: 'forbidden' });

      const delOut = await deleteDistribution(distributionId);
      if (!delOut.ok) return sendJson(res, 500, { ok: false, error: 'distribution_delete_failed', details: delOut.json || delOut.text });

      return sendJson(res, 200, { ok: true, deleted_distribution_id: distributionId });
    }

    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'distributions_failed', message: String(err && err.message ? err.message : err) });
  }
};
