const { sendJson, requireAuthedUser } = require('../tasks/_common');
const { queryQuickbaseRecords, listQuickbaseFields } = require('../../lib/quickbase');

async function getQuickbaseReportMetadata({ config, qid }) {
  const cfg = {
    qb_token: config.qb_token,
    qb_realm: config.qb_realm,
    qb_table_id: config.qb_table_id
  };

  try {
    const url = `https://api.quickbase.com/v1/reports/${qid}?tableId=${config.qb_table_id}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'QB-Realm-Hostname': cfg.qb_realm,
        Authorization: `QB-USER-TOKEN ${cfg.qb_token}`,
        'Content-Type': 'application/json'
      }
    });

    const json = await response.json();

    if (!response.ok) {
      console.warn('[Quickbase] Could not fetch report metadata:', json.message);
      return null;
    }

    const columnFieldIds = (json.query?.fields || [])
      .map((f) => Number(f))
      .filter((id) => Number.isFinite(id));

    console.log('[Quickbase] Report metadata fetched. Columns:', columnFieldIds);

    return {
      fields: columnFieldIds,
      filter: json.query?.filter || '',
      sortBy: json.query?.sortBy || []
    };
  } catch (err) {
    console.error('[Quickbase] Failed to fetch report metadata:', err.message);
    return null;
  }
}

function encodeQuickbaseLiteral(value) {
  return String(value == null ? '' : value).replace(/'/g, "\\'");
}

function buildAnyEqualsClause(fieldId, values) {
  if (!Number.isFinite(fieldId)) return '';
  const safeValues = (Array.isArray(values) ? values : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (!safeValues.length) return '';
  if (safeValues.length === 1) {
    return `{${fieldId}.EX.'${encodeQuickbaseLiteral(safeValues[0])}'}`;
  }
  return `(${safeValues.map((v) => `{${fieldId}.EX.'${encodeQuickbaseLiteral(v)}'}`).join(' OR ')})`;
}

function parseCsvOrArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(',').map((v) => String(v || '').trim()).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const profile = auth?.profile || {};
    const profileToken = String(
      profile.qb_token
      || profile.quickbase_token
      || profile.quickbase_user_token
      || ''
    ).trim();
    const profileLink = String(
      profile.qb_report_link
      || profile.quickbase_url
      || profile.quickbase_report_link
      || ''
    ).trim();
    const profileRealm = String(
      profile.qb_realm
      || profile.quickbase_realm
      || ''
    ).trim();
    const profileQid = String(
      profile.qb_qid
      || profile.quickbase_qid
      || ''
    ).trim();
    const profileTableId = String(
      profile.qb_table_id
      || profile.quickbase_table_id
      || ''
    ).trim();

    let qid = String(req?.query?.qid || req?.query?.qId || '').trim();
    let tableId = String(req?.query?.tableId || req?.query?.table_id || '').trim();
    let realm = String(req?.query?.realm || '').trim();

    if (!qid || !tableId || !realm) {
      qid = qid || profileQid;
      tableId = tableId || profileTableId;
      realm = realm || profileRealm;
    }

    if (!qid || !tableId || !realm) {
      return sendJson(res, 400, {
        ok: false,
        warning: 'quickbase_credentials_missing',
        message: 'Missing Quickbase configuration. Please configure your QID in My Quickbase Settings.'
      });
    }

    const userQuickbaseConfig = {
      qb_token: profileToken,
      qb_realm: realm,
      qb_table_id: tableId,
      qb_qid: qid,
      qb_report_link: profileLink
    };

    console.log('[Enterprise Debug] Quickbase Config:', userQuickbaseConfig);

    if (!userQuickbaseConfig.qb_token || (!userQuickbaseConfig.qb_realm && !userQuickbaseConfig.qb_report_link)) {
      return sendJson(res, 200, {
        ok: true,
        columns: [],
        records: [],
        settings: {
          dynamicFilters: ['Assigned to', 'Case Status', 'Type'],
          sortBy: ['End User ASC', 'Type ASC']
        },
        warning: 'quickbase_credentials_missing'
      });
    }

    const fieldMapOut = await listQuickbaseFields({ config: userQuickbaseConfig });
    if (!fieldMapOut.ok) {
      return sendJson(res, fieldMapOut.status || 500, {
        ok: false,
        error: fieldMapOut.error || 'quickbase_fields_failed',
        message: fieldMapOut.message || 'Quickbase fields lookup failed'
      });
    }

    const fieldsByLabel = Object.create(null);
    const fieldsByLowerLabel = Object.create(null);
    (fieldMapOut.fields || []).forEach((f) => {
      const label = String(f?.label || '').trim();
      const id = Number(f?.id);
      if (!label || !Number.isFinite(id)) return;
      fieldsByLabel[label] = id;
      fieldsByLowerLabel[label.toLowerCase()] = id;
    });

    const wantedLabels = [
      'Case #',
      'End User',
      'Short Description or New "Concern" That Is Not in The KB',
      'Case Status',
      'Assigned to',
      'Last Update Days',
      'Age',
      'Type'
    ];

    const resolveFieldId = (label) => {
      if (fieldsByLabel[label]) return fieldsByLabel[label];
      return fieldsByLowerLabel[String(label || '').toLowerCase()] || null;
    };

    const hasPersonalQuickbaseQuery = !!String(qid || '').trim();
    const wantedFieldSelection = wantedLabels
      .map((label) => ({ label, id: resolveFieldId(label) }))
      .filter((x) => Number.isFinite(x.id));

    const selectedFields = wantedFieldSelection;

    if (!hasPersonalQuickbaseQuery && !selectedFields.length) {
      return sendJson(res, 500, {
        ok: false,
        error: 'quickbase_fields_not_mapped',
        message: 'Unable to map required Quickbase fields by label.'
      });
    }

    const typeFieldId = resolveFieldId('Type');
    const endUserFieldId = resolveFieldId('End User');
    const statusFieldId = resolveFieldId('Case Status');
    const assignedToFieldId = resolveFieldId('Assigned to');

    const defaultSettings = {
      dynamicFilters: ['Assigned to', 'Case Status', 'Type'],
      sortBy: ['End User ASC', 'Type ASC']
    };

    const typeFilter = parseCsvOrArray(req?.query?.type);
    const endUserFilter = parseCsvOrArray(req?.query?.endUser);
    const assignedToFilter = parseCsvOrArray(req?.query?.assignedTo);
    const caseStatusFilter = parseCsvOrArray(req?.query?.caseStatus);
    const excludeStatus = parseCsvOrArray(req?.query?.excludeStatus);

    const whereClauses = [];

    if (hasPersonalQuickbaseQuery) {
      // QID-based reports have pre-defined filters and columns.
      // Do NOT apply any manual WHERE clauses or they will override the report definition.
      console.log('[Quickbase] Using QID report definition - skipping manual filters:', qid);
    } else {
      // Legacy mode: manual filtering for non-QID queries
      console.log('[Quickbase] No QID - applying manual filters');

      const typeClause = buildAnyEqualsClause(typeFieldId, typeFilter);
      if (typeClause) whereClauses.push(typeClause);

      const endUserClause = buildAnyEqualsClause(endUserFieldId, endUserFilter);
      if (endUserClause) whereClauses.push(endUserClause);

      const assignedToClause = buildAnyEqualsClause(assignedToFieldId, assignedToFilter);
      if (assignedToClause) whereClauses.push(assignedToClause);

      const caseStatusClause = buildAnyEqualsClause(statusFieldId, caseStatusFilter);
      if (caseStatusClause) whereClauses.push(caseStatusClause);

      excludeStatus.forEach((status) => {
        if (!Number.isFinite(statusFieldId) || !status) return;
        whereClauses.push(`{${statusFieldId}.XEX.'${encodeQuickbaseLiteral(status)}'}`);
      });
    }

    const routeWhere = String(req?.query?.where || '').trim();
    const manualWhere = whereClauses.length > 0 ? whereClauses.join(' AND ') : '';
    const effectiveWhere = routeWhere || (manualWhere || null);

    console.log('[Quickbase] WHERE clause status:', {
      hasRouteWhere: !!routeWhere,
      hasManualWhere: !!manualWhere,
      finalWhere: effectiveWhere || '(none - using report filters)'
    });

    let reportMetadata = null;
    if (hasPersonalQuickbaseQuery) {
      reportMetadata = await getQuickbaseReportMetadata({
        config: userQuickbaseConfig,
        qid
      });
    }

    const selectFields = hasPersonalQuickbaseQuery && reportMetadata?.fields?.length
      ? reportMetadata.fields
      : (hasPersonalQuickbaseQuery ? [] : selectedFields.map((f) => f.id));

    console.log('[Quickbase] SELECT fields:', selectFields);

    console.log('[Quickbase Monitoring] Query config:', {
      qid: userQuickbaseConfig.qb_qid,
      hasWhere: !!effectiveWhere,
      selectCount: selectFields?.length || 0,
      enableFallback: !hasPersonalQuickbaseQuery
    });

    const out = await queryQuickbaseRecords({
      config: userQuickbaseConfig,
      where: effectiveWhere || undefined,
      limit: req?.query?.limit || 100,
      select: selectFields,
      allowEmptySelect: hasPersonalQuickbaseQuery && !reportMetadata,
      enableQueryIdFallback: !hasPersonalQuickbaseQuery,
      sortBy: reportMetadata?.sortBy || [
        { fieldId: endUserFieldId || resolveFieldId('Case #') || 3, order: 'ASC' },
        { fieldId: typeFieldId || resolveFieldId('Case #') || 3, order: 'ASC' }
      ]
    });

    console.log('[Quickbase Monitoring] Query result:', {
      ok: out.ok,
      recordCount: out.records?.length || 0,
      expected: 70
    });

    if (!out.ok) {
      return sendJson(res, out.status || 500, {
        ok: false,
        error: out.error || 'quickbase_failed',
        message: out.message || 'Quickbase request failed'
      });
    }

    const caseIdFieldId = resolveFieldId('Case #') || 3;
    const fieldsMetaById = Object.create(null);
    (fieldMapOut.fields || []).forEach((f) => {
      const id = Number(f?.id);
      const label = String(f?.label || '').trim();
      if (!Number.isFinite(id) || !label) return;
      fieldsMetaById[String(id)] = { id, label };
    });

    const firstRecord = Array.isArray(out.records) && out.records.length ? out.records[0] : null;
    const dynamicFieldIds = hasPersonalQuickbaseQuery && firstRecord
      ? Object.keys(firstRecord)
          .map((fidRaw) => Number(fidRaw))
          .filter((fidNum) => Number.isFinite(fidNum))
          .map((fidNum) => String(fidNum))
      : [];

    const effectiveFields = hasPersonalQuickbaseQuery
      ? dynamicFieldIds
          .map((fid) => fieldsMetaById[fid])
          .filter(Boolean)
      : selectedFields
          .map((f) => fieldsMetaById[String(f.id)] || { id: Number(f.id), label: String(f.label || '').trim() })
          .filter((f) => Number.isFinite(f.id) && String(f.label || '').trim());

    const columns = (Array.isArray(out.records) && out.records.length)
      ? effectiveFields
          .filter((f) => String(f.label).toLowerCase() !== 'case #' && Number(f.id) !== Number(caseIdFieldId))
          .map((f) => ({ id: String(f.id), label: String(f.label) }))
      : [];

    console.info('[Quickbase Monitoring] Dynamic columns sent to client:', columns);

    const mappedSource = Array.isArray(out.mappedRecords) && out.mappedRecords.length
      ? out.mappedRecords
      : [];

    const records = (Array.isArray(out.records) ? out.records : []).map((row, idx) => {
      const mappedRow = (mappedSource[idx] && typeof mappedSource[idx] === 'object') ? mappedSource[idx] : {};
      const normalized = {};
      const fieldList = hasPersonalQuickbaseQuery
        ? dynamicFieldIds
        : effectiveFields.map((f) => String(f.id));

      fieldList.forEach((fid) => {
        const fieldId = String(fid);
        const nestedField = row?.[fieldId];
        const nestedValue = nestedField && typeof nestedField === 'object' && Object.prototype.hasOwnProperty.call(nestedField, 'value')
          ? nestedField.value
          : nestedField;
        const mappedValue = Object.prototype.hasOwnProperty.call(mappedRow, fieldId) ? mappedRow[fieldId] : nestedValue;
        normalized[fieldId] = { value: mappedValue == null ? '' : mappedValue };
      });

      const mappedRecordId = Object.prototype.hasOwnProperty.call(mappedRow, String(caseIdFieldId))
        ? mappedRow[String(caseIdFieldId)]
        : '';
      const nestedRecordId = row?.[String(caseIdFieldId)]?.value || row?.[String(3)]?.value || '';

      return {
        qbRecordId: mappedRecordId || nestedRecordId || row?.recordId || 'N/A',
        fields: normalized
      };
    });

    return sendJson(res, 200, {
      ok: true,
      columns,
      records,
      settings: {
        ...defaultSettings,
        fieldIds: {
          type: typeFieldId || null,
          endUser: endUserFieldId || null,
          assignedTo: assignedToFieldId || null,
          caseStatus: statusFieldId || null
        },
        appliedWhere: effectiveWhere,
        appliedDynamicFilters: {
          assignedTo: assignedToFilter,
          caseStatus: caseStatusFilter,
          type: typeFilter
        }
      }
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: 'quickbase_handler_failed',
      message: String(err?.message || err)
    });
  }
};
