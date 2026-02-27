const { sendJson, requireAuthedUser } = require('../tasks/_common');
const { queryQuickbaseRecords, listQuickbaseFields } = require('../../lib/quickbase');

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

    const userQuickbaseConfig = {
      qb_token: profileToken,
      qb_realm: profileRealm,
      qb_table_id: profileTableId,
      qb_qid: profileQid,
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

    const hasPersonalQuickbaseQuery = !!String(userQuickbaseConfig.qb_qid || '').trim();
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
    const effectiveTypes = typeFilter.length
      ? typeFilter
      : (hasPersonalQuickbaseQuery ? [] : defaultSettings.types);
    const effectiveEndUsers = endUserFilter.length
      ? endUserFilter
      : (hasPersonalQuickbaseQuery ? [] : defaultSettings.endUsers);
    const effectiveExcludedStatuses = excludeStatus.length
      ? excludeStatus
      : (hasPersonalQuickbaseQuery ? [] : [defaultSettings.excludedStatus]);

    const typeClause = buildAnyEqualsClause(typeFieldId, effectiveTypes);
    if (typeClause) whereClauses.push(typeClause);

    const endUserClause = buildAnyEqualsClause(endUserFieldId, effectiveEndUsers);
    if (endUserClause) whereClauses.push(endUserClause);

    const assignedToClause = buildAnyEqualsClause(assignedToFieldId, assignedToFilter);
    if (assignedToClause) whereClauses.push(assignedToClause);

    const caseStatusClause = buildAnyEqualsClause(statusFieldId, caseStatusFilter);
    if (caseStatusClause) whereClauses.push(caseStatusClause);

    effectiveExcludedStatuses.forEach((status) => {
      if (!Number.isFinite(statusFieldId) || !status) return;
      whereClauses.push(`{${statusFieldId}.XEX.'${encodeQuickbaseLiteral(status)}'}`);
    });

    const routeWhere = String(req?.query?.where || '').trim();
    const effectiveWhere = routeWhere || whereClauses.join(' AND ');

    const out = await queryQuickbaseRecords({
      config: userQuickbaseConfig,
      where: effectiveWhere,
      limit: req?.query?.limit || 100,
      select: hasPersonalQuickbaseQuery ? [] : selectedFields.map((f) => f.id),
      allowEmptySelect: hasPersonalQuickbaseQuery,
      sortBy: [
        { fieldId: endUserFieldId || resolveFieldId('Case #') || 3, order: 'ASC' },
        { fieldId: typeFieldId || resolveFieldId('Case #') || 3, order: 'ASC' }
      ]
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
