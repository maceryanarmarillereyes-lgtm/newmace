/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Strictly protects Enterprise UI/UX, Realtime Sync Logic, Core State Management, and Database/API Adapters. Do NOT modify existing logic or layout in this file without explicitly asking Thunter BOY for clearance. If overlapping changes are required, STOP and provide a RISK IMPACT REPORT first. */
/**
 * public/js/pages/my_quickbase.js
 * High Level Enterprise Quickbase Dashboard + Settings Modal
 */
(function(){
  window.Pages = window.Pages || {};

  function esc(v) {
    if (window.UI && typeof window.UI.esc === 'function') return window.UI.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const ENABLE_QID_URL_MATCH_VALIDATION = true;

  function parseQuickbaseReportUrl(url) {
    const value = String(url || '').trim();
    if (!value) return null;
    try {
      const u = new URL(value);
      const segments = String(u.pathname || '').split('/').filter(Boolean);
      const appIndex = segments.findIndex((segment) => String(segment).toLowerCase() === 'app');
      const tableIndex = segments.findIndex((segment) => String(segment).toLowerCase() === 'table');
      const appId = appIndex >= 0 ? String(segments[appIndex + 1] || '').trim() : '';
      const tableId = tableIndex >= 0
        ? String(segments[tableIndex + 1] || '').trim()
        : (() => {
          const dbIndex = segments.findIndex((segment) => String(segment).toLowerCase() === 'db');
          return dbIndex >= 0 ? String(segments[dbIndex + 1] || '').trim() : '';
        })();
      const rawQid = String(u.searchParams.get('qid') || '').trim();
      const qidMatch = rawQid.match(/-?\d+/);
      const qid = qidMatch && qidMatch[0] ? qidMatch[0] : '';
      const out = {};
      if (appId) out.appId = appId;
      if (tableId) out.tableId = tableId;
      if (qid) out.qid = qid;
      return Object.keys(out).length ? out : null;
    } catch (_) {
      return null;
    }
  }

  function parseQuickbaseLink(link) {
    const out = { realm: '', appId: '', tableId: '', qid: '' };
    const value = String(link || '').trim();
    if (!value) return out;

    const parsedGeneric = parseQuickbaseReportUrl(value);
    if (parsedGeneric) {
      out.appId = String(parsedGeneric.appId || '').trim();
      out.tableId = String(parsedGeneric.tableId || '').trim();
      out.qid = String(parsedGeneric.qid || '').trim();
    }

    try {
      const urlObj = new URL(value);
      const host = String(urlObj.hostname || '').trim().toLowerCase();
      const realmMatch = host.match(/^([a-z0-9-]+)\.quickbase\.com$/i);
      out.realm = realmMatch && realmMatch[1] ? String(realmMatch[1]).trim() : host;
    } catch (_) {}
    const dbMatch = value.match(/\/db\/([a-zA-Z0-9]+)/i);
    if (dbMatch && dbMatch[1]) out.tableId = String(dbMatch[1]).trim();
    if (!out.tableId) {
      const tableMatch = value.match(/\/table\/([a-zA-Z0-9]+)/i);
      if (tableMatch && tableMatch[1]) out.tableId = String(tableMatch[1]).trim();
    }
    if (!out.qid) {
      const qidParamMatch = value.match(/[?&]qid=(-?\d+)/i);
      if (qidParamMatch && qidParamMatch[1]) out.qid = String(qidParamMatch[1]).trim();
    }
    if (!out.qid) {
      const reportMatch = value.match(/\/report\/(-?\d+)/i);
      if (reportMatch && reportMatch[1]) out.qid = String(reportMatch[1]).trim();
    }
    return out;
  }

  function normalizeFilters(raw) {
    const operatorMap = {
      'IS EQUAL TO': 'EX',
      'IS (EXACT)': 'EX',
      EX: 'EX',
      '=': 'EX',
      'IS NOT': 'XEX',
      'NOT EQUAL TO': 'XEX',
      'IS NOT EQUAL TO': 'XEX',
      XEX: 'XEX',
      '!=': 'XEX',
      '<>': 'XEX',
      CONTAINS: 'CT',
      CT: 'CT',
      'DOES NOT CONTAIN': 'XCT',
      XCT: 'XCT'
    };
    const toOperator = (value) => {
      const key = String(value == null ? 'EX' : value).trim().toUpperCase();
      return operatorMap[key] || key || 'EX';
    };
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        fieldId: String((f.fieldId ?? f.field_id ?? f.fid ?? f.id ?? '')).trim(),
        operator: toOperator(f.operator),
        value: String((f.value ?? '')).trim()
      }))
      .filter((f) => f.fieldId && f.value);
  }

  function normalizeFilterMatch(raw) {
    const value = String(raw || '').trim().toUpperCase();
    return value === 'ANY' ? 'ANY' : 'ALL';
  }

  function normalizeCounterColor(value) {
    const allowedColors = new Set(['default', 'blue', 'green', 'red', 'purple', 'orange']);
    const normalized = String(value || 'default').trim().toLowerCase();
    return allowedColors.has(normalized) ? normalized : 'default';
  }

  function normalizeDashboardCounters(raw) {
    let source = raw;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch (_) {
        source = [];
      }
    }
    if (!Array.isArray(source)) return [];
    const allowedOperators = new Set(['EX', 'XEX', 'CT']);
    const operatorMap = {
      'IS EQUAL TO': 'EX',
      '=': 'EX',
      EX: 'EX',
      'IS NOT EQUAL TO': 'XEX',
      'IS NOT': 'XEX',
      '!=': 'XEX',
      XEX: 'XEX',
      CONTAINS: 'CT',
      CT: 'CT'
    };
    return source
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const opKey = String(item.operator || '').trim().toUpperCase();
        const normalizedOperator = operatorMap[opKey] || opKey || 'EX';
        return {
          fieldId: String(item.fieldId ?? item.field_id ?? '').trim(),
          operator: allowedOperators.has(normalizedOperator) ? normalizedOperator : 'EX',
          value: String(item.value ?? '').trim(),
          label: String(item.label ?? '').trim(),
          color: normalizeCounterColor(item.color)
        };
      })
      .filter((item) => item.fieldId);
  }

  function getCounterGlassStyle(color) {
    const palette = {
      blue: 'background: rgba(33, 150, 243, 0.1); border: 1px solid rgba(33, 150, 243, 0.3); box-shadow: 0 4px 15px rgba(33, 150, 243, 0.1);',
      green: 'background: rgba(76, 175, 80, 0.1); border: 1px solid rgba(76, 175, 80, 0.3); box-shadow: 0 4px 15px rgba(76, 175, 80, 0.1);',
      red: 'background: rgba(244, 67, 54, 0.1); border: 1px solid rgba(244, 67, 54, 0.3); box-shadow: 0 4px 15px rgba(244, 67, 54, 0.1);',
      purple: 'background: rgba(156, 39, 176, 0.1); border: 1px solid rgba(156, 39, 176, 0.3); box-shadow: 0 4px 15px rgba(156, 39, 176, 0.1);',
      orange: 'background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); box-shadow: 0 4px 15px rgba(255, 152, 0, 0.1);',
      default: 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 4px 15px rgba(255,255,255,0.05);'
    };
    return palette[normalizeCounterColor(color)] || palette.default;
  }

  function counterToFilter(counter) {
    if (!counter || typeof counter !== 'object') return null;
    const fieldId = String(counter.fieldId || '').trim();
    const value = String(counter.value || '').trim();
    const operator = String(counter.operator || 'EX').trim().toUpperCase();
    if (!fieldId || !value) return null;
    return { fieldId, operator, value };
  }

  function rowsToCsv(rows, columns) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeColumns = Array.isArray(columns) ? columns : [];
    const headers = ['Case #'].concat(safeColumns.map((c) => String(c && c.label || c && c.id || 'Field')));
    const escapeCsv = (value) => {
      const text = String(value == null ? '' : value);
      const escaped = text.replace(/"/g, '""');
      if (/[,\n"]/g.test(escaped)) return `"${escaped}"`;
      return escaped;
    };
    const body = safeRows.map((row) => {
      const list = [String(row && row.qbRecordId || 'N/A')];
      safeColumns.forEach((col) => {
        const fid = String(col && col.id || '').trim();
        const val = row && row.fields && row.fields[fid] ? row.fields[fid].value : '';
        list.push(String(val == null ? '' : val));
      });
      return list.map(escapeCsv).join(',');
    });
    return [headers.map(escapeCsv).join(',')].concat(body).join('\n');
  }


  function parseQuickbaseSettings(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function generateUUID() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (_) {}
    return `qb-tab-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_) {
      return obj;
    }
  }

  function createDefaultSettings(source, defaults) {
    const src = source && typeof source === 'object' ? source : {};
    const base = defaults && typeof defaults === 'object' ? defaults : {};
    const reportLink = String(src.reportLink || src.qb_report_link || base.reportLink || '').trim();
    const parsed = parseQuickbaseLink(reportLink);
    const hasReportLink = !!reportLink;
    return {
      reportLink,
      qid: hasReportLink ? String(src.qid || src.qb_qid || parsed.qid || base.qid || '').trim() : '',
      tableId: hasReportLink ? String(src.tableId || src.qb_table_id || parsed.tableId || base.tableId || '').trim() : '',
      realm: hasReportLink ? String(src.realm || src.qb_realm || parsed.realm || base.realm || '').trim() : '',
      dashboard_counters: deepClone(normalizeDashboardCounters(src.dashboard_counters || src.dashboardCounters || base.dashboard_counters || [])),
      customColumns: deepClone(Array.isArray(src.customColumns || src.qb_custom_columns || base.customColumns)
        ? (src.customColumns || src.qb_custom_columns || base.customColumns).map((v) => String(v))
        : []),
      customFilters: deepClone(normalizeFilters(src.customFilters || src.qb_custom_filters || base.customFilters || [])),
      filterMatch: normalizeFilterMatch(src.filterMatch || src.qb_filter_match || base.filterMatch)
    };
  }

  function createTabMeta(source, defaults) {
    const src = source && typeof source === 'object' ? source : {};
    const base = defaults && typeof defaults === 'object' ? defaults : {};
    return {
      id: String(src.id || src.tabId || base.id || generateUUID()),
      tabName: String(src.tabName || src.name || base.tabName || 'Main Report').trim() || 'Main Report'
    };
  }

  function buildDefaultTab(source, defaults) {
    const src = source && typeof source === 'object' ? deepClone(source) : {};
    const base = defaults && typeof defaults === 'object' ? deepClone(defaults) : {};
    const reportLink = String(src.reportLink || src.qb_report_link || '').trim();
    const parsed = parseQuickbaseLink(reportLink);
    const hasReportLink = !!reportLink;
    return {
      id: String(src.id || generateUUID()),
      tabName: String(src.tabName || src.name || base.tabName || 'New Report').trim() || 'New Report',
      reportLink,
      qid: hasReportLink ? String(src.qid || src.qb_qid || parsed.qid || '').trim() : '',
      tableId: hasReportLink ? String(src.tableId || src.qb_table_id || parsed.tableId || '').trim() : '',
      realm: hasReportLink ? String(src.realm || src.qb_realm || parsed.realm || '').trim() : '',
      dashboard_counters: deepClone(normalizeDashboardCounters(src.dashboard_counters || src.dashboardCounters || [])),
      customColumns: deepClone(Array.isArray(src.customColumns || src.qb_custom_columns) ? (src.customColumns || src.qb_custom_columns).map((v) => String(v)) : []),
      customFilters: deepClone(normalizeFilters(src.customFilters || src.qb_custom_filters || [])),
      filterMatch: normalizeFilterMatch(src.filterMatch || src.qb_filter_match || 'ALL')
    };
  }

  function normalizeQuickbaseSettingsWithTabs(rawSettings, fallbackConfig) {
    const flat = normalizeQuickbaseConfig(fallbackConfig);
    const rawMissing = rawSettings == null;
    let parseFailed = false;
    let settings = {};
    if (!rawMissing && typeof rawSettings === 'string') {
      try {
        const parsed = JSON.parse(String(rawSettings));
        settings = parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) {
        parseFailed = true;
      }
    } else {
      settings = parseQuickbaseSettings(rawSettings);
    }

    // FIX: [Issue 1] - Preserve tab-based settings when serialized quickbase_settings has a tabs array.
    if (!parseFailed && Array.isArray(settings.tabs)) {
      const tabs = [];
      const settingsByTabId = {};
      settings.tabs.forEach((tab, idx) => {
        const tabMeta = createTabMeta(tab, { tabName: idx === 0 ? 'Main Report' : `Report ${idx + 1}` });
        const tabSettings = createDefaultSettings(tab, {});
        const isolatedTabSettings = createDefaultSettings(tabSettings, {});
        tabs.push(Object.assign({}, tabMeta, deepClone(isolatedTabSettings) || createDefaultSettings({}, {})));
        settingsByTabId[tabMeta.id] = deepClone(isolatedTabSettings) || createDefaultSettings({}, {});
      });
      // FIX: [Issue 1] - Defensive default when tabs array exists but is empty.
      const safeTabs = tabs.length ? tabs : [buildDefaultTab(settings, { tabName: 'Main Report' })];
      if (!tabs.length) settingsByTabId[safeTabs[0].id] = createDefaultSettings(settings, {});
      const maxIndex = safeTabs.length - 1;
      const activeTabIndex = Math.min(Math.max(Number(settings.activeTabIndex || 0), 0), maxIndex);
      return { activeTabIndex, tabs: safeTabs, settingsByTabId };
    }

    if (!rawMissing && parseFailed) {
      const tab = buildDefaultTab({}, { tabName: 'Main Report' });
      return { activeTabIndex: 0, tabs: [tab], settingsByTabId: { [tab.id]: createDefaultSettings({}, {}) } };
    }

    const primaryTab = buildDefaultTab(settings, { tabName: 'Main Report' });
    return {
      activeTabIndex: 0,
      tabs: [primaryTab],
      settingsByTabId: {
        [primaryTab.id]: createDefaultSettings(settings, {
          reportLink: flat.reportLink,
          qid: flat.qid,
          tableId: flat.tableId,
          customColumns: flat.customColumns,
          customFilters: flat.customFilters,
          filterMatch: flat.filterMatch,
          dashboard_counters: flat.dashboardCounters
        })
      }
    };
  }

  function normalizeQuickbaseConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    return {
      reportLink: String(cfg.reportLink || cfg.qb_report_link || '').trim(),
      qid: String(cfg.qid || cfg.qb_qid || '').trim(),
      tableId: String(cfg.tableId || cfg.qb_table_id || '').trim(),
      realm: String(cfg.realm || cfg.qb_realm || '').trim(),
      customColumns: Array.isArray(cfg.customColumns || cfg.qb_custom_columns)
        ? (cfg.customColumns || cfg.qb_custom_columns).map((v) => String(v))
        : [],
      customFilters: normalizeFilters(cfg.customFilters || cfg.qb_custom_filters),
      filterMatch: normalizeFilterMatch(cfg.filterMatch || cfg.qb_filter_match),
      dashboardCounters: normalizeDashboardCounters(cfg.dashboardCounters || cfg.dashboard_counters || cfg.qb_dashboard_counters)
    };
  }

  function hasUsableQuickbaseSettings(rawSettings) {
    const parsed = parseQuickbaseSettings(rawSettings);
    if (Array.isArray(parsed && parsed.tabs) && parsed.tabs.length > 0) return true;
    const cfg = normalizeQuickbaseConfig(parsed);
    return Boolean(
      String(cfg.reportLink || '').trim() ||
      String(cfg.qid || '').trim() ||
      String(cfg.tableId || '').trim() ||
      (Array.isArray(cfg.customColumns) && cfg.customColumns.length) ||
      (Array.isArray(cfg.customFilters) && cfg.customFilters.length) ||
      (Array.isArray(cfg.dashboardCounters) && cfg.dashboardCounters.length)
    );
  }

  function chooseInitialQuickbaseSettingsSource(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const hasBackendTabs = hasPersistedQuickbaseTabs(opts.backendQuickbaseSettings);
    const hasWindowMeTabs = hasPersistedQuickbaseTabs(opts.windowMeQuickbaseSettings);
    if (hasBackendTabs) return deepClone(opts.backendQuickbaseSettings);
    if (hasWindowMeTabs) return deepClone(opts.windowMeQuickbaseSettings);
    return deepClone(opts.localQuickbaseSettings || opts.backendQuickbaseSettings);
  }

  function getQuickbaseSettingsLocalKey(userId) {
    const safeUserId = String(userId || 'anonymous').trim() || 'anonymous';
    return `mums_my_quickbase_settings:${safeUserId}`;
  }

  function getQuickbaseTabsLocalKey(userId) {
    const safeUserId = String(userId || 'anonymous').trim() || 'anonymous';
    return `myQuickbase.tabs:${safeUserId}`;
  }

  function getQuickbaseTabSettingsLocalKey(userId, tabId) {
    const safeUserId = String(userId || 'anonymous').trim() || 'anonymous';
    const safeTabId = String(tabId || '').trim();
    return `myQuickbase.tab.${safeUserId}.${safeTabId}.settings`;
  }

  function readQuickbaseSettingsLocal(userId) {
    try {
      if (!window.localStorage) return null;
      const rawTabs = localStorage.getItem(getQuickbaseTabsLocalKey(userId));
      if (rawTabs) {
        const parsedTabs = JSON.parse(rawTabs);
        const tabs = Array.isArray(parsedTabs && parsedTabs.tabs) ? parsedTabs.tabs.map((tab, idx) => createTabMeta(tab, { tabName: idx === 0 ? 'Main Report' : `Report ${idx + 1}` })) : [];
        if (!tabs.length) return null;
        const settingsByTabId = {};
        const hydratedTabs = [];
        tabs.forEach((tab) => {
          const tabSettingsRaw = localStorage.getItem(getQuickbaseTabSettingsLocalKey(userId, tab.id));
          const parsedSettings = parseQuickbaseSettings(tabSettingsRaw);
          const normalizedSettings = createDefaultSettings(parsedSettings, {});
          settingsByTabId[tab.id] = deepClone(normalizedSettings) || createDefaultSettings({}, {});
          hydratedTabs.push(Object.assign({}, tab, deepClone(normalizedSettings) || createDefaultSettings({}, {})));
        });
        const maxIndex = tabs.length - 1;
        const activeTabIndex = Math.min(Math.max(Number(parsedTabs && parsedTabs.activeTabIndex || 0), 0), maxIndex);
        return { activeTabIndex, tabs: hydratedTabs, settingsByTabId };
      }

      const rawLegacy = localStorage.getItem(getQuickbaseSettingsLocalKey(userId));
      if (!rawLegacy) return null;
      const parsed = JSON.parse(rawLegacy);
      const settings = parsed && typeof parsed === 'object' && parsed.settings ? parsed.settings : parsed;
      return normalizeQuickbaseSettingsWithTabs(settings, {});
    } catch (_) {
      return null;
    }
  }

  function writeQuickbaseSettingsLocal(userId, settings) {
    try {
      if (!window.localStorage) return;
      const normalized = normalizeQuickbaseSettingsWithTabs(settings, {});
      const payload = {
        savedAt: Date.now(),
        activeTabIndex: normalized.activeTabIndex,
        tabs: normalized.tabs.map((tab) => {
          const tabMeta = createTabMeta(tab, {});
          const tabId = String(tabMeta.id || '').trim();
          const tabSettings = normalized.settingsByTabId && normalized.settingsByTabId[tabId]
            ? normalized.settingsByTabId[tabId]
            : createDefaultSettings(tab, {});
          return buildDefaultTab(Object.assign({}, tabMeta, tabSettings), {});
        })
      };
      localStorage.setItem(getQuickbaseTabsLocalKey(userId), JSON.stringify(payload));
      normalized.tabs.forEach((tab) => {
        const tabId = String(tab.id || '').trim();
        if (!tabId) return;
        const tabSettings = normalized.settingsByTabId && normalized.settingsByTabId[tabId]
          ? normalized.settingsByTabId[tabId]
          : createDefaultSettings({}, {});
        localStorage.setItem(getQuickbaseTabSettingsLocalKey(userId, tabId), JSON.stringify(tabSettings));
      });
    } catch (_) {}
  }

  function getProfileQuickbaseConfig(profile) {
    const p = profile && typeof profile === 'object' ? profile : {};
    const quickbaseSettings = parseQuickbaseSettings(p.quickbase_settings);
    const quickbaseConfig = parseQuickbaseSettings(p.quickbase_config);
    const settingsFromTabs = Array.isArray(quickbaseSettings.tabs) && quickbaseSettings.tabs.length
      ? (() => {
        const maxIndex = quickbaseSettings.tabs.length - 1;
        const idx = Math.min(Math.max(Number(quickbaseSettings.activeTabIndex || 0), 0), maxIndex);
        return quickbaseSettings.tabs[idx] || quickbaseSettings.tabs[0] || {};
      })()
      : null;
    const source = Object.keys(quickbaseSettings).length
      ? (settingsFromTabs || quickbaseSettings)
      : Object.keys(quickbaseConfig).length
        ? quickbaseConfig
        : normalizeQuickbaseConfig(p);
    return normalizeQuickbaseConfig(source);
  }

  function hasPersistedQuickbaseTabs(settings) {
    if (!settings || !Array.isArray(settings.tabs)) return false;
    return settings.tabs.some((tab) => {
      const rawTab = tab && typeof tab === 'object' ? tab : {};
      const normalizedTab = createDefaultSettings(rawTab, {});
      const hasReportConfig = !!String(normalizedTab.reportLink || normalizedTab.qid || normalizedTab.tableId || '').trim();
      const hasCustomColumns = Array.isArray(normalizedTab.customColumns) && normalizedTab.customColumns.length > 0;
      const hasFilterConfig = Array.isArray(normalizedTab.customFilters) && normalizedTab.customFilters.length > 0;
      const hasDashboardCounters = Array.isArray(normalizedTab.dashboard_counters) && normalizedTab.dashboard_counters.length > 0;
      return hasReportConfig || hasCustomColumns || hasFilterConfig || hasDashboardCounters;
    });
  }


  function renderDashboardCounters(root, records, settings, state, onCounterToggle) {
    const host = root.querySelector('#qbDashboardCounters');
    if (!host) return;
    try {
      const rows = Array.isArray(records) ? records : [];
      const dashboardCounters = normalizeDashboardCounters(settings && settings.dashboard_counters);
      if (!dashboardCounters.length) {
        host.innerHTML = '';
        return;
      }
      const widgets = dashboardCounters.map((counter, widgetsIndex) => {
        const matcherValue = String(counter.value || '').toLowerCase();
        const matchedRows = rows.filter((record) => {
          const fields = record && record.fields ? record.fields : {};
          const field = fields[String(counter.fieldId)] || null;
          const sourceValue = String(field && field.value != null ? field.value : '').toLowerCase();
          if (counter.operator === 'XEX') return sourceValue !== matcherValue;
          if (counter.operator === 'CT') return sourceValue.includes(matcherValue);
          return sourceValue === matcherValue;
        });

        const label = counter.label || 'N/A';
        return `
          <div class="qb-counter-widget ${state && state.activeCounterIndex === widgetsIndex ? 'is-active' : ''}" data-counter-idx="${widgetsIndex}" style="${getCounterGlassStyle(counter.color)}">
            <div class="qb-counter-label">${esc(label)}</div>
            <div class="qb-counter-value">${esc(String(matchedRows.length))}</div>
          </div>
        `;
      }).join('');

      host.innerHTML = widgets;
      host.querySelectorAll('[data-counter-idx]').forEach((el) => {
        el.onclick = () => {
          if (typeof onCounterToggle === 'function') onCounterToggle(Number(el.getAttribute('data-counter-idx')));
        };
      });
    } catch (_) {
      host.innerHTML = '';
    }
  }

  function renderRecords(root, payload, options) {
    const host = root.querySelector('#qbDataBody');
    const meta = root.querySelector('#qbDataMeta');
    if (!host || !meta) return;

    const columns = Array.isArray(payload && payload.columns) ? payload.columns : [];
    const rows = Array.isArray(payload && payload.records) ? payload.records : [];
    const opts = options && typeof options === 'object' ? options : {};

    if (!columns.length || !rows.length) {
      const emptyBySearch = !!opts.userInitiatedSearch;
      meta.textContent = 'No Quickbase Records Found';
      host.innerHTML = `<div class="card pad"><div class="small muted">${emptyBySearch ? 'No records match your filters.' : 'No records loaded. Open ⚙️ Settings to configure report, columns, and filters.'}</div></div>`;
      return;
    }

    const pageSize = Number(opts.pageSize || 100);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const activePage = Math.min(Math.max(Number(opts.page || 1), 1), totalPages);
    // FIX: [Issue 2] - Pagination for large record sets to avoid DOM-heavy render blocking.
    const visibleRows = rows.slice((activePage - 1) * pageSize, activePage * pageSize);
    meta.innerHTML = `${rows.length} record${rows.length === 1 ? '' : 's'} loaded${rows.length > pageSize ? ` • Page ${activePage}/${totalPages}` : ''}`;
    const toDurationLabel = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return String(value == null ? 'N/A' : value);
      const hours = numeric / (1000 * 60 * 60);
      if (hours < 24) {
        const roundedHours = Math.max(1, Math.round(hours));
        return `${roundedHours} hr${roundedHours === 1 ? '' : 's'}`;
      }
      const days = Math.floor(hours / 24);
      const remainingHours = Math.round(hours - (days * 24));
      if (remainingHours <= 0) return `${days} day${days === 1 ? '' : 's'}`;
      return `${days} day${days === 1 ? '' : 's'} ${remainingHours} hr${remainingHours === 1 ? '' : 's'}`;
    };

    const headers = columns.map((c) => `<th>${esc(c.label || c.id || 'Field')}</th>`).join('');
    const body = visibleRows.map((r) => {
      const cells = columns.map((c) => {
        const field = r && r.fields ? r.fields[String(c.id)] : null;
        const rawValue = field && field.value != null ? field.value : 'N/A';
        const normalizedLabel = String(c && c.label || '').trim().toLowerCase();
        const value = (normalizedLabel === 'last update days' || normalizedLabel === 'age')
          ? toDurationLabel(rawValue)
          : String(rawValue);
        return `<td>${esc(value)}</td>`;
      }).join('');
      return `<tr><td class="qb-case-id">${esc(String(r && r.qbRecordId || 'N/A'))}</td>${cells}</tr>`;
    }).join('');

    host.innerHTML = `<div class="qb-table-inner"><table class="qb-data-table"><thead><tr><th>Case #</th>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
    if (rows.length > pageSize && typeof opts.onPageChange === 'function') {
      const pager = document.createElement('div');
      pager.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:8px;';
      pager.innerHTML = `
        <button type="button" class="btn" data-page-nav="prev" ${activePage <= 1 ? 'disabled' : ''}>Prev</button>
        <span class="small muted">Page ${activePage} of ${totalPages}</span>
        <button type="button" class="btn" data-page-nav="next" ${activePage >= totalPages ? 'disabled' : ''}>Next</button>
      `;
      host.appendChild(pager);
      pager.querySelectorAll('[data-page-nav]').forEach((btn) => {
        btn.onclick = () => {
          const direction = btn.getAttribute('data-page-nav');
          const nextPage = direction === 'next' ? activePage + 1 : activePage - 1;
          opts.onPageChange(nextPage);
        };
      });
    }
  }


  function shouldApplyInitialFilters(searchInput) {
    return String(searchInput || '').trim().length > 0;
  }

  function filterRecordsBySearch(payload, searchTerm) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const columns = Array.isArray(source.columns) ? source.columns : [];
    const records = Array.isArray(source.records) ? source.records : [];
    const term = String(searchTerm || '').trim().toLowerCase();
    if (!term) {
      return { columns, records };
    }

    const filtered = records.filter((row) => {
      const caseId = String(row && row.qbRecordId || '').toLowerCase();
      if (caseId.includes(term)) return true;
      return columns.some((col) => {
        const fid = String(col && col.id || '').trim();
        if (!fid) return false;
        const cellValue = row && row.fields && row.fields[fid] ? row.fields[fid].value : '';
        return String(cellValue == null ? '' : cellValue).toLowerCase().includes(term);
      });
    });

    return { columns, records: filtered };
  }

  function filterRecordsByCounter(payload, counter) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const columns = Array.isArray(source.columns) ? source.columns : [];
    const records = Array.isArray(source.records) ? source.records : [];
    const activeFilter = counterToFilter(counter);
    if (!activeFilter) return { columns, records };

    const targetFieldId = String(activeFilter.fieldId || '').trim();
    const matcherValue = String(activeFilter.value || '').toLowerCase();
    const op = String(activeFilter.operator || 'EX').toUpperCase();

    const filtered = records.filter((record) => {
      const fields = record && record.fields ? record.fields : {};
      const field = fields[targetFieldId] || null;
      const sourceValue = String(field && field.value != null ? field.value : '').toLowerCase();
      if (op === 'XEX') return sourceValue !== matcherValue;
      if (op === 'CT') return sourceValue.includes(matcherValue);
      return sourceValue === matcherValue;
    });

    return { columns, records: filtered };
  }

  function shouldApplyServerFilters(options) {
    const opts = options && typeof options === 'object' ? options : {};
    return opts.applyFilters === true;
  }

  if (window.__MUMS_TEST_HOOKS__) {
    window.__MUMS_TEST_HOOKS__.myQuickbase = {
      shouldApplyInitialFilters,
      filterRecordsBySearch,
      filterRecordsByCounter,
      shouldApplyServerFilters,
      getQuickbaseSettingsLocalKey,
      getQuickbaseTabsLocalKey,
      getQuickbaseTabSettingsLocalKey,
      readQuickbaseSettingsLocal,
      writeQuickbaseSettingsLocal,
      normalizeQuickbaseSettingsWithTabs,
      createDefaultSettings,
      parseQuickbaseReportUrl,
      hasPersistedQuickbaseTabs,
      hasUsableQuickbaseSettings,
      chooseInitialQuickbaseSettingsSource
    };
  }

  window.Pages.my_quickbase = async function(root) {
    const AUTO_REFRESH_MS = 5000;
    const me = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    const tabManager = (window.TabManager && typeof window.TabManager.init === 'function')
      ? window.TabManager.init({ userId: me && me.id, apiBaseUrl: '/api' })
      : null;
    let profile = (me && window.Store && Store.getProfile) ? (Store.getProfile(me.id) || {}) : {};

    async function refreshProfileFromCloud() {
      if (!me || !window.CloudUsers || typeof window.CloudUsers.me !== 'function') return;
      try {
        const out = await window.CloudUsers.me();
        const cloudProfile = out && out.ok && out.profile && typeof out.profile === 'object' ? out.profile : null;
        if (!cloudProfile) return;
        profile = cloudProfile;
        if (window.Store && typeof Store.setProfile === 'function') {
          Store.setProfile(me.id, Object.assign({}, cloudProfile, { updatedAt: Date.now() }));
        }
      } catch (_) {}
    }

    await refreshProfileFromCloud();
    profile = (me && window.Store && Store.getProfile) ? (Store.getProfile(me.id) || {}) : {};

    const cloudMe = window.me && typeof window.me === 'object' ? window.me : {};
    const profileWithCloudFallback = Object.assign({}, cloudMe, profile);
    if (
      cloudMe
      && Object.prototype.hasOwnProperty.call(cloudMe, 'quickbase_settings')
      && hasUsableQuickbaseSettings(cloudMe.quickbase_settings)
    ) {
      profileWithCloudFallback.quickbase_settings = cloudMe.quickbase_settings;
    }
    const quickbaseConfig = getProfileQuickbaseConfig(profileWithCloudFallback);
    const windowMeQuickbaseSettingsRaw = cloudMe && Object.prototype.hasOwnProperty.call(cloudMe, 'quickbase_settings')
      ? cloudMe.quickbase_settings
      : null;
    const parsedWindowMeQuickbaseSettings = parseQuickbaseSettings(windowMeQuickbaseSettingsRaw);
    const localQuickbaseSettings = readQuickbaseSettingsLocal(me && me.id);
    const backendQuickbaseSettings = normalizeQuickbaseSettingsWithTabs(profileWithCloudFallback.quickbase_settings, quickbaseConfig);
    const windowMeQuickbaseSettings = normalizeQuickbaseSettingsWithTabs(windowMeQuickbaseSettingsRaw, quickbaseConfig);
    const quickbaseSettings = chooseInitialQuickbaseSettingsSource({
      backendQuickbaseSettings,
      windowMeQuickbaseSettings,
      localQuickbaseSettings
    });
    const initialTabMeta = quickbaseSettings.tabs[quickbaseSettings.activeTabIndex] || quickbaseSettings.tabs[0] || createTabMeta({}, { tabName: 'Main Report' });
    const initialTabId = String(initialTabMeta.id || '').trim();
    const initialTabSettings = createDefaultSettings((quickbaseSettings.settingsByTabId && quickbaseSettings.settingsByTabId[initialTabId]) || {}, {});
    const initialLink = String(initialTabSettings.reportLink || '').trim();
    const parsedFromLink = parseQuickbaseLink(initialLink);
    const state = {
      quickbaseSettings,
      activeTabIndex: quickbaseSettings.activeTabIndex,
      modalDraft: null,
      tabName: String(initialTabMeta.tabName || 'Main Report').trim(),
      reportLink: initialLink,
      qid: String(initialTabSettings.qid || parsedFromLink.qid || '').trim(),
      tableId: String(initialTabSettings.tableId || parsedFromLink.tableId || '').trim(),
      realm: String(initialTabSettings.realm || parsedFromLink.realm || '').trim(),
      customColumns: Array.isArray(initialTabSettings.customColumns) ? initialTabSettings.customColumns.map((v) => String(v)) : [],
      customFilters: normalizeFilters(initialTabSettings.customFilters),
      filterMatch: normalizeFilterMatch(initialTabSettings.filterMatch),
      dashboardCounters: normalizeDashboardCounters(initialTabSettings.dashboard_counters),
      allAvailableFields: [],
      isSaving: false,
      activeCounterIndex: -1,
      searchTerm: '',
      searchDebounceTimer: null,
      baseRecords: [],
      rawPayload: { columns: [], records: [] },
      currentPayload: { columns: [], records: [] },
      hasUserSearched: false,
      didInitialDefaultRender: false,
      isDefaultReportMode: false,
      currentPage: 1,
      pageSize: 100,
      qbCache: {},
      settingsModalView: 'report-config',
      settingsEditingTabId: ''
    };

    function syncTabManagerFromState(tabId) {
      if (!tabManager) return;
      const safeTabId = String(tabId || '').trim();
      if (!safeTabId) return;
      const tabMeta = Array.isArray(state.quickbaseSettings.tabs)
        ? state.quickbaseSettings.tabs.find((tab) => String(tab && tab.id || '').trim() === safeTabId)
        : null;
      const tabSettings = state.quickbaseSettings.settingsByTabId && state.quickbaseSettings.settingsByTabId[safeTabId]
        ? state.quickbaseSettings.settingsByTabId[safeTabId]
        : createDefaultSettings({}, {});
      tabManager.updateTabLocal(safeTabId, Object.assign({}, tabSettings, {
        tabName: String(tabMeta && tabMeta.tabName || tabSettings.tabName || 'New Tab').trim()
      }));
    }

    const cleanupHandlers = [];
    let modalBindingsActive = false;
    let quickbaseLoadInFlight = null;
    let quickbaseRefreshTimer = null;
    let lastQuickbaseLoadAt = 0;
    let autosaveTimer = null;

    const QUICKBASE_CACHE_TTL_MS = 2 * 60 * 1000;
    const QUICKBASE_BACKGROUND_LIMIT = 500;

    function getQuickbaseCacheKey({ tableId, qid, filters, filterMatch }) {
      const hashBase = JSON.stringify({ tableId, qid, filters, filterMatch });
      return `qb_cache:${hashBase}`;
    }

    function readQuickbaseCache(cacheKey) {
      const now = Date.now();
      const memoryEntry = state.qbCache[cacheKey];
      if (memoryEntry && (now - memoryEntry.savedAt) < QUICKBASE_CACHE_TTL_MS) return memoryEntry.payload;
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || (now - Number(parsed.savedAt || 0)) >= QUICKBASE_CACHE_TTL_MS) {
          sessionStorage.removeItem(cacheKey);
          return null;
        }
        state.qbCache[cacheKey] = parsed;
        return parsed.payload || null;
      } catch (_) {
        return null;
      }
    }

    function writeQuickbaseCache(cacheKey, payload) {
      const entry = { savedAt: Date.now(), payload };
      state.qbCache[cacheKey] = entry;
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch (_) {}
    }

    function mergeRecordsById(existingRecords, incomingRecords) {
      const merged = [];
      const seen = new Set();
      (Array.isArray(existingRecords) ? existingRecords : []).concat(Array.isArray(incomingRecords) ? incomingRecords : []).forEach((record) => {
        const id = String(record && record.qbRecordId || '');
        if (!id || seen.has(id)) return;
        seen.add(id);
        merged.push(record);
      });
      return merged;
    }

    // FIX: [Issue 1] - Ensure active tab state is immediately aligned after profile load.
    state.activeTabIndex = quickbaseSettings.activeTabIndex;
    state.quickbaseSettings.activeTabIndex = quickbaseSettings.activeTabIndex;
    syncStateFromActiveTab();

    function getActiveTabMeta() {
      const tabs = Array.isArray(state.quickbaseSettings && state.quickbaseSettings.tabs) ? state.quickbaseSettings.tabs : [];
      if (!tabs.length) {
        const firstTab = createTabMeta({}, { tabName: 'Main Report' });
        state.quickbaseSettings = {
          activeTabIndex: 0,
          tabs: [firstTab],
          settingsByTabId: { [firstTab.id]: createDefaultSettings({}, {}) }
        };
      }
      const safeTabs = state.quickbaseSettings.tabs;
      const safeIndex = Math.min(Math.max(Number(state.activeTabIndex || 0), 0), safeTabs.length - 1);
      state.activeTabIndex = safeIndex;
      state.quickbaseSettings.activeTabIndex = safeIndex;
      return safeTabs[safeIndex];
    }

    function getActiveTabId() {
      return String((getActiveTabMeta() || {}).id || '').trim();
    }

    function getActiveTab() {
      const meta = getActiveTabMeta();
      const tabId = String(meta && meta.id || '').trim();
      const settings = createDefaultSettings((state.quickbaseSettings.settingsByTabId && state.quickbaseSettings.settingsByTabId[tabId]) || {}, {});
      return Object.assign({}, meta, settings);
    }

    function getActiveTabKey() {
      const activeTabId = getActiveTabId();
      return String(activeTabId || state.activeTabIndex);
    }

    function getActiveSearchTerm() {
      if (!state.quickbaseSettings || !state.quickbaseSettings.tabs || !state.quickbaseSettings.tabs[state.activeTabIndex]) return '';
      if (!state.searchByTab || typeof state.searchByTab !== 'object') state.searchByTab = {};
      return String(state.searchByTab[getActiveTabKey()] || '').trim();
    }

    function setActiveSearchTerm(value) {
      if (!state.quickbaseSettings || !state.quickbaseSettings.tabs || !state.quickbaseSettings.tabs[state.activeTabIndex]) return;
      if (!state.searchByTab || typeof state.searchByTab !== 'object') state.searchByTab = {};
      state.searchByTab[getActiveTabKey()] = String(value || '').trim();
    }

    function getActiveUserSearched() {
      if (!state.quickbaseSettings || !state.quickbaseSettings.tabs || !state.quickbaseSettings.tabs[state.activeTabIndex]) return false;
      if (!state.userSearchedByTab || typeof state.userSearchedByTab !== 'object') state.userSearchedByTab = {};
      return !!state.userSearchedByTab[getActiveTabKey()];
    }

    function setActiveUserSearched(value) {
      if (!state.quickbaseSettings || !state.quickbaseSettings.tabs || !state.quickbaseSettings.tabs[state.activeTabIndex]) return;
      if (!state.userSearchedByTab || typeof state.userSearchedByTab !== 'object') state.userSearchedByTab = {};
      state.userSearchedByTab[getActiveTabKey()] = !!value;
    }

    function syncStateFromActiveTab() {
      const activeTab = buildDefaultTab(deepClone(getActiveTab()) || {});
      const parsed = parseQuickbaseLink(activeTab.reportLink);
      state.tabName = String(activeTab.tabName || 'Main Report').trim() || 'Main Report';
      state.reportLink = String(activeTab.reportLink || '').trim();
      state.qid = String(activeTab.qid || parsed.qid || '').trim();
      state.tableId = String(activeTab.tableId || parsed.tableId || '').trim();
      state.realm = String(activeTab.realm || parsed.realm || '').trim();
      state.customColumns = Array.isArray(activeTab.customColumns) ? activeTab.customColumns.map((v) => String(v)) : [];
      state.customFilters = normalizeFilters(activeTab.customFilters);
      state.filterMatch = normalizeFilterMatch(activeTab.filterMatch);
      state.dashboardCounters = normalizeDashboardCounters(activeTab.dashboard_counters);
      state.activeCounterIndex = -1;
      const headerSearch = root.querySelector('#qbHeaderSearch');
      if (headerSearch) headerSearch.value = getActiveSearchTerm();
      const instanceTitle = root.querySelector('#qbInstanceTitle');
      if (instanceTitle) instanceTitle.textContent = state.tabName || 'Main Report';
    }

    function syncSettingsInputsFromState() {
      const tabNameEl = root.querySelector('#qbTabName');
      if (tabNameEl) tabNameEl.value = String(state.tabName || 'Main Report');

      const reportLinkEl = root.querySelector('#qbReportLink');
      if (reportLinkEl) reportLinkEl.value = String(state.reportLink || '');

      const qidEl = root.querySelector('#qbQid');
      if (qidEl) qidEl.value = String(state.qid || '');

      const tabBaseQidEl = root.querySelector('#qbTabBaseQid');
      if (tabBaseQidEl) tabBaseQidEl.value = String(state.qid || '');

      const tableIdEl = root.querySelector('#qbTableId');
      if (tableIdEl) tableIdEl.value = String(state.tableId || '');

      const filterMatchEl = root.querySelector('#qbFilterMatch');
      if (filterMatchEl) filterMatchEl.value = normalizeFilterMatch(state.filterMatch);
    }

    function syncActiveTabFromState() {
      const activeMeta = getActiveTabMeta();
      const tabId = String(activeMeta && activeMeta.id || '').trim() || generateUUID();
      const nextMeta = createTabMeta({
        id: tabId,
        tabName: String(state.tabName || 'Main Report').trim() || 'Main Report'
      });
      const nextSettings = createDefaultSettings({
        reportLink: String(state.reportLink || '').trim(),
        qid: String(state.qid || '').trim(),
        tableId: String(state.tableId || '').trim(),
        realm: String(state.realm || '').trim(),
        customColumns: Array.isArray(state.customColumns) ? state.customColumns.map((v) => String(v)) : [],
        customFilters: normalizeFilters(state.customFilters),
        filterMatch: normalizeFilterMatch(state.filterMatch),
        dashboard_counters: normalizeDashboardCounters(state.dashboardCounters)
      });
      state.quickbaseSettings.tabs[state.activeTabIndex] = deepClone(nextMeta) || createTabMeta({}, {});
      state.quickbaseSettings.settingsByTabId = Object.assign({}, state.quickbaseSettings.settingsByTabId || {}, {
        [tabId]: deepClone(nextSettings) || createDefaultSettings({}, {})
      });
      state.quickbaseSettings.activeTabIndex = state.activeTabIndex;
      state.modalDraft = deepClone(Object.assign({}, nextMeta, nextSettings)) || buildDefaultTab();
    }


    function updateTabSettings(tabId, partialUpdate) {
      const safeTabId = String(tabId || '').trim();
      if (!safeTabId) return;
      const nextPartial = partialUpdate && typeof partialUpdate === 'object' ? partialUpdate : {};
      const prevSettings = state.quickbaseSettings.settingsByTabId && state.quickbaseSettings.settingsByTabId[safeTabId]
        ? state.quickbaseSettings.settingsByTabId[safeTabId]
        : createDefaultSettings({}, {});
      const nextSettings = createDefaultSettings(Object.assign({}, deepClone(prevSettings) || createDefaultSettings({}, {}), nextPartial), {});
      state.quickbaseSettings.settingsByTabId = Object.assign({}, state.quickbaseSettings.settingsByTabId || {}, {
        [safeTabId]: deepClone(nextSettings) || createDefaultSettings({}, {})
      });
      const tabIndex = Array.isArray(state.quickbaseSettings.tabs)
        ? state.quickbaseSettings.tabs.findIndex((tab) => String(tab && tab.id || '').trim() === safeTabId)
        : -1;
      if (tabIndex >= 0) {
        const tabMeta = createTabMeta(state.quickbaseSettings.tabs[tabIndex], {});
        state.quickbaseSettings.tabs[tabIndex] = deepClone(tabMeta) || createTabMeta({}, {});
      }
    }

    function handleReportLinkChange(tabId, value) {
      const safeTabId = String(tabId || '').trim();
      if (!safeTabId) return;
      const reportLink = String(value || '').trim();
      updateTabSettings(safeTabId, { reportLink });
      const parsed = parseQuickbaseReportUrl(reportLink);
      const parsedLink = parseQuickbaseLink(reportLink);
      const updates = {};
      if (!reportLink) {
        updates.qid = '';
        updates.tableId = '';
        updates.realm = '';
      } else {
        if (parsed && parsed.qid) {
          updates.qid = parsed.qid;
        }
        if (parsed && parsed.tableId) {
          updates.tableId = parsed.tableId;
        }
        if (parsedLink && parsedLink.realm) {
          updates.realm = parsedLink.realm;
        }
      }
      if (Object.keys(updates).length) updateTabSettings(safeTabId, updates);

      if (safeTabId === getActiveTabId()) {
        state.reportLink = reportLink;
        if (Object.prototype.hasOwnProperty.call(updates, 'qid')) state.qid = String(updates.qid || '').trim();
        if (Object.prototype.hasOwnProperty.call(updates, 'tableId')) state.tableId = String(updates.tableId || '').trim();
        if (Object.prototype.hasOwnProperty.call(updates, 'realm')) state.realm = String(updates.realm || '').trim();
        syncSettingsInputsFromState();
      }
    }

    function validateQidMatchesUrl(tabSettings) {
      const tab = tabSettings && typeof tabSettings === 'object' ? tabSettings : {};
      const reportLink = String(tab.reportLink || '').trim();
      const qid = String(tab.qid || '').trim();
      if (!reportLink) return { ok: true };
      if (!ENABLE_QID_URL_MATCH_VALIDATION) return { ok: true };
      const parsed = parseQuickbaseReportUrl(reportLink);
      if (parsed && parsed.qid && qid && parsed.qid !== qid) {
        return { ok: false, field: 'qid', message: 'QID must match the qid value inside the Report Link URL.' };
      }
      return { ok: true };
    }

    function validateQuickbaseTabSettings(tabSettings) {
      return validateQidMatchesUrl(tabSettings);
    }

    /**
     * My Quickbase per-tab settings isolation – migration note
     * - Internal state now stores per-tab settings in settingsByTabId with cloned objects (no shared references).
     * - Report Link parsing auto-syncs qid/tableId for each tab independently.
     * - Save payload stays backward compatible: profile.quickbase_settings preserves legacy { activeTabIndex, tabs } shape.
     * - Future readers must not rely on object identity being shared across tabs.
     */
    function serializeQuickbaseSettingsForSave(quickbaseSettingsState, activeTabIndex) {
      const settingsState = quickbaseSettingsState && typeof quickbaseSettingsState === 'object' ? quickbaseSettingsState : {};
      const tabs = Array.isArray(settingsState.tabs) ? settingsState.tabs : [];
      const settingsByTabId = settingsState.settingsByTabId && typeof settingsState.settingsByTabId === 'object'
        ? settingsState.settingsByTabId
        : {};

      return {
        activeTabIndex: Number.isFinite(Number(activeTabIndex)) ? Number(activeTabIndex) : 0,
        tabs: tabs.map((tab) => {
          const tabMeta = createTabMeta(tab, {});
          const tabId = String(tabMeta.id || '').trim();
          const tabSettings = createDefaultSettings(settingsByTabId[tabId] || tab || {}, {});
          return buildDefaultTab(Object.assign({}, tabMeta, tabSettings), {});
        })
      };
    }


    function captureSettingsDraftFromInputs() {
      const tabNameEl = root.querySelector('#qbTabName');
      const reportLinkEl = root.querySelector('#qbReportLink');
      const tabBaseQidEl = root.querySelector('#qbTabBaseQid');
      const qidEl = root.querySelector('#qbQid');
      const tableIdEl = root.querySelector('#qbTableId');
      const filterMatchEl = root.querySelector('#qbFilterMatch');

      const reportLink = String(reportLinkEl && reportLinkEl.value || state.reportLink || '').trim();
      const parsed = parseQuickbaseLink(reportLink);
      const hasReportLink = !!reportLink;
      const resolvedQid = hasReportLink
        ? String(tabBaseQidEl && tabBaseQidEl.value || qidEl && qidEl.value || parsed.qid || state.qid || '').trim()
        : '';
      const resolvedTableId = hasReportLink
        ? String(tableIdEl && tableIdEl.value || parsed.tableId || state.tableId || '').trim()
        : '';
      const resolvedRealm = hasReportLink ? String(parsed.realm || state.realm || '').trim() : '';

      state.tabName = String(tabNameEl && tabNameEl.value || state.tabName || 'Main Report').trim() || 'Main Report';
      state.reportLink = reportLink;
      state.qid = resolvedQid;
      state.tableId = resolvedTableId;
      state.realm = resolvedRealm;
      state.filterMatch = normalizeFilterMatch(String(filterMatchEl && filterMatchEl.value || state.filterMatch || 'ALL'));
      syncActiveTabFromState();
    }

    function scrapeModalCounterInputs() {
      const rows = Array.from(root.querySelectorAll('#qbCounterRows [data-counter-idx]'));
      return rows
        .map((row) => {
          const fieldId = String((row.querySelector('[data-counter-f="fieldId"]') || {}).value || '').trim();
          const operator = String((row.querySelector('[data-counter-f="operator"]') || {}).value || 'EX').trim().toUpperCase();
          const value = String((row.querySelector('[data-counter-f="value"]') || {}).value || '').trim();
          const label = String((row.querySelector('[data-counter-f="label"]') || {}).value || '').trim();
          const color = String((row.querySelector('[data-counter-f="color"]') || {}).value || 'default').trim().toLowerCase();
          return { fieldId, operator, value, label, color };
        })
        .filter((counter) => counter.fieldId && counter.value);
    }

    function renderTabBar() {
      const tabBar = root.querySelector('#qbTabBar');
      if (!tabBar) return;
      const tabs = state.quickbaseSettings.tabs || [];
      tabBar.innerHTML = tabs.map((tab, idx) => `
        <button type="button" data-tab-idx="${idx}" style="padding:8px 16px;border-radius:8px;background:${idx === state.activeTabIndex ? 'rgba(33, 150, 243, 0.2)' : 'rgba(255,255,255,0.05)'};border:1px solid ${idx === state.activeTabIndex ? '#2196F3' : 'rgba(255,255,255,0.1)'};cursor:pointer;color:${idx === state.activeTabIndex ? '#fff' : '#888'};transition:0.2s;white-space:nowrap;">${esc(tab.tabName || `Report ${idx + 1}`)}</button>
      `).join('') + '<button type="button" id="qbAddTabBtn" title="Add New Tab" aria-label="Add New Tab" style="padding:8px 12px;min-width:38px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);cursor:pointer;color:#888;transition:0.2s;white-space:nowrap;font-size:18px;line-height:1;">+</button>';
    }

    function setSettingsModalView(viewKey) {
      const allowedViews = new Set(['report-config', 'custom-columns', 'filter-config', 'dashboard-counters']);
      const nextView = allowedViews.has(String(viewKey || '').trim()) ? String(viewKey).trim() : 'report-config';
      state.settingsModalView = nextView;

      root.querySelectorAll('[data-qb-settings-view]').forEach((section) => {
        const sectionView = String(section.getAttribute('data-qb-settings-view') || '').trim();
        section.style.display = sectionView === nextView ? 'block' : 'none';
      });

      root.querySelectorAll('[data-qb-settings-tab]').forEach((btn) => {
        const tabView = String(btn.getAttribute('data-qb-settings-tab') || '').trim();
        const isActive = tabView === nextView;
        btn.style.color = isActive ? '#fff' : 'rgba(226,232,240,0.78)';
        btn.style.borderBottom = isActive ? '2px solid #2196F3' : '2px solid transparent';
        btn.style.background = 'transparent';
      });
    }

    function scrapeModalSettingsIntoActiveTab() {
      const activeTab = getActiveTab();
      const tabNameInput = String((root.querySelector('#qbTabName') || {}).value || '').trim();
      const tabBaseQidInput = String((root.querySelector('#qbTabBaseQid') || {}).value || '').trim();
      const reportLink = String((root.querySelector('#qbReportLink') || {}).value || '').trim();
      const qidInput = String((root.querySelector('#qbQid') || {}).value || '').trim();
      const tableIdInput = String((root.querySelector('#qbTableId') || {}).value || '').trim();
      const parsed = parseQuickbaseLink(reportLink);
      const hasReportLink = !!reportLink;
      const scrapedCounters = normalizeDashboardCounters(scrapeModalCounterInputs());

      activeTab.tabName = tabNameInput || activeTab.tabName || 'Main Report';
      activeTab.reportLink = reportLink;
      activeTab.qid = hasReportLink ? (tabBaseQidInput || qidInput || parsed.qid || '') : '';
      activeTab.tableId = hasReportLink ? (tableIdInput || parsed.tableId || '') : '';
      activeTab.realm = hasReportLink ? (parsed.realm || '') : '';
      activeTab.dashboard_counters = scrapedCounters;

      state.tabName = activeTab.tabName;
      state.reportLink = activeTab.reportLink;
      state.qid = activeTab.qid;
      state.tableId = activeTab.tableId;
      state.realm = activeTab.realm;
      state.dashboardCounters = scrapedCounters;
      syncActiveTabFromState();
    }

    function scrapeModalTabSnapshot() {
      const tabName = String((root.querySelector('#qbTabName') || {}).value || '').trim() || 'Main Report';
      const reportLink = String((root.querySelector('#qbReportLink') || {}).value || '').trim();
      const baseQid = String((root.querySelector('#qbTabBaseQid') || {}).value || '').trim();
      const qid = String((root.querySelector('#qbQid') || {}).value || '').trim();
      const tableId = String((root.querySelector('#qbTableId') || {}).value || '').trim();
      const parsed = parseQuickbaseLink(reportLink);
      const hasReportLink = !!reportLink;
      return {
        tabName,
        reportLink,
        qid: hasReportLink ? (baseQid || qid || parsed.qid || '') : '',
        tableId: hasReportLink ? (tableId || parsed.tableId || '') : '',
        realm: hasReportLink ? (parsed.realm || '') : '',
        dashboard_counters: normalizeDashboardCounters(scrapeModalCounterInputs())
      };
    }

    async function persistQuickbaseSettings() {
      if (!me) return;
      scrapeModalSettingsIntoActiveTab();
      syncActiveTabFromState();
      const activeTab = getActiveTab();
      const parsed = parseQuickbaseLink(activeTab.reportLink);
      const activeSettingsObject = {
        reportLink: activeTab.reportLink,
        qid: activeTab.qid || parsed.qid,
        realm: activeTab.realm || parsed.realm,
        tableId: activeTab.tableId || parsed.tableId,
        customColumns: activeTab.customColumns,
        customFilters: activeTab.customFilters,
        filterMatch: activeTab.filterMatch,
        dashboardCounters: normalizeDashboardCounters(activeTab.dashboard_counters)
      };
      const serializedQuickbaseSettings = serializeQuickbaseSettingsForSave(state.quickbaseSettings, state.activeTabIndex);
      const payload = {
        qb_report_link: activeSettingsObject.reportLink,
        qb_qid: activeSettingsObject.qid,
        qb_realm: activeSettingsObject.realm,
        qb_table_id: activeSettingsObject.tableId,
        qb_custom_columns: activeSettingsObject.customColumns,
        qb_custom_filters: activeSettingsObject.customFilters,
        qb_filter_match: activeSettingsObject.filterMatch,
        qb_dashboard_counters: activeSettingsObject.dashboardCounters,
        quickbase_config: activeSettingsObject,
        quickbase_settings: {
          activeTabIndex: state.activeTabIndex || 0,
          tabs: (state.quickbaseSettings && state.quickbaseSettings.tabs) || []
        }
      };
      writeQuickbaseSettingsLocal(me.id, serializedQuickbaseSettings);
      const authToken = window.CloudAuth && typeof CloudAuth.accessToken === 'function' ? CloudAuth.accessToken() : '';
      const res = await fetch('/api/users/update_me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.message || out.error || 'Could not save Quickbase settings.');
      console.log('[Cloud Sync] Multi-Tab Settings Saved');
      if (window.Store && Store.setProfile) {
        Store.setProfile(me.id, Object.assign({}, payload, { updatedAt: Date.now() }));
      }
      writeQuickbaseSettingsLocal(me.id, serializedQuickbaseSettings);
    }

    function queuePersistQuickbaseSettings() {
      if (!me) return;
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(async () => {
        try {
          await persistQuickbaseSettings();
        } catch (_) {}
      }, 700);
    }


    root.innerHTML = `
      <div class="dashx qb-page-shell">
        <div class="qb-static-zone">
        <div id="qbTabBar" style="display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0;padding:0;"></div>

        <div class="card pad" style="margin-top:0;padding-top:0;margin-bottom:12px;backdrop-filter: blur(14px); background: linear-gradient(130deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.16);">
          <div class="row" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
            <div>
              <div class="h3" id="qbInstanceTitle" style="margin:0;">${esc(state.tabName || 'Main Report')}</div>
              <div class="small muted">Active tab instance dashboard</div>
            </div>
            <div class="row qb-header-search-wrap" style="gap:8px;align-items:center;justify-content:center;flex:1;">
              <input class="input qb-header-search" id="qbHeaderSearch" type="search" placeholder="Search across active tab records..." />
              <button class="btn" id="qbExportCsvBtn" type="button">Export CSV</button>
            </div>
            <div class="row" style="gap:8px;">
              <button class="btn" id="qbReloadBtn" type="button">Reload</button>
              <button class="btn primary" id="qbOpenSettingsBtn" type="button">⚙️ Settings</button>
            </div>
          </div>
        </div>

        <div style="margin-top:15px;">
          <div id="qbDashboardCounters" class="qb-dashboard-counters"></div>

        <div class="card pad qb-table-card">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div class="h3" style="margin:0;">Quickbase Records</div>
            <div id="qbDataMeta" class="small muted">Loading…</div>
          </div>
          <div id="qbDataBody" class="qb-data-body"></div>
        </div>
      </div>
      </div>
      </div>

      <div class="modal" id="qbSettingsModal" aria-hidden="true">
        <div class="panel" style="max-width:980px; width:min(980px,96vw); background: linear-gradient(140deg, rgba(23,35,67,.88), rgba(15,23,42,.82)); border:1px solid rgba(255,255,255,.18); backdrop-filter: blur(18px);">
          <div id="qbSettingsSavingLock" style="display:none;position:absolute;inset:0;z-index:90;align-items:center;justify-content:center;background:rgba(2,6,23,.72);backdrop-filter:blur(3px);border-radius:16px;">
            <div class="small" style="padding:10px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(15,23,42,.88);font-weight:700;letter-spacing:.02em;">Saving Quickbase settings…</div>
          </div>
          <div class="head" style="position:sticky;top:0;background:transparent;">
            <div>
              <div class="h3" style="margin:0;">Quickbase Settings</div>
              <div class="small muted">Report Config · Custom Columns · Filter Config</div>
            </div>
            <button class="btn" id="qbCloseSettingsBtn" type="button">✕</button>
          </div>
          <div class="qb-settings-tabs" style="display:flex;gap:4px;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:16px;overflow-x:auto;padding:0 4px;">
            <button type="button" data-qb-settings-tab="report-config" style="background:transparent;border:0;border-bottom:2px solid #2196F3;color:#fff;padding:10px 12px;cursor:pointer;transition:all .2s ease;white-space:nowrap;">Report Config</button>
            <button type="button" data-qb-settings-tab="custom-columns" style="background:transparent;border:0;border-bottom:2px solid transparent;color:rgba(226,232,240,0.78);padding:10px 12px;cursor:pointer;transition:all .2s ease;white-space:nowrap;">Custom Columns</button>
            <button type="button" data-qb-settings-tab="filter-config" style="background:transparent;border:0;border-bottom:2px solid transparent;color:rgba(226,232,240,0.78);padding:10px 12px;cursor:pointer;transition:all .2s ease;white-space:nowrap;">Filter Config</button>
            <button type="button" data-qb-settings-tab="dashboard-counters" style="background:transparent;border:0;border-bottom:2px solid transparent;color:rgba(226,232,240,0.78);padding:10px 12px;cursor:pointer;transition:all .2s ease;white-space:nowrap;">Dashboard Counters</button>
          </div>
          <div class="body" style="max-height:60vh;overflow:auto;display:grid;gap:16px;padding-bottom:6px;">
            <section class="card pad" data-qb-settings-view="report-config">
              <div class="h3" style="margin-top:0;">1) Report Config</div>
              <div style="display:grid;gap:10px;">
                <label class="field"><div class="label">Tab Name</div><input class="input" id="qbTabName" value="${esc(state.tabName)}" placeholder="Daily Distribution" /></label>
                <label class="field"><div class="label">Report Link</div><input class="input" id="qbReportLink" value="${esc(state.reportLink)}" placeholder="https://<realm>.quickbase.com/db/<tableid>?a=q&qid=..." /></label>
                <label class="field"><div class="label">Base Report QID</div><input class="input" id="qbTabBaseQid" value="${esc(state.qid)}" placeholder="-2021117" readonly style="background:rgba(148,163,184,.14);color:rgba(226,232,240,.78);cursor:not-allowed;" /></label>
                <div class="grid cols-2" style="gap:10px;">
                  <label class="field"><div class="label">QID</div><input class="input" id="qbQid" value="${esc(state.qid)}" placeholder="-2021117" readonly style="background:rgba(148,163,184,.14);color:rgba(226,232,240,.78);cursor:not-allowed;" /></label>
                  <label class="field"><div class="label">Table ID</div><input class="input" id="qbTableId" value="${esc(state.tableId)}" placeholder="bq7m2ab12" readonly style="background:rgba(148,163,184,.14);color:rgba(226,232,240,.78);cursor:not-allowed;" /></label>
                </div>
              </div>
            </section>

            <section class="card pad" data-qb-settings-view="custom-columns" style="display:none;">
              <div class="h3" style="margin-top:0;">2) Custom Columns</div>
              <label class="field" style="margin-bottom:10px;">
                <div class="label">Search Columns</div>
                <input type="text" id="qbColumnSearch" placeholder="Search columns..." class="input" />
              </label>
              <div style="position:relative;">
                <div style="max-height:350px;overflow-y:auto;padding-right:4px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(2,6,23,.3);">
                  <div id="qbColumnGrid" class="grid cols-3" style="gap:8px;padding:8px;"></div>
                </div>
                <div id="qbSelectedFloatingPanel" style="display:none;position:absolute;top:12px;right:14px;z-index:40;min-width:240px;max-width:320px;background:linear-gradient(140deg, rgba(15,23,42,.85), rgba(30,41,59,.7));backdrop-filter:blur(12px);border:1px solid rgba(148,163,184,.35);border-radius:14px;box-shadow:0 16px 35px rgba(2,6,23,.45);">
                  <div id="qbSelectedFloatingHandle" style="padding:10px 12px;cursor:move;border-bottom:1px solid rgba(148,163,184,.28);font-weight:700;font-size:12px;letter-spacing:.03em;text-transform:uppercase;">Selected Columns</div>
                  <div id="qbSelectedFloatingList" class="small" style="display:grid;gap:6px;padding:10px 12px;max-height:230px;overflow:auto;"></div>
                </div>
              </div>
            </section>

            <section class="card pad" data-qb-settings-view="filter-config" style="display:none;">
              <div class="row" style="justify-content:space-between;align-items:center;">
                <div class="h3" style="margin:0;">3) Filter Config</div>
                <button class="btn" id="qbAddFilterBtn" type="button">+ Add Filter</button>
              </div>
              <div class="row" style="margin-top:10px;align-items:center;gap:8px;">
                <span class="small muted">Match</span>
                <select class="input" id="qbFilterMatch" style="max-width:180px;">
                  <option value="ALL" ${state.filterMatch === 'ALL' ? 'selected' : ''}>ALL of the following rules</option>
                  <option value="ANY" ${state.filterMatch === 'ANY' ? 'selected' : ''}>ANY of the following rules</option>
                </select>
              </div>
              <div id="qbFilterRows" style="display:grid;gap:8px;margin-top:10px;"></div>
            </section>

            <section class="card pad" data-qb-settings-view="dashboard-counters" style="display:none;">
              <div class="row" style="justify-content:space-between;align-items:center;">
                <div class="h3" style="margin:0;">Dashboard Counter Filters (Self-Configure)</div>
                <button class="btn primary" id="qbAddCounterBtn" type="button">+ Add New Counter Filter</button>
              </div>
              <div id="qbCounterRows" style="display:grid;gap:10px;margin-top:10px;"></div>
            </section>
          </div>
          <div class="row" style="justify-content:flex-end;gap:8px;position:sticky;bottom:0;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg, rgba(15,23,42,0.2), rgba(15,23,42,0.92));">
            <button class="btn" id="qbCancelSettingsBtn" type="button">Cancel</button>
            <button class="btn primary" id="qbSaveSettingsBtn" type="button">Save Settings</button>
          </div>
        </div>
      </div>
    `;


    function renderSelectedFloatingPanel() {
      const panel = root.querySelector('#qbSelectedFloatingPanel');
      const list = root.querySelector('#qbSelectedFloatingList');
      if (!panel || !list) return;

      if (!state.customColumns.length) {
        panel.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      const byId = new Map(state.allAvailableFields.map((f) => [String(f.id), String(f.label || `Field #${f.id}`)]));
      list.innerHTML = state.customColumns
        .map((id, idx) => `<div style="display:flex;gap:8px;align-items:flex-start;"><span style="min-width:18px;color:#38bdf8;font-weight:700;">${idx + 1}.</span><span>${esc(byId.get(String(id)) || `Field #${id}`)}</span></div>`)
        .join('');
      panel.style.display = 'block';
    }

    function applyColumnSearch() {
      const input = root.querySelector('#qbColumnSearch');
      const query = String(input && input.value || '').trim().toLowerCase();
      root.querySelectorAll('#qbColumnGrid .qb-col-card').forEach((card) => {
        const haystack = String(card.getAttribute('data-col-label') || '').toLowerCase();
        card.style.display = !query || haystack.includes(query) ? 'flex' : 'none';
      });
    }

    function renderColumnGrid() {
      const grid = root.querySelector('#qbColumnGrid');
      if (!grid) return;
      if (!state.allAvailableFields.length) {
        grid.innerHTML = '<div class="small muted">Load data first to fetch available Quickbase fields.</div>';
        renderSelectedFloatingPanel();
        return;
      }

      const selectedById = new Map();
      state.customColumns.forEach((id, idx) => selectedById.set(String(id), idx + 1));

      grid.innerHTML = state.allAvailableFields.map((f) => {
        const id = String(f.id);
        const order = selectedById.get(id);
        const label = String(f.label || `Field #${id}`);
        return `
          <button type="button" data-col-id="${esc(id)}" data-col-label="${esc(`${label} #${id}`)}" class="qb-col-card" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid ${order ? 'rgba(56,189,248,.72)' : 'rgba(148,163,184,.25)'};background:${order ? 'rgba(14,116,144,.45)' : 'rgba(15,23,42,.45)'};color:inherit;cursor:pointer;text-align:left;min-height:40px;">
            <span class="small" style="font-weight:${order ? '700' : '500'};">${esc(label)} <span class="muted">(#${esc(id)})</span></span>
            ${order ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:rgba(14,165,233,.22);border:1px solid rgba(56,189,248,.55);font-size:12px;font-weight:700;">${order}</span>` : ''}
          </button>
        `;
      }).join('');
      applyColumnSearch();
      renderSelectedFloatingPanel();

      grid.querySelectorAll('.qb-col-card').forEach((el) => {
        el.addEventListener('click', () => {
          const id = String(el.getAttribute('data-col-id') || '').trim();
          if (!id) return;
          if (!state.customColumns.includes(id)) {
            state.customColumns.push(id);
          } else {
            state.customColumns = state.customColumns.filter((v) => v !== id);
          }
          syncActiveTabFromState();
          queuePersistQuickbaseSettings();
          renderColumnGrid();
        });
      });
    }

    function filterRowTemplate(f, idx) {
      const fieldOptions = state.allAvailableFields.map((x) => `<option value="${esc(String(x.id))}" ${String(f.fieldId) === String(x.id) ? 'selected' : ''}>${esc(x.label)} (#${esc(String(x.id))})</option>`).join('');
      const activeValue = String(f.value || '').trim();
      return `
        <div class="row" data-filter-idx="${idx}" style="gap:8px;align-items:center;flex-wrap:wrap;">
          <select class="input" data-f="fieldId" style="max-width:300px;"><option value="">Select field</option>${fieldOptions}</select>
          <select class="input" data-f="operator" style="max-width:120px;">
            <option value="EX" ${f.operator === 'EX' ? 'selected' : ''}>Is (Exact)</option>
            <option value="XEX" ${f.operator === 'XEX' ? 'selected' : ''}>Is Not</option>
            <option value="CT" ${f.operator === 'CT' ? 'selected' : ''}>Contains</option>
            <option value="XCT" ${f.operator === 'XCT' ? 'selected' : ''}>Does Not Contain</option>
            <option value="SW" ${f.operator === 'SW' ? 'selected' : ''}>Starts With</option>
            <option value="XSW" ${f.operator === 'XSW' ? 'selected' : ''}>Does Not Start With</option>
            <option value="BF" ${f.operator === 'BF' ? 'selected' : ''}>Before</option>
            <option value="AF" ${f.operator === 'AF' ? 'selected' : ''}>After</option>
            <option value="IR" ${f.operator === 'IR' ? 'selected' : ''}>In Range</option>
            <option value="XIR" ${f.operator === 'XIR' ? 'selected' : ''}>Not In Range</option>
          </select>
          <input type="text" class="input" data-f="value" value="${esc(activeValue)}" placeholder="Filter value" style="min-width:220px;" />
          <button class="btn" data-remove-filter="${idx}" type="button">Remove</button>
        </div>
      `;
    }

    function renderFilters() {
      const rows = root.querySelector('#qbFilterRows');
      if (!rows) return;
      if (!state.customFilters.length) {
        rows.innerHTML = '<div class="small muted">No custom filters configured.</div>';
      } else {
        rows.innerHTML = state.customFilters.map((f, idx) => filterRowTemplate(f, idx)).join('');
      }

      rows.querySelectorAll('[data-remove-filter]').forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-remove-filter'));
          state.customFilters = state.customFilters.filter((_, i) => i !== idx);
          syncActiveTabFromState();
          queuePersistQuickbaseSettings();
          renderFilters();
        };
      });

      rows.querySelectorAll('[data-filter-idx]').forEach((row) => {
        const idx = Number(row.getAttribute('data-filter-idx'));
        row.querySelectorAll('[data-f]').forEach((input) => {
          const key = String(input.getAttribute('data-f') || '');
          const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
          input.addEventListener(eventName, () => {
            if (!state.customFilters[idx]) return;
            if (key === 'fieldId') {
              state.customFilters[idx].fieldId = String(input.value || '').trim();
              syncActiveTabFromState();
              queuePersistQuickbaseSettings();
              return;
            }
            if (key === 'value') {
              state.customFilters[idx].value = String(input.value || '').trim();
              syncActiveTabFromState();
              queuePersistQuickbaseSettings();
              return;
            }
            state.customFilters[idx][key] = String(input.value || '').trim();
            syncActiveTabFromState();
            queuePersistQuickbaseSettings();
          });
        });
      });

      const match = root.querySelector('#qbFilterMatch');
      if (match) {
        match.onchange = () => {
          state.filterMatch = normalizeFilterMatch(match.value);
          syncActiveTabFromState();
          queuePersistQuickbaseSettings();
        };
      }
    }


    function counterRowTemplate(counter, idx) {
      const fieldOptions = state.allAvailableFields
        .map((x) => `<option value="${esc(String(x.id))}" ${String(counter.fieldId) === String(x.id) ? 'selected' : ''}>${esc(x.label)} (#${esc(String(x.id))})</option>`)
        .join('');
      return `
        <div data-counter-idx="${idx}" style="display:grid;gap:8px;padding:10px;border-radius:12px;background:rgba(15,23,42,.35);border:1px solid rgba(255,255,255,.12);">
          <div class="row" style="justify-content:space-between;align-items:center;">
            <div class="small muted" style="font-weight:700;">Counter ${idx + 1}</div>
            <button class="btn" data-remove-counter="${idx}" type="button" aria-label="Delete counter">🗑️</button>
          </div>
          <div class="grid cols-2" style="gap:8px;">
            <label class="field"><div class="label">Target Field</div><select class="input" data-counter-f="fieldId"><option value="">Select field</option>${fieldOptions}</select></label>
            <label class="field"><div class="label">Operator</div><select class="input" data-counter-f="operator">
              <option value="EX" ${counter.operator === 'EX' ? 'selected' : ''}>Is Equal To</option>
              <option value="XEX" ${counter.operator === 'XEX' ? 'selected' : ''}>Is Not Equal To</option>
              <option value="CT" ${counter.operator === 'CT' ? 'selected' : ''}>Contains</option>
            </select></label>
          </div>
          <label class="field"><div class="label">Glass Color</div><select class="input" data-counter-f="color">
            <option value="default" ${normalizeCounterColor(counter.color) === 'default' ? 'selected' : ''}>Default (Dark)</option>
            <option value="blue" ${normalizeCounterColor(counter.color) === 'blue' ? 'selected' : ''}>Blue</option>
            <option value="green" ${normalizeCounterColor(counter.color) === 'green' ? 'selected' : ''}>Green</option>
            <option value="red" ${normalizeCounterColor(counter.color) === 'red' ? 'selected' : ''}>Red</option>
            <option value="purple" ${normalizeCounterColor(counter.color) === 'purple' ? 'selected' : ''}>Purple</option>
            <option value="orange" ${normalizeCounterColor(counter.color) === 'orange' ? 'selected' : ''}>Orange</option>
          </select></label>
          <label class="field"><div class="label">Value</div><input type="text" class="input" data-counter-f="value" value="${esc(counter.value || '')}" placeholder="e.g. Open" /></label>
          <label class="field"><div class="label">Label</div><input type="text" class="input" data-counter-f="label" value="${esc(counter.label || '')}" placeholder="e.g. Open Cases" /></label>
        </div>
      `;
    }

    function renderCounterFilters() {
      const rows = root.querySelector('#qbCounterRows');
      if (!rows) return;
      if (!state.dashboardCounters.length) {
        rows.innerHTML = '<div class="small muted">No dashboard counter filters configured.</div>';
      } else {
        rows.innerHTML = state.dashboardCounters.map((counter, idx) => counterRowTemplate(counter, idx)).join('');
      }

      rows.querySelectorAll('[data-remove-counter]').forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-remove-counter'));
          state.dashboardCounters = state.dashboardCounters.filter((_, i) => i !== idx);
          syncActiveTabFromState();
          queuePersistQuickbaseSettings();
          renderCounterFilters();
        };
      });

      rows.querySelectorAll('[data-counter-idx]').forEach((row) => {
        const idx = Number(row.getAttribute('data-counter-idx'));
        row.querySelectorAll('[data-counter-f]').forEach((input) => {
          const key = String(input.getAttribute('data-counter-f') || '').trim();
          const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
          input.addEventListener(eventName, () => {
            if (!state.dashboardCounters[idx]) return;
            state.dashboardCounters[idx][key] = String(input.value || '').trim();
            syncActiveTabFromState();
            queuePersistQuickbaseSettings();
          });
        });
      });
    }

    function bindColumnSearch() {
      const input = root.querySelector('#qbColumnSearch');
      if (!input || modalBindingsActive) return;
      const onKeyUp = () => applyColumnSearch();
      input.addEventListener('keyup', onKeyUp);
      cleanupHandlers.push(() => input.removeEventListener('keyup', onKeyUp));
    }

    function bindFloatingDrag() {
      const panel = root.querySelector('#qbSelectedFloatingPanel');
      const handle = root.querySelector('#qbSelectedFloatingHandle');
      if (!panel || !handle || modalBindingsActive) return;

      let dragging = false;
      let startX = 0;
      let startY = 0;
      let originLeft = 0;
      let originTop = 0;

      const onMouseMove = (event) => {
        if (!dragging) return;
        const nextLeft = originLeft + (event.clientX - startX);
        const nextTop = originTop + (event.clientY - startY);
        panel.style.left = `${Math.max(6, nextLeft)}px`;
        panel.style.top = `${Math.max(6, nextTop)}px`;
        panel.style.right = 'auto';
      };
      const onMouseUp = () => {
        dragging = false;
      };
      const onMouseDown = (event) => {
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        originLeft = panel.offsetLeft;
        originTop = panel.offsetTop;
        event.preventDefault();
      };

      handle.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      cleanupHandlers.push(() => {
        handle.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      });
    }

    function bindReportLinkAutoExtract() {
      const reportLinkEl = root.querySelector('#qbReportLink');
      const tableIdEl = root.querySelector('#qbTableId');
      const qidEl = root.querySelector('#qbQid');
      const tabBaseQidEl = root.querySelector('#qbTabBaseQid');
      if (!reportLinkEl || !tableIdEl || !qidEl || !tabBaseQidEl || modalBindingsActive) return;

      let lastAutoFillToastAt = 0;
      const applyAutoExtract = () => {
        const nextLink = String(reportLinkEl.value || '').trim();
        const prevQid = String(state.qid || '').trim();
        const prevTableId = String(state.tableId || '').trim();
        handleReportLinkChange(getActiveTabId(), nextLink);
        const didAutoFill = prevQid !== String(state.qid || '').trim() || prevTableId !== String(state.tableId || '').trim();
        syncActiveTabFromState();
        queuePersistQuickbaseSettings();
        if (didAutoFill && window.UI && UI.toast && (Date.now() - lastAutoFillToastAt) > 1200) {
          UI.toast('Auto-filled from Link');
          lastAutoFillToastAt = Date.now();
        }
      };

      const onPaste = () => setTimeout(applyAutoExtract, 0);
      reportLinkEl.addEventListener('input', applyAutoExtract);
      reportLinkEl.addEventListener('paste', onPaste);
      cleanupHandlers.push(() => {
        reportLinkEl.removeEventListener('input', applyAutoExtract);
        reportLinkEl.removeEventListener('paste', onPaste);
      });
    }

    function cleanupModalBindings() {
      while (cleanupHandlers.length) {
        const fn = cleanupHandlers.pop();
        if (typeof fn === 'function') fn();
      }
      modalBindingsActive = false;
    }

    async function loadQuickbaseData(options) {
      const opts = options && typeof options === 'object' ? options : {};
      const silent = !!opts.silent;
      const forceRefresh = !!opts.forceRefresh;
      const host = root.querySelector('#qbDataBody');
      const meta = root.querySelector('#qbDataMeta');
      const reloadBtn = root.querySelector('#qbReloadBtn');

      if (quickbaseLoadInFlight) return quickbaseLoadInFlight;

      if (!silent) {
        if (host) host.innerHTML = '<div class="small muted" style="padding:8px;">Loading Quickbase data...</div>';
        if (meta) meta.textContent = 'Loading...';
      }

      quickbaseLoadInFlight = (async () => {
        if (reloadBtn) reloadBtn.disabled = true;
        const startedAt = performance.now();
        try {
          if (!window.QuickbaseAdapter || typeof window.QuickbaseAdapter.fetchMonitoringData !== 'function') {
            throw new Error('Quickbase adapter unavailable');
          }
          const shouldApplyFilters = shouldApplyServerFilters(opts);
          const mergedFilters = shouldApplyFilters ? normalizeFilters(state.customFilters) : [];
          const activeTab = getActiveTab();
          const activeQid = String(activeTab.qid || state.qid || '').trim();
          const hasExplicitLoadMore = Number(opts.offset || 0) >= 100;
          const hasActiveSearch = !!String(getActiveSearchTerm() || '').trim();
          const requestLimit = 100;
          const cacheKey = getQuickbaseCacheKey({
            tableId: state.tableId,
            qid: activeQid || '',
            filters: mergedFilters,
            filterMatch: state.filterMatch
          });
          // FIX: [Issue 2] - Reuse cache if fetched within 2 minutes.
          const cachedPayload = forceRefresh ? null : readQuickbaseCache(cacheKey);
          if (cachedPayload) {
            state.allAvailableFields = Array.isArray(cachedPayload.allAvailableFields) ? cachedPayload.allAvailableFields : [];
            state.baseRecords = Array.isArray(cachedPayload.records) ? cachedPayload.records.slice() : [];
            state.rawPayload = {
              columns: Array.isArray(cachedPayload.columns) ? cachedPayload.columns : [],
              records: state.baseRecords.slice()
            };
            renderColumnGrid();
            renderFilters();
            state.currentPage = 1;
            state.isDefaultReportMode = !shouldApplyFilters && !getActiveSearchTerm();
            applySearchAndRender();
            lastQuickbaseLoadAt = Date.now();
            console.info(`[Quickbase] cache hit (${state.baseRecords.length} records) in ${Math.round(performance.now() - startedAt)}ms`);
            return;
          }
          const requestPayload = {
            bust: Date.now(),
            limit: requestLimit,
            qid: activeQid || '',
            tableId: String(activeTab.tableId || state.tableId || '').trim(),
            realm: String(activeTab.realm || state.realm || '').trim()
          };
          if (!requestPayload.qid || !requestPayload.tableId || !requestPayload.realm) {
            state.allAvailableFields = [];
            state.baseRecords = [];
            state.rawPayload = { columns: [], records: [] };
            state.currentPayload = { columns: [], records: [] };
            renderColumnGrid();
            renderFilters();
            applySearchAndRender();
            lastQuickbaseLoadAt = Date.now();
            return;
          }
          const data = await window.QuickbaseAdapter.fetchMonitoringData({
            ...requestPayload,
            customFilters: mergedFilters,
            filterMatch: state.filterMatch,
            search: ''
          });
          state.allAvailableFields = Array.isArray(data && data.allAvailableFields) ? data.allAvailableFields : [];
          renderColumnGrid();
          renderFilters();
          const incomingColumns = Array.isArray(data && data.columns) ? data.columns : [];
          const incomingRecords = Array.isArray(data && data.records) ? data.records : [];
          state.baseRecords = incomingRecords.slice();
          state.rawPayload = { columns: incomingColumns, records: state.baseRecords.slice() };
          state.isDefaultReportMode = !shouldApplyFilters && !getActiveSearchTerm();
          state.currentPage = 1;
          applySearchAndRender();
          writeQuickbaseCache(cacheKey, {
            columns: incomingColumns,
            records: state.baseRecords.slice(),
            allAvailableFields: state.allAvailableFields
          });
          // FIX: [Issue 2] - Progressive background fetch for full dataset.
          if (requestLimit < QUICKBASE_BACKGROUND_LIMIT && !hasExplicitLoadMore && !hasActiveSearch) {
            setTimeout(async () => {
              try {
                const bgData = await window.QuickbaseAdapter.fetchMonitoringData({
                  ...requestPayload,
                  bust: Date.now(),
                  limit: QUICKBASE_BACKGROUND_LIMIT,
                  customFilters: mergedFilters,
                  filterMatch: state.filterMatch,
                  search: ''
                });
                const bgRecords = Array.isArray(bgData && bgData.records) ? bgData.records : [];
                if (!bgRecords.length) return;
                state.baseRecords = mergeRecordsById(state.baseRecords, bgRecords);
                state.rawPayload = { columns: incomingColumns, records: state.baseRecords.slice() };
                writeQuickbaseCache(cacheKey, {
                  columns: incomingColumns,
                  records: state.baseRecords.slice(),
                  allAvailableFields: state.allAvailableFields
                });
                applySearchAndRender();
                console.info(`[Quickbase] progressive load merged ${bgRecords.length} records`);
              } catch (_) {}
            }, 0);
          }
          lastQuickbaseLoadAt = Date.now();
          console.info(`[Quickbase] loaded ${state.baseRecords.length} records in ${Math.round(performance.now() - startedAt)}ms`);
        } catch (err) {
          if (meta) meta.textContent = 'Check Connection';
          if (host) host.innerHTML = `<div class="small" style="padding:10px;color:#fecaca;">${esc(String(err && err.message || 'Unable to load Quickbase records'))}</div>`;
          renderDashboardCounters(root, [], { dashboard_counters: [] }, state);
        } finally {
          quickbaseLoadInFlight = null;
          if (reloadBtn) reloadBtn.disabled = false;
        }
      })();

      return quickbaseLoadInFlight;
    }

    function applySearchAndRender() {
      const normalizedSearch = getActiveSearchTerm();
      const activeCounter = state.activeCounterIndex >= 0 ? state.dashboardCounters[state.activeCounterIndex] : null;
      state.searchTerm = normalizedSearch;
      const basePayload = {
        columns: Array.isArray(state.rawPayload && state.rawPayload.columns) ? state.rawPayload.columns : [],
        records: Array.isArray(state.baseRecords) ? state.baseRecords : []
      };
      const counterFilteredPayload = filterRecordsByCounter(basePayload, activeCounter);
      state.currentPayload = normalizedSearch
        ? filterRecordsBySearch(counterFilteredPayload, normalizedSearch)
        : counterFilteredPayload;
      const totalRows = Array.isArray(state.currentPayload.records) ? state.currentPayload.records.length : 0;
      const maxPage = Math.max(1, Math.ceil(totalRows / state.pageSize));
      state.currentPage = Math.min(Math.max(state.currentPage, 1), maxPage);
      renderRecords(root, state.currentPayload, {
        userInitiatedSearch: !!getActiveUserSearched() && !!normalizedSearch.length,
        page: state.currentPage,
        pageSize: state.pageSize,
        onPageChange: (nextPage) => {
          state.currentPage = nextPage;
          applySearchAndRender();
        }
      });
      renderDashboardCounters(root, state.baseRecords, { dashboard_counters: state.dashboardCounters }, state, (idx) => {
        state.activeCounterIndex = state.activeCounterIndex === idx ? -1 : idx;
        state.currentPage = 1;
        applySearchAndRender();
      });
    }

    function setupAutoRefresh() {
      if (quickbaseRefreshTimer) clearInterval(quickbaseRefreshTimer);
      quickbaseRefreshTimer = setInterval(() => {
        if (document.hidden) return;
        loadQuickbaseData({ silent: true });
      }, AUTO_REFRESH_MS);

      const onVisibilityChange = () => {
        if (document.hidden) return;
        const shouldRefresh = !lastQuickbaseLoadAt || (Date.now() - lastQuickbaseLoadAt) >= AUTO_REFRESH_MS;
        if (shouldRefresh) loadQuickbaseData({ silent: true });
      };

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('focus', onVisibilityChange);

      const prevCleanup = root._cleanup;
      root._cleanup = () => {
        try { if (prevCleanup) prevCleanup(); } catch (_) {}
        try { cleanupModalBindings(); } catch (_) {}
        try { if (quickbaseRefreshTimer) clearInterval(quickbaseRefreshTimer); } catch (_) {}
        try { if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer); } catch (_) {}
        try { if (autosaveTimer) clearTimeout(autosaveTimer); } catch (_) {}
        quickbaseRefreshTimer = null;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onVisibilityChange);
      };
    }

    function openSettings() {
      const currentTab = deepClone(getActiveTab() || {});
      state.settingsEditingTabId = String(currentTab.id || getActiveTabId() || '').trim();
      state.modalDraft = {
        tabName: deepClone(currentTab.tabName) || '',
        reportLink: deepClone(currentTab.reportLink) || '',
        qid: deepClone(currentTab.qid) || '',
        tableId: deepClone(currentTab.tableId) || '',
        realm: deepClone(currentTab.realm) || '',
        customColumns: deepClone(currentTab.customColumns || []),
        customFilters: deepClone(currentTab.customFilters || []),
        filterMatch: currentTab.filterMatch || 'ALL',
        dashboard_counters: deepClone(currentTab.dashboard_counters || [])
      };
      syncSettingsInputsFromState();
      renderColumnGrid();
      renderFilters();
      renderCounterFilters();
      setSettingsModalView('report-config');
      if (window.UI && UI.openModal) UI.openModal('qbSettingsModal');
      bindColumnSearch();
      bindFloatingDrag();
      bindReportLinkAutoExtract();
      modalBindingsActive = true;
    }

    function closeSettings() {
      if (state.isSaving) return;
      state.settingsEditingTabId = '';
      cleanupModalBindings();
      if (window.UI && UI.closeModal) UI.closeModal('qbSettingsModal');
    }

    async function deleteTabAtIndex(tabIndex) {
      const tabs = Array.isArray(state.quickbaseSettings && state.quickbaseSettings.tabs) ? state.quickbaseSettings.tabs : [];
      if (tabs.length <= 1) {
        if (window.UI && UI.toast) UI.toast('At least one tab must remain.', 'error');
        return;
      }
      const idx = Number(tabIndex);
      if (!Number.isFinite(idx) || idx < 0 || idx >= tabs.length) return;
      const target = tabs[idx] || {};
      const targetTabId = String(target.id || '').trim();
      if (!targetTabId) return;

      try {
        if (tabManager) await tabManager.deleteTab(targetTabId);
        delete state.quickbaseSettings.settingsByTabId[targetTabId];
        state.quickbaseSettings.tabs = tabs.filter((_, i) => i !== idx);
        const nextLen = state.quickbaseSettings.tabs.length;
        state.activeTabIndex = Math.min(Math.max(state.activeTabIndex === idx ? idx - 1 : state.activeTabIndex, 0), Math.max(0, nextLen - 1));
        state.quickbaseSettings.activeTabIndex = state.activeTabIndex;
        syncStateFromActiveTab();
        syncSettingsInputsFromState();
        queuePersistQuickbaseSettings();
        await persistQuickbaseSettings();
        renderTabBar();
        renderColumnGrid();
        renderFilters();
        renderCounterFilters();
        await loadQuickbaseData({ applyFilters: false, forceRefresh: true });
        if (window.UI && UI.toast) UI.toast('Tab deleted successfully.');
      } catch (err) {
        if (window.UI && UI.toast) UI.toast('Failed to delete tab: ' + String(err && err.message || err), 'error');
      }
    }

    async function renderDefaultReport() {
      state.didInitialDefaultRender = true;
      setActiveUserSearched(false);
      setActiveSearchTerm('');
      state.searchTerm = '';
      return loadQuickbaseData({ applyFilters: false });
    }

    root.querySelector('#qbOpenSettingsBtn').onclick = openSettings;
    root.querySelector('#qbCloseSettingsBtn').onclick = closeSettings;
    root.querySelector('#qbCancelSettingsBtn').onclick = closeSettings;
    root.querySelector('#qbSettingsModal').addEventListener('mousedown', (event) => {
      if (state.isSaving) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target && event.target.id === 'qbSettingsModal') cleanupModalBindings();
    });
    root.querySelector('#qbReloadBtn').onclick = () => loadQuickbaseData({ applyFilters: true });
    root.querySelector('#qbSettingsModal').addEventListener('click', (event) => {
      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return;
      const tabBtn = target.closest('[data-qb-settings-tab]');
      if (!tabBtn) return;
      const nextView = String(tabBtn.getAttribute('data-qb-settings-tab') || '').trim();
      if (!nextView) return;
      setSettingsModalView(nextView);
    });
    root.querySelector('#qbTabBar').oncontextmenu = async (event) => {
      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return;
      const tabBtn = target.closest('[data-tab-idx]');
      if (!tabBtn) return;
      event.preventDefault();
      const idx = Number(tabBtn.getAttribute('data-tab-idx'));
      if (!Number.isFinite(idx)) return;
      const tabs = Array.isArray(state.quickbaseSettings && state.quickbaseSettings.tabs) ? state.quickbaseSettings.tabs : [];
      const tab = tabs[idx] || {};
      const label = String(tab.tabName || `Report ${idx + 1}`);
      const confirmed = window.confirm(`Delete tab "${label}"? This cannot be undone.`);
      if (!confirmed) return;
      await deleteTabAtIndex(idx);
    };

    root.querySelector('#qbTabBar').onclick = async (event) => {
      const target = event.target;
      if (!target || !(target instanceof HTMLElement)) return;
      if (target.id === 'qbAddTabBtn') {
        captureSettingsDraftFromInputs();
        const managedTabId = tabManager ? tabManager.createTab({ tabName: 'New Report' }) : '';
        const newTab = deepClone({
          id: managedTabId || generateUUID(),
          tabName: 'New Report',
          reportLink: '',
          qid: '',
          tableId: '',
          realm: '',
          dashboard_counters: [],
          customColumns: [],
          customFilters: [],
          filterMatch: 'ALL'
        });
        const newTabId = String(newTab.id || '').trim();
        state.quickbaseSettings.tabs.push(deepClone(newTab));
        state.quickbaseSettings.settingsByTabId = Object.assign({}, state.quickbaseSettings.settingsByTabId || {}, {
          [newTabId]: {
            reportLink: '',
            qid: '',
            tableId: '',
            realm: '',
            dashboard_counters: [],
            customColumns: [],
            customFilters: [],
            filterMatch: 'ALL'
          }
        });
        state.activeTabIndex = state.quickbaseSettings.tabs.length - 1;
        if (tabManager) {
          tabManager.clearNewTabFields();
          syncTabManagerFromState(newTabId);
        }
        state.modalDraft = deepClone(Object.assign({}, newTab, state.quickbaseSettings.settingsByTabId[newTabId])) || buildDefaultTab();
        syncStateFromActiveTab();
        syncSettingsInputsFromState();
        queuePersistQuickbaseSettings();
        renderTabBar();
        renderColumnGrid();
        renderFilters();
        renderCounterFilters();
        try {
          await persistQuickbaseSettings();
          await loadQuickbaseData({ applyFilters: false });
          if (window.UI && UI.toast) UI.toast('New tab added and synced.');
        } catch (err) {
          if (window.UI && UI.toast) UI.toast('Failed to add tab: ' + String(err && err.message || err), 'error');
        }
        return;
      }
      const idx = Number(target.getAttribute('data-tab-idx'));
      if (!Number.isFinite(idx) || idx === state.activeTabIndex) return;
      captureSettingsDraftFromInputs();
      state.activeTabIndex = idx;
      const currentTab = deepClone(getActiveTab() || {});
      state.settingsEditingTabId = String(currentTab.id || getActiveTabId() || '').trim();
      state.modalDraft = {
        tabName: deepClone(currentTab.tabName) || '',
        reportLink: deepClone(currentTab.reportLink) || '',
        qid: deepClone(currentTab.qid) || '',
        tableId: deepClone(currentTab.tableId) || '',
        realm: deepClone(currentTab.realm) || '',
        customColumns: deepClone(currentTab.customColumns || []),
        customFilters: deepClone(currentTab.customFilters || []),
        filterMatch: currentTab.filterMatch || 'ALL',
        dashboard_counters: deepClone(currentTab.dashboard_counters || [])
      };
      syncStateFromActiveTab();
      if (tabManager) {
        const activeTabId = String(getActiveTabId() || '').trim();
        if (activeTabId) {
          const cloned = tabManager.getTab(activeTabId);
          const settings = deepClone(cloned.settings || {}) || {};
          const currentTabSnapshot = getActiveTab();
          state.tabName = String(settings.tabName || currentTabSnapshot.tabName || 'Main Report').trim() || 'Main Report';
          state.reportLink = String(settings.reportLink || currentTabSnapshot.reportLink || '').trim();
          state.qid = String(settings.qid || currentTabSnapshot.qid || '').trim();
          state.tableId = String(settings.tableId || currentTabSnapshot.tableId || '').trim();
          state.realm = String(settings.realm || currentTabSnapshot.realm || '').trim();
        }
      }
      syncSettingsInputsFromState();
      queuePersistQuickbaseSettings();
      renderTabBar();
      renderColumnGrid();
      renderFilters();
      renderCounterFilters();
      await loadQuickbaseData({ applyFilters: false });
    };
    root.querySelector('#qbAddFilterBtn').onclick = () => {
      state.customFilters.push({ fieldId: '', operator: 'EX', value: '' });
      syncActiveTabFromState();
      queuePersistQuickbaseSettings();
      renderFilters();
    };
    root.querySelector('#qbAddCounterBtn').onclick = () => {
      state.dashboardCounters.push({ fieldId: '', operator: 'EX', value: '', label: '', color: 'default' });
      syncActiveTabFromState();
      queuePersistQuickbaseSettings();
      renderCounterFilters();
    };


    const headerSearch = root.querySelector('#qbHeaderSearch');
    if (headerSearch) {
      headerSearch.value = getActiveSearchTerm();
      state.searchTerm = getActiveSearchTerm();
      headerSearch.oninput = () => {
        const nextValue = String(headerSearch.value || '').trim();
        setActiveSearchTerm(nextValue);
        setActiveUserSearched(nextValue.length > 0);
        state.searchTerm = nextValue;
        state.hasUserSearched = nextValue.length > 0;
        if (state.searchDebounceTimer) clearTimeout(state.searchDebounceTimer);
        state.searchDebounceTimer = setTimeout(() => {
          applySearchAndRender();
        }, 500);
      };
    }

    const exportBtn = root.querySelector('#qbExportCsvBtn');
    if (exportBtn) {
      exportBtn.onclick = () => {
        const rows = state.currentPayload && Array.isArray(state.currentPayload.records) ? state.currentPayload.records : [];
        const columns = state.currentPayload && Array.isArray(state.currentPayload.columns) ? state.currentPayload.columns : [];
        const csv = rowsToCsv(rows, columns);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my_quickbase_export.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      };
    }

    const saveBtn = root.querySelector('#qbSaveSettingsBtn');
    const saveLock = root.querySelector('#qbSettingsSavingLock');
    saveBtn.onclick = async () => {
      if (!me) return;
      const tabSnapshot = scrapeModalTabSnapshot();
      const activeIdx = Number(state.activeTabIndex || 0);
      if (Array.isArray(state.quickbaseSettings.tabs) && state.quickbaseSettings.tabs[activeIdx]) {
        state.quickbaseSettings.tabs[activeIdx] = deepClone({
          ...state.quickbaseSettings.tabs[activeIdx],
          ...tabSnapshot
        });
      }
      const activeTabId = String(getActiveTabId() || '').trim();
      if (activeTabId) {
        state.quickbaseSettings.settingsByTabId = state.quickbaseSettings.settingsByTabId || {};
        state.quickbaseSettings.settingsByTabId[activeTabId] = createDefaultSettings(tabSnapshot, {});
      }
      state.tabName = tabSnapshot.tabName;
      state.reportLink = tabSnapshot.reportLink;
      state.qid = tabSnapshot.qid;
      state.tableId = tabSnapshot.tableId;
      state.realm = tabSnapshot.realm;
      state.dashboardCounters = normalizeDashboardCounters(tabSnapshot.dashboard_counters);
      syncActiveTabFromState();

      state.isSaving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      if (saveLock) saveLock.style.display = 'flex';
      try {
        const validation = validateQuickbaseTabSettings(getActiveTab());
        if (!validation.ok) throw new Error(validation.message);
        const nextActiveTabId = String(getActiveTabId() || '').trim();
        const targetTabId = String(state.settingsEditingTabId || nextActiveTabId || '').trim();
        const pendingTabSettings = {
          tabName: deepClone(state.tabName) || '',
          reportLink: deepClone(state.reportLink) || '',
          qid: deepClone(state.qid) || '',
          tableId: deepClone(state.tableId) || '',
          realm: deepClone(state.realm) || '',
          customColumns: deepClone(state.customColumns || []),
          customFilters: deepClone(state.customFilters || []),
          filterMatch: state.filterMatch || 'ALL',
          dashboard_counters: deepClone(state.dashboardCounters || [])
        };
        const tabIndex = state.quickbaseSettings.tabs.findIndex((t) => String(t && t.id || '').trim() === targetTabId);
        if (tabIndex !== -1) {
          state.quickbaseSettings.tabs[tabIndex] = deepClone({
            ...state.quickbaseSettings.tabs[tabIndex],
            tabName: pendingTabSettings.tabName,
            reportLink: pendingTabSettings.reportLink,
            qid: pendingTabSettings.qid,
            tableId: pendingTabSettings.tableId,
            realm: pendingTabSettings.realm,
            customColumns: deepClone(pendingTabSettings.customColumns || []),
            customFilters: deepClone(pendingTabSettings.customFilters || []),
            filterMatch: pendingTabSettings.filterMatch || 'ALL',
            dashboard_counters: deepClone(pendingTabSettings.dashboard_counters || []),
            id: targetTabId
          });
        }
        if (tabManager && targetTabId) {
          tabManager.updateTabLocal(targetTabId, {
            tabName: String(state.tabName || 'Main Report').trim() || 'Main Report',
            reportLink: String(state.reportLink || '').trim(),
            baseReportQid: String(state.qid || '').trim(),
            qid: String(state.qid || '').trim(),
            tableId: String(state.tableId || '').trim()
          });
          await tabManager.saveTab(targetTabId);
        }
        await persistQuickbaseSettings();
        renderTabBar();
        if (window.UI && UI.toast) UI.toast('Quickbase settings saved successfully!');
        closeSettings();
        await loadQuickbaseData({ forceRefresh: true });
      } catch (err) {
        if (window.UI && UI.toast) UI.toast('Failed to save settings: ' + String(err && err.message || err), 'error');
      } finally {
        state.isSaving = false;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
        if (saveLock) saveLock.style.display = 'none';
      }
    };

    const searchInput = document.querySelector('#quickbase-search')?.value || root.querySelector('#qbHeaderSearch')?.value || '';
    syncStateFromActiveTab();
    renderTabBar();
    if (shouldApplyInitialFilters(searchInput)) {
      setActiveSearchTerm(String(searchInput).trim());
      setActiveUserSearched(true);
      state.searchTerm = String(searchInput).trim();
      state.hasUserSearched = true;
      await loadQuickbaseData({ applyFilters: true });
    } else {
      await renderDefaultReport();
    }
    setupAutoRefresh();
  };
})();
