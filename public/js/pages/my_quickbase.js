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
const loadData = async () => {
  const loader = root.querySelector('#qbLoader');
  const wrap = root.querySelector('#qbTableWrap');
  const thead = root.querySelector('#qbTableHead');
  const tbody = root.querySelector('#qbTableBody');
  loader.style.display = 'block';
  wrap.style.display = 'none';
  try {
    const data = await window.QuickbaseAdapter.fetchMonitoringData();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      loader.innerHTML = `<div style="font-weight:600; color:#94a3b8;">No records found in Quickbase table.</div>`;
      return;
    }
    // Dynamic columns extraction based on first record (defensive for schema drift)
    const first = data[0] || {};
    const firstRecordFields = (first.fields && typeof first.fields === 'object')
      ? first.fields
      : ((first.techMonitoringData && typeof first.techMonitoringData === 'object') ? first.techMonitoringData : {});
    // Limit to max 7 columns for compact UI
    const keys = Object.keys(firstRecordFields).slice(0, 7);
    // Render Glassmorphism Headers
    thead.innerHTML = `<tr>
      <th style="background:rgba(15,23,42,0.95); padding:14px 12px; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">Record ID</th>
      ${keys.map(k => `<th style="background:rgba(15,23,42,0.95); padding:14px 12px; font-size:11px; font-weight:800; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">Field ${k}</th>`).join('')}
    </tr>`;
    // Render Table Body Data
    tbody.innerHTML = data.map(row => {
      const f = (row && row.fields && typeof row.fields === 'object')
        ? row.fields
        : ((row && row.techMonitoringData && typeof row.techMonitoringData === 'object') ? row.techMonitoringData : {});
      const recId = row.qbRecordId || 'N/A';
      return `<tr style="border-bottom:1px solid rgba(255,255,255,0.02); transition: background 0.2s;">
        <td style="padding:12px; color:#38bdf8; font-size:13px; font-weight:700;">${window.UI.esc(recId)}</td>
        ${keys.map(k => {
          let val = f[k];
          if (val && typeof val === 'object' && val.value !== undefined) val = val.value;
          const safe = (val === null || val === undefined || val === '') ? '—' : window.UI.esc(val);
          return `<td style="padding:12px; color:#e2e8f0; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${safe}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
    loader.style.display = 'none';
    wrap.style.display = 'block';
  } catch (err) {
    console.error('Quickbase Render Error:', err);
    loader.innerHTML = `<div style="font-weight:600; color:#ef4444;">Failed to establish Quickbase connection. Check console logs.</div>`;
  }
};
const refreshBtn = root.querySelector('#qbRefreshBtn');
if (refreshBtn) refreshBtn.onclick = loadData;
// Init trigger
await loadData();
};
})();
