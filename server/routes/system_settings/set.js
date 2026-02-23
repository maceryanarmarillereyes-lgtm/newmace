/**
 * SET SYSTEM SETTINGS API ROUTE
 * Endpoint: POST /api/system_settings/set
 * Body: { key: string, value: any }
 * Permission: Super Admin only (manage_global_theme)
 * Returns: { success: true, key, value }
 */

const SystemSettings = require('../../lib/system_settings');
const { authenticate, requirePerm } = require('../../middleware/auth');
const { logActivity } = require('../../lib/activity_log');

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

    // Permission check - only Super Admin can modify system settings
    const hasPermission = requirePerm(user, 'manage_global_theme');
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Super Admin permission required'
      });
    }

    // Get key and value from request body
    const { key, value } = req.body;

    // Validation
    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Setting key is required'
      });
    }

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Setting value is required'
      });
    }

    // Validate value for specific keys
    if (!SystemSettings.validate(key, value)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: `Invalid value for setting: ${key}`
      });
    }

    // Set the system setting
    const success = await SystemSettings.set(key, value);

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Database Error',
        message: 'Failed to update system setting'
      });
    }

    // Log activity
    try {
      await logActivity({
        user_id: user.id,
        username: user.username,
        action: 'system_setting_update',
        details: `Updated system setting: ${key}`,
        metadata: { key, value },
        ip: req.ip || req.connection.remoteAddress
      });
    } catch (logErr) {
      console.error('Failed to log activity:', logErr);
      // Don't fail the request if logging fails
    }

    return res.status(200).json({
      success: true,
      key,
      value,
      message: 'System setting updated successfully'
    });

  } catch (err) {
    console.error('POST /api/system_settings/set error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update system setting'
    });
  }
};
