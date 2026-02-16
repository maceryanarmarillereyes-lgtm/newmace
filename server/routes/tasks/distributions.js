const { sendJson, requireAuthedUser, serviceFetch, serviceSelect, serviceInsert } = require('./_common');

// NOTE: This endpoint intentionally supports multiple schema variants.
// Some environments use different column names for "owner" and metadata.
const OWNER_COLUMNS = [
  'created_by',
  'created_by_user_id',
  'created_by_id',
  'creator_id',
  'owner_id',
  'owner_uuid',
  'user_id'
];

const TITLE_COLUMNS = ['title', 'project_title', 'project_name', 'name'];
const DESCRIPTION_COLUMNS = ['description', 'project_description', 'details'];
const REFERENCE_COLUMNS = ['reference_url', 'work_instruction_url', 'work_instruction_link', 'link', 'url'];
const STATUS_COLUMNS = ['status', 'state'];
const ITEM_DISTRIBUTION_COLUMNS = ['distribution_id', 'task_distribution_id', 'batch_id'];

function ownerIdFromDistribution(distribution) {
  const row = distribution && typeof distribution === 'object' ? distribution : {};
  for (const key of OWNER_COLUMNS) {
    const value = String(row[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function isSchemaShapeError(out) {
  const status = Number(out && out.status);
  const text = JSON.stringify((out && (out.json || out.text)) || '').toLowerCase();
  return status === 404 || text.includes('does not exist') || text.includes('undefined_table') || text.includes('relation');
}

function sanitizeCell(value, fallback = '') {
  const out = String(value == null ? '' : value).trim();
  return out || fallback;
}

function normalizeStatus(value) {
  const s = String(value || '').toUpperCase();
  if (s === 'COMPLETED') return 'COMPLETED';
  return 'ONGOING';
}

function normalizeReferenceUrl(value) {
  const url = sanitizeCell(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

function normalizeDeadlineAt(value) {
  const raw = sanitizeCell(value);
  if (!raw) return null;

  const shortMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (shortMatch) {
    const mm = Number(shortMatch[1]);
    const dd = Number(shortMatch[2]);
    const yyyy = shortMatch[3].length === 2 ? 2000 + Number(shortMatch[3]) : Number(shortMatch[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    const valid = d.getUTCFullYear() === yyyy && d.getUTCMonth() + 1 === mm && d.getUTCDate() === dd;
    if (valid) return d.toISOString();
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return null;
}

function normalizeDeadlineDate(value) {
  const iso = normalizeDeadlineAt(value);
  if (!iso) return null;
  return iso.slice(0, 10);
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

function normalizeIncomingRows(items, globalDescription, globalReferenceUrl) {
  const normalized = [];
  const defaultDescription = sanitizeCell(globalDescription, 'N/A');
  const defaultReferenceUrl = normalizeReferenceUrl(globalReferenceUrl);

  (Array.isArray(items) ? items : []).forEach((item) => {
    const src = item && typeof item === 'object' ? item : {};
    const row = {
      caseNumber: sanitizeCell(src.case_number, 'N/A'),
      site: sanitizeCell(src.site, 'N/A'),
      description: sanitizeCell(src.description, defaultDescription),
      assignedTo: sanitizeCell(src.assigned_to, ''),
      deadline: sanitizeCell(src.deadline, ''),
      referenceUrl: normalizeReferenceUrl(src.reference_url) || defaultReferenceUrl
    };

    if (!row.description || !row.assignedTo) return;
    normalized.push(row);
  });

  return dedupeRows(normalized);
}

async function queryDistributionsByOwner(uid) {
  let lastOut = null;
  for (const key of OWNER_COLUMNS) {
    const out = await serviceSelect('task_distributions', `select=*&${encodeURIComponent(key)}=eq.${encodeURIComponent(uid)}&order=created_at.desc`);
    lastOut = out;
    if (out.ok) return out;
  }
  return lastOut || { ok: false, json: null, text: 'owner_column_not_found' };
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

async function insertDistributionRow(title, uid, metadata) {
  const base = {
    title,
    description: sanitizeCell(metadata && metadata.description, ''),
    reference_url: normalizeReferenceUrl(metadata && metadata.reference_url),
    status: normalizeStatus(metadata && metadata.status)
  };

  const errTextOf = (out) => JSON.stringify(out && (out.json || out.text) ? (out.json || out.text) : '');

  const extractMissingColumn = (errorText) => {
    const match = errorText.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?task_distributions"?\s+does\s+not\s+exist/i);
    return match ? String(match[1] || '').trim() : '';
  };

  const extractNotNullColumn = (errorText) => {
    const match = errorText.match(/null\s+value\s+in\s+column\s+"?([a-zA-Z0-9_]+)"?\s+violates\s+not-null\s+constraint/i);
    return match ? String(match[1] || '').trim() : '';
  };

  const isSchemaMissing = (errorText) => {
    const t = String(errorText || '').toLowerCase();
    return t.includes('does not exist') || t.includes('undefined_table') || t.includes('relation') || t.includes('not found');
  };

  for (const ownerKey of OWNER_COLUMNS) {
    // Try multiple possible "title" columns (some DBs use project_title, etc.).
    for (let titleIdx = 0; titleIdx < TITLE_COLUMNS.length; titleIdx += 1) {
      const col = {
        title: TITLE_COLUMNS[titleIdx],
        description: DESCRIPTION_COLUMNS[0],
        reference_url: REFERENCE_COLUMNS[0],
        status: STATUS_COLUMNS[0]
      };

      const dropColumns = new Set();
      const forced = {}; // columns forced by NOT NULL constraints

      while (true) {
        const row = { [ownerKey]: uid };

        // Title is required.
        if (!dropColumns.has(col.title)) row[col.title] = base.title;

        // Optional metadata.
        if (base.description && !dropColumns.has(col.description)) row[col.description] = base.description;
        if (base.reference_url && !dropColumns.has(col.reference_url)) row[col.reference_url] = base.reference_url;
        if (base.status && !dropColumns.has(col.status)) row[col.status] = base.status;

        // Apply forced columns (only if not already present).
        Object.keys(forced).forEach((k) => {
          if (dropColumns.has(k)) return;
          if (Object.prototype.hasOwnProperty.call(row, k)) return;
          const v = forced[k];
          if (!v) return;
          row[k] = v;
        });

        const out = await serviceInsert('task_distributions', [row]);
        if (out.ok) return { row: out.json && out.json[0] ? out.json[0] : null, ownerKey };

        const errText = errTextOf(out);
        const errLower = errText.toLowerCase();

        if (isSchemaMissing(errLower)) {
          return { row: null, ownerKey, error: out.json || out.text || 'schema_missing' };
        }

        // Missing owner column -> try next owner column.
        if (errLower.includes('column') && errLower.includes(ownerKey.toLowerCase())) break;

        // Missing column on the relation -> either swap title column or drop optional.
        const missingColumn = extractMissingColumn(errText);
        if (missingColumn) {
          if (missingColumn === col.title) {
            // Try next possible title column.
            break;
          }
          if (!dropColumns.has(missingColumn)) {
            dropColumns.add(missingColumn);
            continue;
          }
        }

        // NOT NULL constraint -> attempt to populate known equivalents.
        const notNullColumn = extractNotNullColumn(errText);
        if (notNullColumn) {
          if (TITLE_COLUMNS.includes(notNullColumn)) {
            forced[notNullColumn] = base.title;
            continue;
          }
          if (DESCRIPTION_COLUMNS.includes(notNullColumn) && base.description) {
            forced[notNullColumn] = base.description;
            continue;
          }
          if (REFERENCE_COLUMNS.includes(notNullColumn) && base.reference_url) {
            forced[notNullColumn] = base.reference_url;
            continue;
          }
          if (STATUS_COLUMNS.includes(notNullColumn) && base.status) {
            forced[notNullColumn] = base.status;
            continue;
          }
        }

        return { row: null, ownerKey, error: out.json || out.text || 'distribution_insert_failed' };
      }
    }
  }

  return { row: null, ownerKey: OWNER_COLUMNS[0], error: 'distribution_owner_column_not_found' };
}

async function insertTaskItems(distributionId, rows) {
  const payloadBase = rows.map((row) => {
    const deadlineText = sanitizeCell(row.deadline);
    const deadlineAt = normalizeDeadlineAt(deadlineText);
    const deadlineDate = normalizeDeadlineDate(deadlineText);
    return {
      case_number: row.caseNumber,
      case_no: row.caseNumber,
      site: row.site,
      description: row.description,
      assigned_to: row.assignedTo,
      assignee_user_id: row.assignedTo,
      assigned_user_id: row.assignedTo,
      assignee_id: row.assignedTo,
      deadline: deadlineDate,
      due_at: deadlineAt,
      deadline_at: deadlineAt,
      reference_url: row.referenceUrl,
      status: 'PENDING',
      remarks: ''
    };
  });

  const optionalColumns = ['case_no', 'assignee_user_id', 'assigned_user_id', 'assignee_id', 'deadline', 'due_at', 'deadline_at', 'reference_url', 'remarks'];
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
      if (!out.ok) {
        // If task tables aren't installed yet, return an empty list (prevents hard UI failure).
        if (isSchemaShapeError(out)) return sendJson(res, 200, { ok: true, rows: [] });
        return sendJson(res, 500, { ok: false, error: 'distribution_query_failed', details: out.json || out.text });
      }

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
          const status = stats.pending_count === 0 ? 'COMPLETED' : 'ONGOING';
          return Object.assign({}, row, {
            distribution_id: String(row.id || ''),
            total_count: stats.total_count,
            pending_count: stats.pending_count,
            done_count: stats.done_count,
            total_items: stats.total_count,
            pending_items: stats.pending_count,
            done_items: stats.done_count,
            status
          });
        })
      });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const title = sanitizeCell(body.title);
      const description = sanitizeCell(body.description, '');
      const referenceUrl = normalizeReferenceUrl(body.reference_url);
      const status = normalizeStatus(body.status);
      const normalizedRows = normalizeIncomingRows(body.items, description, referenceUrl);

      if (!title) return sendJson(res, 400, { ok: false, error: 'missing_title' });
      if (!normalizedRows.length) return sendJson(res, 400, { ok: false, error: 'valid_items_required' });

      const created = await insertDistributionRow(title, uid, { description, reference_url: referenceUrl, status });
      if (!created.row) {
        const details = created.error || 'distribution_insert_failed';
        const detailsText = JSON.stringify(details || '').toLowerCase();
        const schemaMissing = detailsText.includes('does not exist') || detailsText.includes('undefined_table') || detailsText.includes('relation');
        return sendJson(res, 500, {
          ok: false,
          error: schemaMissing ? 'tasks_schema_missing' : 'distribution_create_failed',
          message: schemaMissing ? 'Task tables/views are missing in Supabase. Apply the task migrations then redeploy.' : undefined,
          details
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
        const details = insertedItems.out && (insertedItems.out.json || insertedItems.out.text);
        const detailsText = JSON.stringify(details || '').toLowerCase();
        const schemaMissing = detailsText.includes('does not exist') || detailsText.includes('undefined_table') || detailsText.includes('relation');
        return sendJson(res, 500, {
          ok: false,
          error: schemaMissing ? 'tasks_schema_missing' : 'task_items_create_failed',
          message: schemaMissing ? 'Task tables/views are missing in Supabase. Apply the task migrations then redeploy.' : undefined,
          details
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
