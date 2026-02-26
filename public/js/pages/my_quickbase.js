/**
 * public/js/pages/my_quickbase.js
 * High Level Enterprise UI for Quickbase Data
 */
(function(){
  window.Pages = window.Pages || {};
  window.Pages.my_quickbase = async function(root) {
    root.innerHTML = `
      <div class="dashx">
        <div class="dashx-head">
          <div>
            <h2 class="ux-h1" style="margin:0">My Quickbase</h2>
            <div class="small muted ux-sub">Live synchronized data from Quickbase integration</div>
          </div>
          <button class="btn primary" id="qbRefreshBtn">
            <span class="ico" data-ico="refresh">↻</span> Refresh
          </button>
        </div>

        <div class="card pad" style="margin-top:16px; border:1px solid rgba(255,255,255,0.08); background:rgba(15,23,42,0.35)">
          <div style="font-weight:700; margin-bottom:10px;">Report Columns</div>
          <div id="qbColumnToggles" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
        </div>

        <div class="card pad" style="margin-top:12px; border:1px solid rgba(255,255,255,0.08); background:rgba(15,23,42,0.35)">
          <div style="font-weight:700; margin-bottom:10px;">Filters</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
            <label class="small" style="display:flex; flex-direction:column; gap:6px;">Type
              <select class="input" id="qbFilterType"></select>
            </label>
            <label class="small" style="display:flex; flex-direction:column; gap:6px;">End User
              <select class="input" id="qbFilterEndUser"></select>
            </label>
            <label class="small" style="display:flex; flex-direction:column; gap:6px;">Assigned to (Dynamic)
              <select class="input" id="qbFilterAssignedTo"></select>
            </label>
            <label class="small" style="display:flex; flex-direction:column; gap:6px;">Case Status (Dynamic)
              <select class="input" id="qbFilterCaseStatus"></select>
            </label>
          </div>
        </div>

        <div class="card pad" style="margin-top:12px; border:1px solid rgba(255,255,255,0.08); background:rgba(15,23,42,0.35)">
          <div style="font-weight:700; margin-bottom:10px;">Sorting & Grouping</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <label class="small">Sort by
              <select class="input" id="qbSortBy" style="min-width:180px; margin-left:6px;"></select>
            </label>
            <label class="small">Order
              <select class="input" id="qbSortOrder" style="margin-left:6px;">
                <option value="asc">Low to High</option>
                <option value="desc">High to Low</option>
              </select>
            </label>
          </div>
        </div>

        <div class="card pad glass-table-container" style="margin-top:20px; min-height: 300px; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.06);">
          <div id="qbLoader" style="text-align:center; padding: 60px 20px; color: #94a3b8;">
            <div class="dashx-spin on" style="display:inline-block; margin-bottom: 12px; font-size: 24px;">⏳</div>
            <div style="font-weight: 600;">Fetching secure payload from Quickbase...</div>
          </div>
          <div id="qbTableWrap" style="display:none; overflow-x: auto;">
            <table class="mbx-assign-table" style="width:100%; border-collapse:collapse;">
              <thead id="qbTableHead"></thead>
              <tbody id="qbTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const getCellRawValue = (row, id) => {
      const f = (row && row.fields && typeof row.fields === 'object') ? row.fields : {};
      let val = f[String(id || '')];
      if (val && typeof val === 'object' && val.value !== undefined) val = val.value;
      return (val == null || val === '') ? 'N/A' : String(val);
    };

    const uiState = {
      rows: [],
      columns: [],
      visibleColumnIds: new Set(),
      settings: {},
      type: 'all',
      endUser: 'all',
      assignedTo: 'all',
      caseStatus: 'all',
      sortBy: '',
      sortOrder: 'asc'
    };

    const columnWrap = root.querySelector('#qbColumnToggles');
    const typeSel = root.querySelector('#qbFilterType');
    const endUserSel = root.querySelector('#qbFilterEndUser');
    const assignedSel = root.querySelector('#qbFilterAssignedTo');
    const statusSel = root.querySelector('#qbFilterCaseStatus');
    const sortBySel = root.querySelector('#qbSortBy');
    const sortOrderSel = root.querySelector('#qbSortOrder');

    const syncFilterOptions = (el, values, preferredValues) => {
      const current = el.value || 'all';
      const uniq = Array.from(new Set([...(preferredValues || []), ...(values || [])].filter(Boolean)));
      el.innerHTML = ['<option value="all">All</option>']
        .concat(uniq.map((v) => `<option value="${window.UI.esc(String(v))}">${window.UI.esc(String(v))}</option>`))
        .join('');
      if (uniq.includes(current)) el.value = current;
      else el.value = 'all';
    };

    const renderColumnsControl = () => {
      const safeColumns = uiState.columns;
      columnWrap.innerHTML = safeColumns.map((c) => {
        const checked = uiState.visibleColumnIds.has(String(c.id || '')) ? 'checked' : '';
        return `<label class="small" style="display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(255,255,255,0.1); padding:6px 8px; border-radius:8px;">
          <input type="checkbox" data-col-id="${window.UI.esc(String(c.id || ''))}" ${checked} />
          <span>${window.UI.esc(c.label || c.id || 'N/A')}</span>
        </label>`;
      }).join('');
    };

    const renderTable = () => {
      const loader = root.querySelector('#qbLoader');
      const wrap = root.querySelector('#qbTableWrap');
      const thead = root.querySelector('#qbTableHead');
      const tbody = root.querySelector('#qbTableBody');

      const visibleColumns = uiState.columns.filter((c) => uiState.visibleColumnIds.has(String(c.id || '')));

      let filtered = uiState.rows.filter((row) => {
        const typeVal = getCellRawValue(row, uiState.settings.fieldIds && uiState.settings.fieldIds.type);
        const endUserVal = getCellRawValue(row, uiState.settings.fieldIds && uiState.settings.fieldIds.endUser);
        const assignedVal = getCellRawValue(row, uiState.settings.fieldIds && uiState.settings.fieldIds.assignedTo);
        const statusVal = getCellRawValue(row, uiState.settings.fieldIds && uiState.settings.fieldIds.caseStatus);

        const passType = uiState.type === 'all' || typeVal === uiState.type;
        const passEndUser = uiState.endUser === 'all' || endUserVal === uiState.endUser;
        const passAssigned = uiState.assignedTo === 'all' || assignedVal === uiState.assignedTo;
        const passStatus = uiState.caseStatus === 'all' || statusVal === uiState.caseStatus;
        return passType && passEndUser && passAssigned && passStatus;
      });

      const activeSortFieldId = uiState.sortBy;
      if (activeSortFieldId) {
        filtered = filtered.slice().sort((a, b) => {
          const av = getCellRawValue(a, activeSortFieldId);
          const bv = getCellRawValue(b, activeSortFieldId);
          const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
          return uiState.sortOrder === 'desc' ? -cmp : cmp;
        });
      }

      thead.innerHTML = `<tr>
        <th style="background:rgba(15,23,42,0.95); padding:14px 12px; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">Case #</th>
        ${visibleColumns.map((c) => `<th style="background:rgba(15,23,42,0.95); padding:14px 12px; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">${window.UI.esc(c.label || c.id)}</th>`).join('')}
      </tr>`;

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="${visibleColumns.length + 1}" style="padding:18px; color:#94a3b8;">No records matched your filters.</td></tr>`;
      } else {
        tbody.innerHTML = filtered.map((row) => {
          const recId = row.qbRecordId || 'N/A';
          return `<tr style="border-bottom:1px solid rgba(255,255,255,0.02); transition: background 0.2s;">
            <td style="padding:12px; color:#38bdf8; font-size:13px; font-weight:700;">${window.UI.esc(recId)}</td>
            ${visibleColumns.map((c) => {
              const safe = window.UI.esc(getCellRawValue(row, c.id));
              return `<td style="padding:12px; color:#e2e8f0; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:280px;">${safe}</td>`;
            }).join('')}
          </tr>`;
        }).join('');
      }

      loader.style.display = 'none';
      wrap.style.display = 'block';
    };

    const wireControls = () => {
      columnWrap.querySelectorAll('input[type="checkbox"][data-col-id]').forEach((el) => {
        el.onchange = () => {
          const id = String(el.getAttribute('data-col-id') || '');
          if (!id) return;
          if (el.checked) uiState.visibleColumnIds.add(id);
          else uiState.visibleColumnIds.delete(id);
          renderTable();
        };
      });

      const onFilterChange = () => {
        uiState.type = typeSel.value || 'all';
        uiState.endUser = endUserSel.value || 'all';
        uiState.assignedTo = assignedSel.value || 'all';
        uiState.caseStatus = statusSel.value || 'all';
        uiState.sortBy = sortBySel.value || '';
        uiState.sortOrder = sortOrderSel.value || 'asc';
        renderTable();
      };
      [typeSel, endUserSel, assignedSel, statusSel, sortBySel, sortOrderSel].forEach((el) => {
        el.onchange = onFilterChange;
      });
    };

    const loadData = async () => {
      const loader = root.querySelector('#qbLoader');
      const wrap = root.querySelector('#qbTableWrap');
      loader.style.display = 'block';
      wrap.style.display = 'none';
      try {
        const payload = await window.QuickbaseAdapter.fetchMonitoringData();
        const data = Array.isArray(payload && payload.rows) ? payload.rows : [];
        const columns = Array.isArray(payload && payload.columns) ? payload.columns : [];
        const settings = payload && payload.settings && typeof payload.settings === 'object' ? payload.settings : {};

        if (!data.length) {
          loader.innerHTML = `<div style="font-weight:600; color:#94a3b8;">No records found in Quickbase table.</div>`;
          return;
        }

        const safeColumns = columns.length ? columns : Object.keys((data[0] && data[0].fields) || {})
          .slice(0, 8)
          .map((id) => ({ id, label: `Field ${id}` }));

        uiState.rows = data;
        uiState.columns = safeColumns;
        uiState.settings = settings;
        uiState.visibleColumnIds = new Set(safeColumns.map((c) => String(c.id || '')));

        renderColumnsControl();

        const allTypes = data.map((r) => getCellRawValue(r, settings.fieldIds && settings.fieldIds.type));
        const allEndUsers = data.map((r) => getCellRawValue(r, settings.fieldIds && settings.fieldIds.endUser));
        const allAssigned = data.map((r) => getCellRawValue(r, settings.fieldIds && settings.fieldIds.assignedTo));
        const allStatuses = data.map((r) => getCellRawValue(r, settings.fieldIds && settings.fieldIds.caseStatus));

        syncFilterOptions(typeSel, allTypes, settings.types);
        syncFilterOptions(endUserSel, allEndUsers, settings.endUsers);
        syncFilterOptions(assignedSel, allAssigned, []);
        syncFilterOptions(statusSel, allStatuses, []);

        sortBySel.innerHTML = ['<option value="">Case #</option>'].concat(
          safeColumns.map((c) => `<option value="${window.UI.esc(String(c.id || ''))}">${window.UI.esc(c.label || c.id || 'N/A')}</option>`)
        ).join('');

        const sortDefault = String((settings.sortBy && settings.sortBy[0]) || '').toLowerCase();
        if (sortDefault.includes('end user')) {
          const endUserId = String(settings.fieldIds && settings.fieldIds.endUser || '');
          if (endUserId) sortBySel.value = endUserId;
        }

        wireControls();
        renderTable();
      } catch (err) {
        console.error('Quickbase Render Error:', err);
        loader.innerHTML = `<div style="font-weight:600; color:#ef4444;">Failed to establish Quickbase connection. Check console logs.</div>`;
      }
    };

    const refreshBtn = root.querySelector('#qbRefreshBtn');
    if (refreshBtn) refreshBtn.onclick = loadData;
    await loadData();
  };
})();
