
(window.Pages=window.Pages||{}, window.Pages.my_attendance = function(root){
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
  const list = (window.Store && Store.getUserAttendance) ? Store.getUserAttendance(me.id) : [];
  list.sort((a,b)=>(b.ts||0)-(a.ts||0));

  const fmt = (ms)=>{
    try{
      return new Date(Number(ms||0)).toLocaleString('en-CA', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    }catch(_){ return ''; }
  };

  root.innerHTML = `
    <h2 style="margin:0 0 10px">My Attendance</h2>

    <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div class="small muted">
        Attendance is required during your active shift window. Entries are stored locally on this device/browser.
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" id="attExportCsv">Export CSV</button>
        <button class="btn" id="attExportJson">Export JSON</button>
      </div>
    </div>

    <div class="card pad" style="margin-top:10px">
      <table class="table">
        <thead>
          <tr>
            <th>Date/Time</th>
            <th>Team</th>
            <th>Status</th>
            <th>Reason</th>
            <th class="small muted">Shift Key</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(r=>`
            <tr>
              <td>${UI.esc(fmt(r.ts))}</td>
              <td>${UI.esc(r.teamLabel||r.teamId||'')}</td>
              <td><span class="badge ${r.mode==='WFH'?'warn':'ok'}">${UI.esc(r.mode)}</span></td>
              <td>${UI.esc(r.reason||'—')}</td>
              <td class="small muted">${UI.esc(r.shiftKey||'')}</td>
            </tr>
          `).join('') || `<tr><td colspan="5" class="muted">No attendance records found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  const toRows = ()=>{
    const header = ['timestamp','team','mode','reason','shiftKey'];
    const rows = [header];
    for(const r of list){
      rows.push([String(r.ts||''), r.teamLabel||r.teamId||'', r.mode||'', r.reason||'', r.shiftKey||'']);
    }
    return rows;
  };

  const btnCsv = UI.el('#attExportCsv');
  if(btnCsv) btnCsv.onclick = ()=>UI.downloadCSV(`my_attendance_${me.username||me.id||'user'}.csv`, toRows());

  const btnJson = UI.el('#attExportJson');
  if(btnJson) btnJson.onclick = ()=>UI.downloadJSON(`my_attendance_${me.username||me.id||'user'}.json`, list);
});
