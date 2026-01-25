const { serviceSelect } = require('../_supabase');

// GET /api/mailbox_override/get?scope=global|superadmin
// Returns the latest override config for the requested scope.
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const scope = (url.searchParams.get('scope') || 'global').toLowerCase();
    const { res: dbRes, json } = await serviceSelect(
      `/rest/v1/mums_mailbox_override?scope=eq.${encodeURIComponent(scope)}&select=*&order=updated_at.desc&limit=1`
    );
    if (!dbRes.ok) return res.status(dbRes.status).json({ error: 'DB error', details: json });
    const row = json?.[0] || null;
    if (row && Object.prototype.hasOwnProperty.call(row,'is_frozen') && !Object.prototype.hasOwnProperty.call(row,'freeze')) {
      row.freeze = row.is_frozen;
      delete row.is_frozen;
    }
    return res.status(200).json(row);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
};
