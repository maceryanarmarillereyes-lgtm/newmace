const { sendJson, requireAuthedUser, serviceFetch, serviceSelect, serviceInsert } = require('./_common');

const OWNER_COLUMNS = ['created_by', 'created_by_user_id', 'owner_id', 'user_id'];
const ITEM_DISTRIBUTION_COLUMNS = ['distribution_id', 'task_distribution_id'];

function ownerIdFromDistribution(distribution) {
  const row = distribution && typeof distribution === 'object' ? distribution : {};
  for (const key of OWNER_COLUMNS) {
    const value = String(row[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function sanitizeCell(value, fallback = '') {
  const out = String(value == null ? '' : value).trim();
  return out || fallback;
}

function normalizeReferenceUrl(value) {
  const url = sanitizeCell(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

function normalizeDeadlineAt(value) {
  const raw = sanitizeCell(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  const shortMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (shortMatch) {
    const mm = Number(shortMatch[1]);
    const dd = Number(shortMatch[2]);
    const yyyy = shortMatch[3].length === 2 ? 2000 + Number(shortMatch[3]) : Number(shortMatch[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    const valid = d.getUTCFullYear() === yyyy && d.getUTCMonth() + 1 === mm && d.getUTCDate() === dd;
    if (valid) return d.toISOString();
  }

  return null;
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const sig = [row.caseNumber, row.site, row.description, row.assignedTo, row.deadline, row.referenceUrl]
      .map((v) => String(v || '').toLowerCase())
      .join('||');
    if (!sig || seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

function normalizeIncomingRows(items) {
  const normalized = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    const src = item && typeof item === 'object' ? item : {};
    const row = {
      caseNumber: sanitizeCell(src.case_number, 'N/A'),
      site: sanitizeCell(src.site, 'N/A'),
      description: sanitizeCell(src.description, ''),
      assignedTo: sanitizeCell(src.assigned_to, ''),
      deadline: sanitizeCell(src.deadline, ''),
      referenceUrl: normalizeReferenceUrl(src.reference_url)
    };

    if (!row.description || !row.assignedTo) return;
    normalized.push(row);
  });

  return dedupeRows(normalized);
}

async function queryDistributionsByOwner(uid) {
  for (const key of OWNER_COLUMNS) {
    const out = await serviceSelect('task_distributions', `select=*&${encodeURIComponent(key)}=eq.${encodeURIComponent(uid)}&order=created_at.desc`);
    if (out.ok) return out;
  }
  return { ok: false, json: null, text: 'owner_column_not_found' };
}

async function queryItemsForDistributionIds(ids) {
  if (!ids.length) return { items: [], distributionColumn: ITEM_DISTRIBUTION_COLUMNS[0] };

  const encodedIds = ids.map((id) => encodeURIComponent(id)).join(',');
  for (const key of ITEM_DISTRIBUTION_COLUMNS) {
    const out = await serviceSelect('task_items', `select=id,status,${key}&${encodeURIComponent(key)}=in.(${encodedIds})`);
    if (out.ok) return { items: Array.isArray(out.json) ? out.json : [], distributionColumn: key };
  }

  return { items: [], distributionColumn: ITEM_DISTRIBUTION_COLUMNS[0] };
}

async function insertDistributionRow(title, uid) {
  for (const ownerKey of OWNER_COLUMNS) {
    const out = await serviceInsert('task_distributions', [{ title, [ownerKey]: uid }]);
    if (out.ok) return { row: out.json && out.json[0] ? out.json[0] : null, ownerKey };

    const errorText = JSON.stringify(out.json || out.text || '').toLowerCase();
    const missingOwnerColumn = errorText.includes('column') && errorText.includes(ownerKey.toLowerCase());
    if (!missingOwnerColumn) return { row: null, ownerKey, error: out.json || out.text || 'distribution_insert_failed' };
  }

  return { row: null, ownerKey: OWNER_COLUMNS[0], error: 'distribution_owner_column_not_found' };
}

async function insertTaskItems(distributionId, rows) {
  const payloadBase = rows.map((row) => {
    const deadlineText = sanitizeCell(row.deadline);
    return {
      case_number: row.caseNumber,
      case_no: row.caseNumber,
      site: row.site,
      description: row.description,
      assigned_to: row.assignedTo,
      assignee_user_id: row.assignedTo,
      deadline: deadlineText || null,
      due_at: normalizeDeadlineAt(deadlineText),
      deadline_at: normalizeDeadlineAt(deadlineText),
      reference_url: row.referenceUrl,
      status: 'PENDING',
      remarks: ''
    };
  });

  const optionalColumns = ['case_no', 'assignee_user_id', 'deadline', 'due_at', 'deadline_at', 'reference_url', 'remarks'];
  const requiredColumns = ['case_number', 'site', 'description', 'assigned_to', 'status'];
  const buildPayload = (distributionKey, dropColumns) => payloadBase.map((item) => {
    const next = {};
    [...requiredColumns, ...optionalColumns].forEach((column) => {
      if (dropColumns.has(column)) return;
      if (!Object.prototype.hasOwnProperty.call(item, column)) return;
      const value = item[column];
      if (value === '') return;
      next[column] = value;
    });
    next[distributionKey] = distributionId;
    return next;
  });

  const extractMissingColumn = (errorText) => {
    const match = errorText.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?task_items"?\s+does\s+not\s+exist/);
    return match ? String(match[1] || '').trim() : '';
  };

  for (const distributionKey of ITEM_DISTRIBUTION_COLUMNS) {
    const dropColumns = new Set();
    while (true) {
      const payload = buildPayload(distributionKey, dropColumns);
      const out = await serviceInsert('task_items', payload);
      if (out.ok) return { ok: true, out };

      const errText = JSON.stringify(out.json || out.text || '');
      const err = errText.toLowerCase();
      const missingDistributionKey = err.includes('column') && err.includes(distributionKey.toLowerCase());
      if (missingDistributionKey) break;

      const missingColumn = extractMissingColumn(errText);
      if (missingColumn && !dropColumns.has(missingColumn)) {
        dropColumns.add(missingColumn);
        continue;
      }

      if ((err.includes('invalid input syntax') || err.includes('date/time field value out of range')) && !dropColumns.has('deadline_at')) {
        dropColumns.add('deadline_at');
        dropColumns.add('due_at');
        continue;
      }

      return { ok: false, out };
    }
  }

  return { ok: false, out: { json: null, text: 'task_item_distribution_column_not_found' } };
}

async function rollbackDistribution(distributionId) {
  for (const key of ITEM_DISTRIBUTION_COLUMNS) {
    await serviceFetch(`/rest/v1/task_items?${encodeURIComponent(key)}=eq.${encodeURIComponent(distributionId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
  }

  await serviceFetch(`/rest/v1/task_distributions?id=eq.${encodeURIComponent(distributionId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
}

async function deleteDistribution(distributionId) {
  for (const key of ITEM_DISTRIBUTION_COLUMNS) {
    const out = await serviceFetch(`/rest/v1/task_items?${encodeURIComponent(key)}=eq.${encodeURIComponent(distributionId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
    if (out.ok) break;

    const err = JSON.stringify(out.json || out.text || '').toLowerCase();
    const missingColumn = err.includes('column') && err.includes(key.toLowerCase());
    if (!missingColumn) return out;
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
      const out = await queryDistributionsByOwner(uid);
      if (!out.ok) return sendJson(res, 500, { ok: false, error: 'distribution_query_failed', details: out.json || out.text });

      const rows = Array.isArray(out.json) ? out.json : [];
      const ids = rows.map((r) => String(r.id || '')).filter(Boolean);
      const itemData = await queryItemsForDistributionIds(ids);

      const groupedStats = itemData.items.reduce((acc, item) => {
        const distributionId = String(item[itemData.distributionColumn] || '');
        if (!distributionId) return acc;

        const status = String(item.status || 'PENDING').toUpperCase();
        if (!acc[distributionId]) acc[distributionId] = { total_count: 0, pending_count: 0, done_count: 0 };
        acc[distributionId].total_count += 1;
        if (status === 'DONE') acc[distributionId].done_count += 1;
        else acc[distributionId].pending_count += 1;
        return acc;
      }, {});

      return sendJson(res, 200, {
        ok: true,
        rows: rows.map((row) => {
          const stats = groupedStats[String(row.id)] || { total_count: 0, pending_count: 0, done_count: 0 };
          return Object.assign({}, row, {
            distribution_id: String(row.id || ''),
            total_count: stats.total_count,
            pending_count: stats.pending_count,
            done_count: stats.done_count,
            total_items: stats.total_count,
            pending_items: stats.pending_count,
            done_items: stats.done_count
          });
        })
      });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const title = sanitizeCell(body.title);
      const normalizedRows = normalizeIncomingRows(body.items);

      if (!title) return sendJson(res, 400, { ok: false, error: 'missing_title' });
      if (!normalizedRows.length) return sendJson(res, 400, { ok: false, error: 'valid_items_required' });

      const created = await insertDistributionRow(title, uid);
      if (!created.row) {
        return sendJson(res, 500, {
          ok: false,
          error: 'distribution_create_failed',
          details: created.error || 'distribution_insert_failed'
        });
      }

      const distributionId = String(created.row.id || '');
      if (!distributionId) {
        return sendJson(res, 500, {
          ok: false,
          error: 'distribution_id_missing'
        });
      }

      const insertedItems = await insertTaskItems(distributionId, normalizedRows);
      if (!insertedItems.ok) {
        await rollbackDistribution(distributionId);
        return sendJson(res, 500, {
          ok: false,
          error: 'task_items_create_failed',
          details: insertedItems.out && (insertedItems.out.json || insertedItems.out.text)
        });
      }

      return sendJson(res, 200, {
        ok: true,
        distribution: created.row,
        items: Array.isArray(insertedItems.out.json) ? insertedItems.out.json : []
      });
    }

    if (req.method === 'DELETE') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const queryId = req.query && req.query.distribution_id;
      const distributionId = sanitizeCell(body.distribution_id || queryId);
      if (!distributionId) return sendJson(res, 400, { ok: false, error: 'missing_distribution_id' });

      const selected = await serviceSelect('task_distributions', `select=*&id=eq.${encodeURIComponent(distributionId)}&limit=1`);
      if (!selected.ok) return sendJson(res, 500, { ok: false, error: 'distribution_fetch_failed', details: selected.json || selected.text });

      const distribution = Array.isArray(selected.json) && selected.json[0] ? selected.json[0] : null;
      if (!distribution) return sendJson(res, 404, { ok: false, error: 'distribution_not_found' });

      const ownerId = ownerIdFromDistribution(distribution);
      if (ownerId && ownerId !== uid) return sendJson(res, 403, { ok: false, error: 'forbidden' });

      const deleted = await deleteDistribution(distributionId);
      if (!deleted.ok) return sendJson(res, 500, { ok: false, error: 'distribution_delete_failed', details: deleted.json || deleted.text });

      return sendJson(res, 200, { ok: true, deleted_distribution_id: distributionId });
    }

    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'distributions_failed', message: String(err && err.message ? err.message : err) });
  }
};
