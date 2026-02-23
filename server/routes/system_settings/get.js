/**
 * GET SYSTEM SETTINGS API ROUTE
 * Endpoint: GET /api/system_settings/get?key=<key>
 * Permission: Super Admin only (manage_global_theme)
 * Returns: { success: true, value: <value> }
 */

const SystemSettings = require('../../lib/system_settings');
const { authenticate, requirePerm } = require('../../middleware/auth');

module.exports = async (req, res) => {
  try {
    // Authentication check
    const authResult = await authenticate(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const user = authResult.user;

    // Permission check - only Super Admin can access system settings
    const hasPermission = requirePerm(user, 'manage_global_theme');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Super Admin permission required'
      });
    }

    // Get setting key from query params
    const { key } = req.query;

    // If no key provided, return all settings
    if (!key) {
      const allSettings = await SystemSettings.getAll();
      return res.status(200).json({
        success: true,
        settings: allSettings
      });
    }

    // Get specific setting
    const value = await SystemSettings.get(key);

    return res.status(200).json({
      success: true,
      key,
      value
    });

  } catch (err) {
    console.error('GET /api/system_settings/get error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch system settings'
    });
  }
};
