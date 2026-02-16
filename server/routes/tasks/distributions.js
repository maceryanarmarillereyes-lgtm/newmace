const { sendJson, requireAuthedUser, serviceFetch, serviceSelect, serviceInsert } = require('./_common');

const OWNER_COLUMNS = ['created_by', 'created_by_user_id', 'owner_id', 'user_id'];
const ITEM_DISTRIBUTION_COLUMNS = ['distribution_id', 'task_distribution_id'];
// Different deployments evolved with different assignee column names.
// IMPORTANT: Do NOT include multiple assignee columns in the same insert payload,
// otherwise PostgREST will hard-fail if any single column is missing.
const ASSIGNEE_COLUMNS = ['assigned_to', 'assignee_user_id', 'assigned_user_id'];

function formatErrorMessage(code, details) {
  if (!details) return String(code || 'error');
  try {
    const asText = typeof details === 'string' ? details : JSON.stringify(details);
    return asText ? `${code}: ${asText}` : String(code || 'error');
  } catch (_) {
    return String(code || 'error');
  }
}

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

async function insertDistributionRow(title, uid, metadata) {
  const base = {
    title,
    description: sanitizeCell(metadata && metadata.description, ''),
    reference_url: normalizeReferenceUrl(metadata && metadata.reference_url),
    status: normalizeStatus(metadata && metadata.status)
  };

  const optionalColumns = ['title', 'description', 'reference_url', 'status'];

  const extractMissingColumn = (errorText) => {
    const text = String(errorText || '');

    // PostgREST schema cache error (PGRST204)
    // Example: "Could not find the 'reference_url' column of 'task_distributions' in the schema cache"
    let match = text.match(/Could\s+not\s+find\s+the\s+'([^']+)'\s+column\s+of\s+'task_distributions'/i);
    if (match) return String(match[1] || '').trim();

    // Postgres error text
    match = text.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?task_distributions"?\s+does\s+not\s+exist/i);
    return match ? String(match[1] || '').trim() : '';
  };

  for (const ownerKey of OWNER_COLUMNS) {
    const dropColumns = new Set();

    while (true) {
      const row = { [ownerKey]: uid };

      optionalColumns.forEach((key) => {
        if (dropColumns.has(key)) return;
        const value = base[key];
        if (!value) return;
        row[key] = value;
      });

      const out = await serviceInsert('task_distributions', [row]);
      if (out.ok) return { row: out.json && out.json[0] ? out.json[0] : null, ownerKey };

      const errText = JSON.stringify(out.json || out.text || '');
      const err = errText.toLowerCase();
      const missingOwnerColumn = err.includes('column') && err.includes(ownerKey.toLowerCase());
      if (missingOwnerColumn) break;

      const missingColumn = extractMissingColumn(errText);
      if (missingColumn && !dropColumns.has(missingColumn)) {
        dropColumns.add(missingColumn);
        continue;
      }

      return { row: null, ownerKey, error: out.json || out.text || 'distribution_insert_failed' };
    }
  }

  return { row: null, ownerKey: OWNER_COLUMNS[0], error: 'distribution_owner_column_not_found' };
}

