/* @AI_CRITICAL_GUARD: UNTOUCHABLE ZONE. Do not modify existing UI/UX, layouts, or core logic in this file without explicitly asking Thunter BOY for clearance. If changes are required here, STOP and provide a RISK IMPACT REPORT first. */
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

  function parseQuickbaseLink(link) {
    const out = { realm: '', tableId: '', qid: '' };
    const value = String(link || '').trim();
    if (!value) return out;
    try {
      const urlObj = new URL(value);
      out.realm = String(urlObj.hostname || '').trim();
      out.qid = String(urlObj.searchParams.get('qid') || '').trim();
    } catch (_) {}
    const dbMatch = value.match(/\/db\/([a-zA-Z0-9]+)/i);
    if (dbMatch && dbMatch[1]) out.tableId = String(dbMatch[1]).trim();
    if (!out.tableId) {
      const tableMatch = value.match(/\/table\/([a-zA-Z0-9]+)/i);
      if (tableMatch && tableMatch[1]) out.tableId = String(tableMatch[1]).trim();
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

  function getProfileQuickbaseConfig(profile) {
    const p = profile && typeof profile === 'object' ? profile : {};
    const quickbaseSettings = parseQuickbaseSettings(p.quickbase_settings);
    const quickbaseConfig = parseQuickbaseSettings(p.quickbase_config);
    const dbConfig = normalizeQuickbaseConfig(Object.keys(quickbaseSettings).length ? quickbaseSettings : quickbaseConfig);
    const fallbackConfig = normalizeQuickbaseConfig(p);
    return {
      reportLink: dbConfig.reportLink || fallbackConfig.reportLink,
      qid: dbConfig.qid || fallbackConfig.qid,
      tableId: dbConfig.tableId || fallbackConfig.tableId,
      realm: dbConfig.realm || fallbackConfig.realm,
      customColumns: dbConfig.customColumns.length ? dbConfig.customColumns : fallbackConfig.customColumns,
      customFilters: dbConfig.customFilters.length ? dbConfig.customFilters : fallbackConfig.customFilters,
      filterMatch: dbConfig.filterMatch || fallbackConfig.filterMatch || 'ALL',
      dashboardCounters: dbConfig.dashboardCounters.length ? dbConfig.dashboardCounters : fallbackConfig.dashboardCounters
    };
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

    if (!columns.length || !rows.length) {
      const opts = options && typeof options === 'object' ? options : {};
      const emptyBySearch = !!opts.userInitiatedSearch;
      meta.textContent = 'No Quickbase Records Found';
      host.innerHTML = `<div class="card pad"><div class="small muted">${emptyBySearch ? 'No records match your filters.' : 'No records loaded. Open ⚙️ Settings to configure report, columns, and filters.'}</div></div>`;
      return;
    }

    meta.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} loaded`;
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
    const body = rows.map((r) => {
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

  if (window.__MUMS_TEST_HOOKS__) {
    window.__MUMS_TEST_HOOKS__.myQuickbase = {
      shouldApplyInitialFilters,
      filterRecordsBySearch,
      filterRecordsByCounter
    };
  }

  window.Pages.my_quickbase = async function(root) {
    const AUTO_REFRESH_MS = 15000;
    const me = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    let profile = (me && window.Store && Store.getProfile) ? (Store.getProfile(me.id) || {}) : {};

    const quickbaseConfig = getProfileQuickbaseConfig(profile);
    const initialLink = String(quickbaseConfig.reportLink || profile.quickbase_url || '').trim();
    const parsedFromLink = parseQuickbaseLink(initialLink);
    const state = {
      reportLink: initialLink,
      qid: String(quickbaseConfig.qid || profile.quickbase_qid || parsedFromLink.qid || '').trim(),
      tableId: String(quickbaseConfig.tableId || profile.quickbase_table_id || parsedFromLink.tableId || '').trim(),
      customColumns: Array.isArray(quickbaseConfig.customColumns) ? quickbaseConfig.customColumns.map((v) => String(v)) : [],
      customFilters: normalizeFilters(quickbaseConfig.customFilters),
      filterMatch: normalizeFilterMatch(quickbaseConfig.filterMatch || profile.qb_custom_filter_match),
      dashboardCounters: normalizeDashboardCounters(quickbaseConfig.dashboardCounters || profile.qb_dashboard_counters),
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
      isDefaultReportMode: false
    };

    root.innerHTML = `
      <div class="dashx qb-page-shell">
        <div class="qb-static-zone"><div class="card pad qb-header-card" style="backdrop-filter: blur(14px); background: linear-gradient(130deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.16);">
          <div class="row qb-header-row" style="justify-content:space-between;align-items:center;gap:12px;">
            <div>
              <h2 class="ux-h1 qb-title" style="margin:0;">My Quickbase</h2>
              <div class="small muted qb-subtitle">Enterprise monitoring dashboard for your personal Quickbase view.</div>
            </div>
            <div class="row qb-header-search-wrap" style="gap:8px;align-items:center;justify-content:center;flex:1;">
              <input class="input qb-header-search" id="qbHeaderSearch" type="search" placeholder="Search across all Quickbase records..." />
              <button class="btn" id="qbExportCsvBtn" type="button">Export CSV</button>
            </div>
            <div class="row" style="gap:8px;">
              <button class="btn" id="qbReloadBtn" type="button">Reload</button>
              <button class="btn primary" id="qbOpenSettingsBtn" type="button">⚙️ Settings</button>
            </div>
          </div>
        </div>

        <div id="qbDashboardCounters" class="qb-dashboard-counters"></div></div>

        <div class="card pad qb-table-card">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div class="h3" style="margin:0;">Quickbase Records</div>
            <div id="qbDataMeta" class="small muted">Loading…</div>
          </div>
          <div id="qbDataBody" class="qb-data-body"></div>
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
          <div class="body" style="max-height:70vh;overflow:auto;display:grid;gap:16px;">
            <section class="card pad">
              <div class="h3" style="margin-top:0;">1) Report Config</div>
              <div style="display:grid;gap:10px;">
                <label class="field"><div class="label">Report Link</div><input class="input" id="qbReportLink" value="${esc(state.reportLink)}" placeholder="https://<realm>.quickbase.com/db/<tableid>?a=q&qid=..." /></label>
                <div class="grid cols-2" style="gap:10px;">
                  <label class="field"><div class="label">QID</div><input class="input" id="qbQid" value="${esc(state.qid)}" placeholder="-2021117" /></label>
                  <label class="field"><div class="label">Table ID</div><input class="input" id="qbTableId" value="${esc(state.tableId)}" placeholder="bq7m2ab12" /></label>
                </div>
              </div>
            </section>

            <section class="card pad">
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

            <section class="card pad">
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

            <section class="card pad">
              <div class="row" style="justify-content:space-between;align-items:center;">
                <div class="h3" style="margin:0;">Dashboard Counter Filters (Self-Configure)</div>
                <button class="btn primary" id="qbAddCounterBtn" type="button">+ Add New Counter Filter</button>
              </div>
              <div id="qbCounterRows" style="display:grid;gap:10px;margin-top:10px;"></div>
            </section>

            <div class="row" style="justify-content:flex-end;gap:8px;">
              <button class="btn" id="qbCancelSettingsBtn" type="button">Cancel</button>
              <button class="btn primary" id="qbSaveSettingsBtn" type="button">Save Settings</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const cleanupHandlers = [];
    let modalBindingsActive = false;
    let quickbaseLoadInFlight = null;
    let quickbaseRefreshTimer = null;
    let lastQuickbaseLoadAt = 0;

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
              return;
            }
            if (key === 'value') {
              state.customFilters[idx].value = String(input.value || '').trim();
              return;
            }
            state.customFilters[idx][key] = String(input.value || '').trim();
          });
        });
      });

      const match = root.querySelector('#qbFilterMatch');
      if (match) {
        match.onchange = () => {
          state.filterMatch = normalizeFilterMatch(match.value);
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
        try {
          if (!window.QuickbaseAdapter || typeof window.QuickbaseAdapter.fetchMonitoringData !== 'function') {
            throw new Error('Quickbase adapter unavailable');
          }
          const shouldApplyFilters = opts.applyFilters === true || state.activeCounterIndex >= 0;
          const mergedFilters = shouldApplyFilters ? normalizeFilters(state.customFilters) : [];
          const data = await window.QuickbaseAdapter.fetchMonitoringData({
            bust: Date.now(),
            customFilters: mergedFilters,
            filterMatch: state.filterMatch,
            search: '',
            limit: 500
          });
          state.allAvailableFields = Array.isArray(data && data.allAvailableFields) ? data.allAvailableFields : [];
          renderColumnGrid();
          renderFilters();
          const incomingColumns = Array.isArray(data && data.columns) ? data.columns : [];
          const incomingRecords = Array.isArray(data && data.records) ? data.records : [];
          state.baseRecords = incomingRecords.slice();
          state.rawPayload = { columns: incomingColumns, records: state.baseRecords.slice() };
          state.isDefaultReportMode = !shouldApplyFilters && !String(state.searchTerm || '').trim();
          applySearchAndRender();
          lastQuickbaseLoadAt = Date.now();
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
      const normalizedSearch = String(state.searchTerm || '').trim();
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
      renderRecords(root, state.currentPayload, { userInitiatedSearch: !!state.hasUserSearched && !!normalizedSearch.length });
      renderDashboardCounters(root, state.baseRecords, { dashboard_counters: state.dashboardCounters }, state, (idx) => {
        state.activeCounterIndex = state.activeCounterIndex === idx ? -1 : idx;
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
        quickbaseRefreshTimer = null;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onVisibilityChange);
      };
    }

    function openSettings() {
      renderColumnGrid();
      renderFilters();
      renderCounterFilters();
      if (window.UI && UI.openModal) UI.openModal('qbSettingsModal');
      bindColumnSearch();
      bindFloatingDrag();
      modalBindingsActive = true;
    }

    function closeSettings() {
      if (state.isSaving) return;
      cleanupModalBindings();
      if (window.UI && UI.closeModal) UI.closeModal('qbSettingsModal');
    }

    async function renderDefaultReport() {
      state.didInitialDefaultRender = true;
      state.hasUserSearched = false;
      state.searchTerm = '';
      return loadQuickbaseData({ applyFilters: false });
    }

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
    root.querySelector('#qbAddFilterBtn').onclick = () => {
      state.customFilters.push({ fieldId: '', operator: 'EX', value: '' });
      renderFilters();
    };
    root.querySelector('#qbAddCounterBtn').onclick = () => {
      state.dashboardCounters.push({ fieldId: '', operator: 'EX', value: '', label: '', color: 'default' });
      renderCounterFilters();
    };


    const headerSearch = root.querySelector('#qbHeaderSearch');
    if (headerSearch) {
      state.searchTerm = String(headerSearch.value || '').trim();
      headerSearch.oninput = () => {
        const nextValue = String(headerSearch.value || '').trim();
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
      const reportLink = String((root.querySelector('#qbReportLink') || {}).value || '').trim();
      const qidInput = String((root.querySelector('#qbQid') || {}).value || '').trim();
      const tableIdInput = String((root.querySelector('#qbTableId') || {}).value || '').trim();
      const parsed = parseQuickbaseLink(reportLink);
      const orderedColumns = [];
      const seenCols = new Set();
      (state.customColumns || []).forEach((id) => {
        const cleaned = String(id || '').trim();
        if (!cleaned || seenCols.has(cleaned)) return;
        seenCols.add(cleaned);
        orderedColumns.push(cleaned);
      });
      const currentSettingsObject = {
        reportLink,
        qid: qidInput || parsed.qid,
        realm: parsed.realm,
        tableId: tableIdInput || parsed.tableId,
        customColumns: orderedColumns,
        customFilters: normalizeFilters(state.customFilters),
        filterMatch: normalizeFilterMatch(state.filterMatch),
        dashboard_counters: JSON.stringify(normalizeDashboardCounters(state.dashboardCounters))
      };

      const payload = {
        qb_report_link: reportLink,
        qb_qid: currentSettingsObject.qid,
        qb_realm: currentSettingsObject.realm,
        qb_table_id: currentSettingsObject.tableId,
        qb_custom_columns: currentSettingsObject.customColumns,
        qb_custom_filters: currentSettingsObject.customFilters,
        qb_filter_match: currentSettingsObject.filterMatch,
        qb_dashboard_counters: currentSettingsObject.dashboard_counters
      };

      payload.quickbase_config = currentSettingsObject;
      payload.quickbase_settings = currentSettingsObject;

      state.isSaving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      if (saveLock) saveLock.style.display = 'flex';
      try {
        const authToken = window.CloudAuth && typeof CloudAuth.accessToken === 'function' ? CloudAuth.accessToken() : '';
        const res = await fetch('/api/users/update_me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({
            ...payload,
            quickbase_settings: currentSettingsObject
          })
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.message || out.error || 'Could not save Quickbase settings.');

        if (window.Store && Store.setProfile) {
          Store.setProfile(me.id, Object.assign({}, payload, { updatedAt: Date.now() }));
        }
        if (window.UI && UI.toast) UI.toast('Quickbase settings saved successfully!');
        closeSettings();
        await loadQuickbaseData();
      } catch (err) {
        if (window.UI && UI.toast) UI.toast('Failed to save settings: ' + String(err && err.message || err), 'error');
      } finally {
        state.isSaving = false;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
        if (saveLock) saveLock.style.display = 'none';
      }
    };

    await refreshProfileFromCloud();
    const searchInput = document.querySelector('#quickbase-search')?.value || root.querySelector('#qbHeaderSearch')?.value || '';
    if (shouldApplyInitialFilters(searchInput)) {
      state.searchTerm = String(searchInput).trim();
      state.hasUserSearched = true;
      await loadQuickbaseData({ applyFilters: true });
    } else {
      await renderDefaultReport();
    }
    setupAutoRefresh();
  };
})();
