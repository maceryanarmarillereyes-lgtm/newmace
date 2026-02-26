const { sendJson, requireAuthedUser } = require('../tasks/_common');
const { queryQuickbaseRecords } = require('../../lib/quickbase');

module.exports = async (req, res) => {
  try {
    const auth = await requireAuthedUser(req);
    if (!auth) return sendJson(res, 401, { ok: false, error: 'unauthorized' });

    const out = await queryQuickbaseRecords({
      where: req?.query?.where || '',
      limit: req?.query?.limit || 50
    });

    if (!out.ok) {
      return sendJson(res, out.status || 500, {
        ok: false,
        error: out.error || 'quickbase_failed',
        message: out.message || 'Quickbase request failed'
      });
    }

    const records = out.records.map((row) => ({
      qbRecordId: row?.['3']?.value || row?.recordId || 'N/A',
      fields: row || {}
    }));

    return sendJson(res, 200, { ok: true, records });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: 'quickbase_handler_failed',
      message: String(err?.message || err)
    });
  }
};