async function insertTaskItems(distributionId, rows, createdBy) {
  const payloadBase = rows.map((row) => {
    const deadlineText = sanitizeCell(row.deadline);
    const deadlineAt = normalizeDeadlineAt(deadlineText);
    const deadlineDate = normalizeDeadlineDate(deadlineText);
    return {
      case_number: row.caseNumber,
      case_no: row.caseNumber,
      site: row.site,
      description: row.description,
      created_by: createdBy,
      created_by_user_id: createdBy,
      owner_id: createdBy,
      // Keep a single canonical source value; we'll project it onto the real
      // schema column (assigned_to / assignee_user_id / assigned_user_id) per attempt.
      assigned_to: row.assignedTo,
      deadline: deadlineDate,
      due_at: deadlineAt,
      deadline_at: deadlineAt,
      reference_url: row.referenceUrl,
      status: 'PENDING',
      remarks: ''
    };
  });

  // Schema-variant tolerant:
  // - Some DBs use case_number, others case_no
  // - Some DBs use assigned_to, others assignee_user_id / assigned_user_id
  //   NOTE: We must NOT include all assignee candidates at once.
  const optionalColumns = [
    'case_number',
    'case_no',
    'created_by',
    'created_by_user_id',
    'owner_id',
    'deadline',
    'due_at',
    'deadline_at',
    'reference_url',
    'remarks'
  ];
  const requiredColumns = ['site', 'description', 'status'];

  const buildPayload = (distributionKey, assigneeKey, dropColumns) => payloadBase.map((item) => {
    const next = {};
    [...requiredColumns, ...optionalColumns].forEach((column) => {
      if (dropColumns.has(column)) return;
      if (!Object.prototype.hasOwnProperty.call(item, column)) return;
      const value = item[column];
      if (value === '') return;
      next[column] = value;
    });

    // Project the assignee value into exactly ONE assignee column.
    if (!dropColumns.has(assigneeKey)) {
      const val = item.assigned_to;
      if (val && val !== '') next[assigneeKey] = val;
    }

    next[distributionKey] = distributionId;
    return next;
  });

  const extractMissingColumn = (errorText) => {
    const text = String(errorText || '');

    // PostgREST schema cache error (PGRST204)
    // Example: "Could not find the 'assignee_user_id' column of 'task_items' in the schema cache"
    let match = text.match(/Could\s+not\s+find\s+the\s+'([^']+)'\s+column\s+of\s+'task_items'/i);
    if (match) return String(match[1] || '').trim();

    // Postgres error text
    match = text.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?task_items"?\s+does\s+not\s+exist/i);
    return match ? String(match[1] || '').trim() : '';
  };

  const isDuplicate = (errText) => {
    const e = String(errText || '').toLowerCase();
    return e.includes('duplicate key value') || e.includes('unique constraint') || e.includes('conflict');
  };

  async function insertOne(rowObj) {
    const out = await serviceInsert('task_items', [rowObj]);
    if (!out.ok) return { ok: false, out };
    const inserted = Array.isArray(out.json) ? out.json : [];
    return { ok: true, row: inserted[0] || null, out };
  }

  for (const distributionKey of ITEM_DISTRIBUTION_COLUMNS) {
    for (const assigneeKey of ASSIGNEE_COLUMNS) {
      const dropColumns = new Set();

      while (true) {
        const payload = buildPayload(distributionKey, assigneeKey, dropColumns);
        const out = await serviceInsert('task_items', payload);
        if (out.ok) return { ok: true, out, inserted_count: payload.length, skipped_count: 0, skipped: [] };

        const errText = JSON.stringify(out.json || out.text || '');
        const err = errText.toLowerCase();

        // Column mismatch handling
        const missingDistributionKey = err.includes('column') && err.includes(distributionKey.toLowerCase());
        if (missingDistributionKey) break;

        const missingAssigneeKey = err.includes('column') && err.includes(assigneeKey.toLowerCase());
        if (missingAssigneeKey) break;

        const missingColumn = extractMissingColumn(errText);
        if (missingColumn && !dropColumns.has(missingColumn)) {
          dropColumns.add(missingColumn);
          continue;
        }

        // Common bad date payload scenario
        if ((err.includes('invalid input syntax') || err.includes('date/time field value out of range')) && !dropColumns.has('deadline_at')) {
          dropColumns.add('deadline_at');
          dropColumns.add('due_at');
          continue;
        }

        // Bulk insert failed: fall back to row-by-row (surfaces exact failing row)
        const inserted = [];
        const skipped = [];

        for (let i = 0; i < payload.length; i += 1) {
          const rowObj = payload[i];
          const one = await insertOne(rowObj);
          if (one.ok) {
            inserted.push(one.row);
            continue;
          }

          const oneErr = JSON.stringify(one.out.json || one.out.text || '');
          if (isDuplicate(oneErr)) {
            skipped.push({ index: i, row: rowObj, reason: 'duplicate', details: one.out.json || one.out.text });
            continue;
          }

          return {
            ok: false,
            out: one.out,
            failing: {
              index: i,
              case_number: rowObj.case_number || rowObj.case_no,
              site: rowObj.site,
              assigned_to: rowObj[assigneeKey] || rowObj.assigned_to,
              assignee_column: assigneeKey,
              distribution_key: distributionKey
            }
          };
        }

        return {
          ok: true,
          out: { ok: true, json: inserted },
          inserted_count: inserted.length,
          skipped_count: skipped.length,
          skipped
        };
      }
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
        return sendJson(res, 500, {
          ok: false,
          error: 'distribution_create_failed',
          message: formatErrorMessage('distribution_create_failed', created.error || 'distribution_insert_failed'),
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

      const insertedItems = await insertTaskItems(distributionId, normalizedRows, uid);
      if (!insertedItems.ok) {
        await rollbackDistribution(distributionId);
        return sendJson(res, 500, {
          ok: false,
          error: 'task_items_create_failed',
          message: formatErrorMessage('task_items_create_failed', {
            details: insertedItems.out && (insertedItems.out.json || insertedItems.out.text),
            failing: insertedItems.failing || null
          }),
          details: insertedItems.out && (insertedItems.out.json || insertedItems.out.text),
          failing: insertedItems.failing || null
        });
      }

      return sendJson(res, 200, {
        ok: true,
        distribution: created.row,
        items: Array.isArray(insertedItems.out.json) ? insertedItems.out.json : [],
        inserted_count: insertedItems.inserted_count || (Array.isArray(insertedItems.out.json) ? insertedItems.out.json.length : 0),
        skipped_count: insertedItems.skipped_count || 0
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
