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
      filterMatch: normalizeFilterMatch(cfg.filterMatch || cfg.qb_filter_match)
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
      filterMatch: dbConfig.filterMatch || fallbackConfig.filterMatch || 'ALL'
    };
  }

  function renderRecords(root, payload) {
    const host = root.querySelector('#qbDataBody');
    const meta = root.querySelector('#qbDataMeta');
    if (!host || !meta) return;

    const columns = Array.isArray(payload && payload.columns) ? payload.columns : [];
    const rows = Array.isArray(payload && payload.records) ? payload.records : [];

    if (!columns.length || !rows.length) {
      meta.textContent = 'No Quickbase Records Found';
      host.innerHTML = '<div class="card pad"><div class="small muted">No records loaded. Open ⚙️ Settings to configure report, columns, and filters.</div></div>';
      return;
    }

    meta.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} loaded`;
    const headers = columns.map((c) => `<th style="text-align:left;padding:10px 8px;">${esc(c.label || c.id || 'Field')}</th>`).join('');
    const body = rows.map((r) => {
      const cells = columns.map((c) => {
        const field = r && r.fields ? r.fields[String(c.id)] : null;
        const value = String(field && field.value != null ? field.value : 'N/A');
        return `<td style="padding:8px;">${esc(value)}</td>`;
      }).join('');
      return `<tr><td style="padding:8px;font-weight:700;">${esc(String(r && r.qbRecordId || 'N/A'))}</td>${cells}</tr>`;
    }).join('');

    host.innerHTML = `<div style="overflow:auto;"><table style="width:100%;min-width:760px;border-collapse:collapse;"><thead><tr><th style="text-align:left;padding:10px 8px;">Case #</th>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  window.Pages.my_quickbase = async function(root) {
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
      allAvailableFields: [],
      isSaving: false
    };

    root.innerHTML = `
      <div class="dashx">
        <div class="card pad" style="backdrop-filter: blur(14px); background: linear-gradient(130deg, rgba(255,255,255,.08), rgba(255,255,255,.03)); border:1px solid rgba(255,255,255,.16);">
          <div class="row" style="justify-content:space-between;align-items:center;gap:12px;">
            <div>
              <h2 class="ux-h1" style="margin:0;">My Quickbase</h2>
              <div class="small muted">Enterprise monitoring dashboard for your personal Quickbase view.</div>
            </div>
            <div class="row" style="gap:8px;">
              <button class="btn" id="qbReloadBtn" type="button">Reload</button>
              <button class="btn primary" id="qbOpenSettingsBtn" type="button">⚙️ Settings</button>
            </div>
          </div>
        </div>

        <div class="card pad" style="margin-top:14px;">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div class="h3" style="margin:0;">Quickbase Records</div>
            <div id="qbDataMeta" class="small muted">Loading…</div>
          </div>
          <div id="qbDataBody"></div>
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

    async function loadQuickbaseData() {
      const host = root.querySelector('#qbDataBody');
      const meta = root.querySelector('#qbDataMeta');
      if (host) host.innerHTML = '<div class="small muted" style="padding:8px;">Loading Quickbase data...</div>';
      if (meta) meta.textContent = 'Loading...';
      try {
        if (!window.QuickbaseAdapter || typeof window.QuickbaseAdapter.fetchMonitoringData !== 'function') {
          throw new Error('Quickbase adapter unavailable');
        }
        const data = await window.QuickbaseAdapter.fetchMonitoringData();
        state.allAvailableFields = Array.isArray(data && data.allAvailableFields) ? data.allAvailableFields : [];
        renderColumnGrid();
        renderFilters();
        renderRecords(root, data || {});
      } catch (err) {
        if (meta) meta.textContent = 'Check Connection';
        if (host) host.innerHTML = `<div class="small" style="padding:10px;color:#fecaca;">${esc(String(err && err.message || 'Unable to load Quickbase records'))}</div>`;
      }
    }

    function openSettings() {
      renderColumnGrid();
      renderFilters();
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
    root.querySelector('#qbReloadBtn').onclick = () => loadQuickbaseData();
    root.querySelector('#qbAddFilterBtn').onclick = () => {
      state.customFilters.push({ fieldId: '', operator: 'EX', value: '' });
      renderFilters();
    };

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
      const payload = {
        qb_report_link: reportLink,
        qb_qid: qidInput || parsed.qid,
        qb_realm: parsed.realm,
        qb_table_id: tableIdInput || parsed.tableId,
        qb_custom_columns: orderedColumns,
        qb_custom_filters: normalizeFilters(state.customFilters),
        qb_filter_match: normalizeFilterMatch(state.filterMatch)
      };

      payload.quickbase_config = {
        reportLink: payload.qb_report_link,
        qid: payload.qb_qid,
        realm: payload.qb_realm,
        tableId: payload.qb_table_id,
        customColumns: payload.qb_custom_columns,
        customFilters: payload.qb_custom_filters,
        filterMatch: payload.qb_filter_match
      };
      payload.quickbase_settings = payload.quickbase_config;

      state.isSaving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      if (saveLock) saveLock.style.display = 'flex';
      try {
        if (!window.CloudUsers || typeof window.CloudUsers.updateMe !== 'function') {
          throw new Error('Cloud user API is unavailable. Please reload and try again.');
        }
        const out = await window.CloudUsers.updateMe(payload);
        if (!out.ok) throw new Error(out.message || 'Could not save Quickbase settings.');

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
    await loadQuickbaseData();
  };
})();
