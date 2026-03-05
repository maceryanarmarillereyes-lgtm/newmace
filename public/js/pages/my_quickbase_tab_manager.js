/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Strictly protects Enterprise UI/UX, Realtime Sync Logic, Core State Management, and Database/API Adapters. Do NOT modify existing logic or layout in this file without explicitly asking Thunter BOY for clearance. If overlapping changes are required, STOP and provide a RISK IMPACT REPORT first. */
(function(rootFactory) {
  if (typeof module !== 'undefined' && module.exports) {
    const built = rootFactory(typeof globalThis !== 'undefined' ? globalThis : global);
    module.exports = built;
    module.exports.default = built;
  } else {
    rootFactory(typeof window !== 'undefined' ? window : globalThis);
  }
})(function(root) {
  const defaultQuickbaseSettings = {
    tabName: '',
    reportLink: '',
    baseReportQid: '',
    qid: '',
    tableId: ''
  };

  const tabs = new Map();
  let currentUserId = '';
  let apiBaseUrl = '/api';

  function authHeader() {
    const jwt = root.CloudAuth && typeof root.CloudAuth.accessToken === 'function'
      ? root.CloudAuth.accessToken()
      : '';
    return jwt ? { Authorization: `Bearer ${jwt}` } : {};
  }

  function cloneDeep(value) {
    // Deep clone is required so each tab gets isolated objects and no shared references leak across tabs.
    if (typeof root.structuredClone === 'function') return root.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function safeUserId(userId) {
    const out = String(userId || '').trim();
    return out || 'anonymous';
  }

  function resolveCurrentUserId() {
    if (String(currentUserId || '').trim()) return String(currentUserId).trim();
    try {
      const authUser = root.Auth && typeof root.Auth.getUser === 'function' ? root.Auth.getUser() : null;
      const authId = String(authUser && authUser.id || '').trim();
      if (authId) return authId;
    } catch (_) {}
    try {
      const cloudMe = root.me && typeof root.me === 'object' ? root.me : null;
      const cloudId = String(cloudMe && cloudMe.id || '').trim();
      if (cloudId) return cloudId;
    } catch (_) {}
    return '';
  }

  function storageKey() {
    return `mums_quickbase_tabs_${safeUserId(currentUserId)}`;
  }

  function makeUUID() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return `qb-tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function saveLocalFallback() {
    if (!root.localStorage) return;
    const payload = Array.from(tabs.entries()).map(([tabId, entry]) => ({
      tab_id: tabId,
      tab_name: String(entry.settings.tabName || '').trim(),
      settings_json: cloneDeep(entry.settings),
      meta: cloneDeep(entry.meta)
    }));
    root.localStorage.setItem(storageKey(), JSON.stringify(payload));
  }

  function loadLocalFallback() {
    if (!root.localStorage) return;
    const raw = root.localStorage.getItem(storageKey());
    if (!raw) return;
    let parsed = [];
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = [];
    }
    if (!Array.isArray(parsed)) return;
    tabs.clear();
    parsed.forEach((row) => {
      const tabId = String(row && (row.tab_id || row.tabId) || '').trim();
      if (!tabId) return;
      const settings = cloneDeep(Object.assign({}, defaultQuickbaseSettings, row.settings_json || {}));
      tabs.set(tabId, {
        settings,
        meta: Object.assign({ createdAt: Date.now(), updatedAt: Date.now() }, row.meta || {})
      });
    });
  }

  async function apiRequest(path, options) {
    const base = String(apiBaseUrl || '/api').replace(/\/$/, '');
    const opts = Object.assign({}, options || {});
    opts.headers = Object.assign({}, opts.headers || {}, authHeader());
    const response = await root.fetch(`${base}${path}`, opts);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(body.message || body.error || 'quickbase_tab_manager_api_failed');
      err.status = response.status;
      throw err;
    }
    return body;
  }

  const TabManager = {
    init({ userId, apiBaseUrl: nextApiBaseUrl }) {
      currentUserId = String(userId || resolveCurrentUserId() || '').trim();
      apiBaseUrl = String(nextApiBaseUrl || '/api').trim() || '/api';
      tabs.clear();
      loadLocalFallback();
      return this;
    },

    createTab({ tabName }) {
      const tabId = makeUUID();
      const settings = cloneDeep(defaultQuickbaseSettings);
      settings.tabName = String(tabName || 'New Tab').trim() || 'New Tab';
      tabs.set(tabId, {
        settings,
        meta: { createdAt: Date.now(), updatedAt: Date.now() }
      });
      saveLocalFallback();
      return tabId;
    },

    getTab(tabId) {
      const safeTabId = String(tabId || '').trim();
      const entry = tabs.get(safeTabId);
      if (!entry) {
        return {
          settings: cloneDeep(defaultQuickbaseSettings),
          meta: { createdAt: 0, updatedAt: 0 }
        };
      }
      return {
        settings: cloneDeep(entry.settings),
        meta: cloneDeep(entry.meta)
      };
    },

    updateTabLocal(tabId, partialSettings) {
      const safeTabId = String(tabId || '').trim();
      if (!safeTabId || !tabs.has(safeTabId)) return;
      const entry = tabs.get(safeTabId);
      const next = Object.assign({}, entry.settings, cloneDeep(partialSettings || {}));
      tabs.set(safeTabId, {
        settings: next,
        meta: Object.assign({}, entry.meta, { updatedAt: Date.now() })
      });
      saveLocalFallback();
    },

    async saveTab(tabId) {
      const safeTabId = String(tabId || '').trim();
      const entry = tabs.get(safeTabId);
      if (!entry) return;
      const payload = {
        user_id: safeUserId(resolveCurrentUserId() || currentUserId),
        tab_id: safeTabId,
        tab_name: String(entry.settings.tabName || '').trim() || 'New Tab',
        settings_json: cloneDeep(entry.settings)
      };
      await apiRequest('/quickbase_tabs/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      saveLocalFallback();
    },



    async deleteTab(tabId) {
      const safeTabId = String(tabId || '').trim();
      if (!safeTabId) return;
      tabs.delete(safeTabId);
      const userId = encodeURIComponent(safeUserId(resolveCurrentUserId() || currentUserId));
      await apiRequest(`/quickbase_tabs/${encodeURIComponent(safeTabId)}?user_id=${userId}`, {
        method: 'DELETE'
      });
      saveLocalFallback();
    },

    async loadTabs() {
      const userId = encodeURIComponent(safeUserId(resolveCurrentUserId() || currentUserId));
      const out = await apiRequest(`/quickbase_tabs?user_id=${userId}`, { method: 'GET' });
      const rows = Array.isArray(out && out.rows) ? out.rows : [];
      tabs.clear();
      rows.forEach((row) => {
        const tabId = String(row && row.tab_id || '').trim();
        if (!tabId) return;
        const settings = cloneDeep(Object.assign({}, defaultQuickbaseSettings, row.settings_json || {}, {
          tabName: String(row.tab_name || (row.settings_json && row.settings_json.tabName) || '').trim()
        }));
        tabs.set(tabId, {
          settings,
          meta: {
            createdAt: Date.parse(row.created_at || '') || Date.now(),
            updatedAt: Date.parse(row.updated_at || '') || Date.now()
          }
        });
      });
      saveLocalFallback();
      return Array.from(tabs.keys());
    },

    clearNewTabFields() {
      const defaults = cloneDeep(defaultQuickbaseSettings);
      const map = {
        qbTabName: defaults.tabName,
        qbReportLink: defaults.reportLink,
        qbTabBaseQid: defaults.baseReportQid,
        qbQid: defaults.qid,
        qbTableId: defaults.tableId
      };
      Object.keys(map).forEach((id) => {
        const el = root.document && root.document.querySelector ? root.document.querySelector(`#${id}`) : null;
        if (!el) return;
        el.value = map[id];
      });
      return defaults;
    },

    __unsafeDump() {
      return Array.from(tabs.entries()).map(([tabId, value]) => ({ tabId, value: cloneDeep(value) }));
    }
  };

  root.TabManager = TabManager;
  return TabManager;
});
