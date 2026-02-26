const { sendJson, requireAuthedUser } = require('../tasks/_common');
const { queryQuickbaseRecords, listQuickbaseFields } = require('../../lib/quickbase');

module.exports = async (req, res) => {
  try {
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const fieldMapOut = await listQuickbaseFields();
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

    const selectedFields = wantedLabels
      .map((label) => ({ label, id: resolveFieldId(label) }))
      .filter((x) => Number.isFinite(x.id));

    if (!selectedFields.length) {
      return sendJson(res, 500, {
        ok: false,
        error: 'quickbase_fields_not_mapped',
        message: 'Unable to map required Quickbase fields by label.'
      });
    }

    const out = await queryQuickbaseRecords({
      where: req?.query?.where || '',
      limit: req?.query?.limit || 100,
      select: selectedFields.map((f) => f.id),
      sortBy: [{ fieldId: resolveFieldId('Case #') || 3, order: 'DESC' }]
    });

    if (!out.ok) {
      return sendJson(res, out.status || 500, {
        ok: false,
        error: out.error || 'quickbase_failed',
        message: out.message || 'Quickbase request failed'
      });
    }

    const caseIdFieldId = resolveFieldId('Case #') || 3;
    const columns = selectedFields
      .filter((f) => String(f.label).toLowerCase() !== 'case #')
      .map((f) => ({ id: String(f.id), label: f.label }));

    const records = out.records.map((row) => {
      const normalized = {};
      selectedFields.forEach((f) => {
        normalized[String(f.id)] = row?.[String(f.id)] || { value: '' };
      });
      return {
        qbRecordId: row?.[String(caseIdFieldId)]?.value || row?.recordId || 'N/A',
        fields: normalized
      };
    });

    return sendJson(res, 200, { ok: true, columns, records });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: 'quickbase_handler_failed',
      message: String(err?.message || err)
    });
  }
};
