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
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((f) => f && typeof f === 'object')
      .map((f) => ({
        fieldId: String((f.fieldId ?? f.field_id ?? '')).trim(),
        operator: String((f.operator ?? 'EX')).trim().toUpperCase(),
        value: String((f.value ?? '')).trim()
      }))
      .filter((f) => f.fieldId && f.value);
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
    const profile = (me && window.Store && Store.getProfile) ? (Store.getProfile(me.id) || {}) : {};

    const initialLink = String(profile.qb_report_link || profile.quickbase_url || '').trim();
    const parsedFromLink = parseQuickbaseLink(initialLink);
    const state = {
      reportLink: initialLink,
      qid: String(profile.qb_qid || profile.quickbase_qid || parsedFromLink.qid || '').trim(),
      tableId: String(profile.qb_table_id || profile.quickbase_table_id || parsedFromLink.tableId || '').trim(),
      customColumns: Array.isArray(profile.qb_custom_columns) ? profile.qb_custom_columns.map((v) => String(v)) : [],
      customFilters: normalizeFilters(profile.qb_custom_filters),
      allAvailableFields: []
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
              <div id="qbColumnGrid" class="grid cols-3" style="gap:8px;"></div>
            </section>

            <section class="card pad">
              <div class="row" style="justify-content:space-between;align-items:center;">
                <div class="h3" style="margin:0;">3) Filter Config</div>
                <button class="btn" id="qbAddFilterBtn" type="button">+ Add Filter</button>
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

    function renderColumnGrid() {
      const grid = root.querySelector('#qbColumnGrid');
      if (!grid) return;
      if (!state.allAvailableFields.length) {
        grid.innerHTML = '<div class="small muted">Load data first to fetch available Quickbase fields.</div>';
        return;
      }
      grid.innerHTML = state.allAvailableFields.map((f) => {
        const checked = state.customColumns.includes(String(f.id)) ? 'checked' : '';
        return `<label class="row" style="gap:8px;align-items:flex-start;"><input type="checkbox" data-col-id="${esc(String(f.id))}" ${checked} /><span class="small">${esc(f.label)} <span class="muted">(#${esc(String(f.id))})</span></span></label>`;
      }).join('');

      grid.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        el.addEventListener('change', () => {
          const id = String(el.getAttribute('data-col-id') || '').trim();
          if (!id) return;
          if (el.checked) {
            if (!state.customColumns.includes(id)) state.customColumns.push(id);
          } else {
            state.customColumns = state.customColumns.filter((v) => v !== id);
          }
        });
      });
    }

    function filterRowTemplate(f, idx) {
      const fieldOptions = state.allAvailableFields.map((x) => `<option value="${esc(String(x.id))}" ${String(f.fieldId) === String(x.id) ? 'selected' : ''}>${esc(x.label)} (#${esc(String(x.id))})</option>`).join('');
      return `
        <div class="row" data-filter-idx="${idx}" style="gap:8px;align-items:center;flex-wrap:wrap;">
          <select class="input" data-f="fieldId" style="max-width:300px;"><option value="">Select field</option>${fieldOptions}</select>
          <select class="input" data-f="operator" style="max-width:120px;">
            <option value="EX" ${f.operator === 'EX' ? 'selected' : ''}>Equals</option>
            <option value="CT" ${f.operator === 'CT' ? 'selected' : ''}>Contains</option>
            <option value="XEX" ${f.operator === 'XEX' ? 'selected' : ''}>Not Equals</option>
          </select>
          <input class="input" data-f="value" value="${esc(f.value)}" placeholder="Filter value" style="min-width:220px;" />
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
          input.addEventListener('input', () => {
            const key = String(input.getAttribute('data-f') || '');
            if (!state.customFilters[idx]) return;
            state.customFilters[idx][key] = String(input.value || '').trim();
          });
        });
      });
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
    }

    function closeSettings() {
      if (window.UI && UI.closeModal) UI.closeModal('qbSettingsModal');
    }

    root.querySelector('#qbOpenSettingsBtn').onclick = openSettings;
    root.querySelector('#qbCloseSettingsBtn').onclick = closeSettings;
    root.querySelector('#qbCancelSettingsBtn').onclick = closeSettings;
    root.querySelector('#qbReloadBtn').onclick = () => loadQuickbaseData();
    root.querySelector('#qbAddFilterBtn').onclick = () => {
      state.customFilters.push({ fieldId: '', operator: 'EX', value: '' });
      renderFilters();
    };

    const saveBtn = root.querySelector('#qbSaveSettingsBtn');
    saveBtn.onclick = async () => {
      if (!me) return;
      const reportLink = String((root.querySelector('#qbReportLink') || {}).value || '').trim();
      const qidInput = String((root.querySelector('#qbQid') || {}).value || '').trim();
      const tableIdInput = String((root.querySelector('#qbTableId') || {}).value || '').trim();
      const parsed = parseQuickbaseLink(reportLink);
      const payload = {
        qb_report_link: reportLink,
        qb_qid: qidInput || parsed.qid,
        qb_realm: parsed.realm,
        qb_table_id: tableIdInput || parsed.tableId,
        qb_custom_columns: Array.from(new Set((state.customColumns || []).map((v) => String(v).trim()).filter(Boolean))),
        qb_custom_filters: normalizeFilters(state.customFilters)
      };

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
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
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
      }
    };

    await loadQuickbaseData();
  };
})();
