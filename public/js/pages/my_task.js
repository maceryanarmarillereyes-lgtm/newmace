
(window.Pages=window.Pages||{}, window.Pages.my_task = function(root){
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
  const weekly = (window.Store && Store.getWeekly) ? (Store.getWeekly()||{}) : {};
  const u = weekly[me.id] || {};
  const days = u.days || {};

  // Flatten blocks
  const blocks = [];
  for(const k of Object.keys(days)){
    const list = Array.isArray(days[k]) ? days[k] : [];
    for(const b of list){
      blocks.push({ dayIndex: Number(k), start:b.start, end:b.end, schedule:b.schedule, label:b.label });
    }
  }
  blocks.sort((a,b)=>{
    if(a.dayIndex!==b.dayIndex) return a.dayIndex-b.dayIndex;
    return String(a.start||'').localeCompare(String(b.start||''));
  });

  const teamId = me.teamId || u.teamId || '';
  const team = (window.Config && Config.teamById) ? Config.teamById(teamId) : { id:teamId, label:teamId };
  const tasks = (window.Store && Store.getTeamTasks) ? Store.getTeamTasks(teamId) : [];
  const taskLabel = (id)=>{
    const t = tasks.find(x=>x && x.id===id);
    return (t && t.label) ? t.label : (id||'');
  };

  root.innerHTML = `
    <h2 style="margin:0 0 10px">My Task</h2>

    <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div class="small muted">
        Weekly schedule blocks stored locally for your account on this device.
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" id="taskExportCsv">Export CSV</button>
        <button class="btn" id="taskExportJson">Export JSON</button>
      </div>
    </div>

    <div class="card pad" style="margin-top:10px">
      <table class="table">
        <thead><tr><th>Day</th><th>Time</th><th>Task</th></tr></thead>
        <tbody>
          ${blocks.map(b=>`
            <tr>
              <td>${UI.esc(UI.DAYS[b.dayIndex]||String(b.dayIndex))}</td>
              <td>${UI.esc(`${b.start||''} - ${b.end||''}`)}</td>
              <td>${UI.esc(taskLabel(b.schedule||b.label||''))}</td>
            </tr>
          `).join('') || `<tr><td colspan="3" class="muted">No schedule blocks found.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  const rows = [['dayIndex','day','start','end','taskId','taskLabel']];
  blocks.forEach(b=>{
    const id = b.schedule||b.label||'';
    rows.push([String(b.dayIndex), UI.DAYS[b.dayIndex]||'', b.start||'', b.end||'', id, taskLabel(id)]);
  });

  UI.el('#taskExportCsv').onclick = ()=>UI.downloadCSV(`my_tasks_${me.username||me.id||'user'}.csv`, rows);
  UI.el('#taskExportJson').onclick = ()=>UI.downloadJSON(`my_tasks_${me.username||me.id||'user'}.json`, blocks);
});
