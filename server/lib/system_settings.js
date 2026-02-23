/**
 * SYSTEM SETTINGS LIBRARY
 * Manages global system-wide settings (e.g., default theme)
 * Used by Super Admin to configure application defaults
 */

const db = require('./db');

const SystemSettings = {
  /**
   * Get a system setting value
   * @param {string} key - Setting key (e.g., 'global_default_theme')
   * @returns {Promise<any>} Setting value or null
   */
  async get(key) {
    try {
      const result = await db.query(
        'SELECT value FROM system_settings WHERE key = ? LIMIT 1',
        [key]
      );

      if (!result || result.length === 0) {
        return this.getDefaultValue(key);
      }

      // Parse JSON if it's a complex value
      const rawValue = result[0].value;
      try {
        return JSON.parse(rawValue);
      } catch {
        return rawValue;
      }
    } catch (err) {
      console.error('SystemSettings.get error:', err);
      return this.getDefaultValue(key);
    }
  },

  /**
   * Set a system setting value
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @returns {Promise<boolean>} Success status
   */
  async set(key, value) {
    try {
      // Serialize complex values to JSON
      const serializedValue = typeof value === 'object' 
        ? JSON.stringify(value) 
        : String(value);

      // Upsert: insert or update if exists
      await db.query(
        `INSERT INTO system_settings (key, value, updated_at) 
         VALUES (?, ?, NOW()) 
         ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()`,
        [key, serializedValue, serializedValue]
      );

      return true;
    } catch (err) {
      console.error('SystemSettings.set error:', err);
      return false;
    }
  },

  /**
   * Delete a system setting
   * @param {string} key - Setting key
   * @returns {Promise<boolean>} Success status
   */
  async delete(key) {
    try {
      await db.query('DELETE FROM system_settings WHERE key = ?', [key]);
      return true;
    } catch (err) {
      console.error('SystemSettings.delete error:', err);
      return false;
    }
  },

  /**
   * Get all system settings
   * @returns {Promise<Object>} All settings as key-value object
   */
  async getAll() {
    try {
      const results = await db.query('SELECT key, value FROM system_settings');
      
      const settings = {};
      for (const row of results) {
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          settings[row.key] = row.value;
        }
      }

      return settings;
    } catch (err) {
      console.error('SystemSettings.getAll error:', err);
      return {};
    }
  },

  /**
   * Get default value for a setting key
   * @param {string} key - Setting key
   * @returns {any} Default value
   */
  getDefaultValue(key) {
    const defaults = {
      global_default_theme: 'aurora_midnight',
      app_name: 'MUMS',
      app_version: '1.0.0',
      timezone: 'Asia/Manila',
      maintenance_mode: false,
    };

    return defaults[key] !== undefined ? defaults[key] : null;
  },

  /**
   * Validate setting value
   * @param {string} key - Setting key
   * @param {any} value - Value to validate
   * @returns {boolean} Is valid
   */
  validate(key, value) {
    const validators = {
      global_default_theme: (val) => {
        const validThemes = ['aurora_midnight', 'mono'];
        return typeof val === 'string' && validThemes.includes(val);
      },
      maintenance_mode: (val) => typeof val === 'boolean',
      timezone: (val) => typeof val === 'string' && val.length > 0,
    };

    const validator = validators[key];
    return validator ? validator(value) : true;
  },
};

module.exports = SystemSettings;
