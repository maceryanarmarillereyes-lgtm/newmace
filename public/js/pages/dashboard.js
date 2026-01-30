(window.Pages=window.Pages||{}, window.Pages.dashboard = function(root){
  try{
    if(window.UI && typeof UI.renderDashboard === 'function'){
      UI.renderDashboard(root);
      return;
    }
  }catch(e){ try{ console.error(e); }catch(_){} }

  // Fallback (should not normally execute)
  const u = (window.Auth && Auth.getUser) ? (Auth.getUser()||{}) : {};
  const team = (window.Config && Config.teamById && u.teamId) ? Config.teamById(u.teamId) : null;
  root.innerHTML = `
    <h2 style="margin:0 0 10px">Dashboard</h2>
    <div class="card pad">
      <div class="small muted">Fallback dashboard renderer used. UI.renderDashboard() was not available.</div>
      <div style="margin-top:8px">User: <b>${UI.esc(u.fullName||u.name||u.username||'User')}</b></div>
      <div class="small muted" style="margin-top:2px">Role: ${UI.esc(u.role||'')}</div>
      <div class="small muted">Team: ${UI.esc(team ? (team.label||team.id) : (u.teamId||''))}</div>
    </div>
  `;
});
