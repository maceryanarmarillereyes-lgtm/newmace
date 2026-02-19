// Phase 3: Command Center (Team Lead Monitoring Dashboard)
(function(){
  const UI = window.UI;
  const Config = window.Config;
  const CloudTasks = window.CloudTasks;

  function canView(){
    try{
      const user = (window.Auth && typeof window.Auth.getUser === 'function') ? window.Auth.getUser() : null;
      if(Config && typeof Config.can === 'function' && user) {
        return !!Config.can(user, 'view_distribution_monitoring');
      }
      const role = user ? String(user.role || '').toUpperCase() : '';
      return ['TEAM_LEAD','ADMIN','SUPER_ADMIN','SUPER_USER'].includes(role);
    }catch(_){ return false; }
  }

  function pctColor(pct){
    const v = Number(pct||0);
    if(v >= 80) return 'rgba(34,197,94,.85)';   // green
    if(v >= 50) return 'rgba(245,158,11,.85)';  // yellow
    return 'rgba(239,68,68,.85)';               // red
  }

  function fmtDate(iso){
    try{
      if(!iso) return '';
      const d = new Date(iso);
      if(String(d) === 'Invalid Date') return String(iso);
      return d.toLocaleString();
    }catch(_){ return String(iso||''); }
  }

  function downloadBlob(blob, filename){
    try{
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'export.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{
        try{ URL.revokeObjectURL(url); }catch(_){ }
        try{ a.remove(); }catch(_){ }
      }, 500);
    }catch(_){ }
  }

  function buildModal(){
    return `
<div class="modal" id="distReassignModal" aria-hidden="true">
  <div class="panel" style="max-width:720px">
    <div class="head">
      <div>
        <div style="font-weight:900;letter-spacing:.02em">Manage Pending Tasks</div>
        <div class="muted" id="distReassignSub" style="font-size:12px;margin-top:2px">Transfer pending tasks to another member</div>
      </div>
      <button class="btn" data-action="close">Close</button>
    </div>
    <div class="body" style="padding:14px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div class="muted" style="font-size:12px;font-weight:800;margin-bottom:6px">From</div>
          <div id="distReassignFrom" style="font-weight:900"></div>
        </div>
        <div>
          <div class="muted" style="font-size:12px;font-weight:800;margin-bottom:6px">To</div>
          <select class="input" id="distReassignTo"></select>
        </div>
      </div>

      <div class="dist-items-wrap" style="margin-top:12px">
        <div class="dist-items-head">
          <label class="dist-items-selectall"><input type="checkbox" id="distReassignSelectAll"> Select All</label>
          <div class="muted" id="distReassignInfo" style="font-size:12px"></div>
        </div>
        <div class="dist-items-scroll">
          <table class="dist-items-table">
            <thead>
              <tr>
                <th style="width:46px">#</th>
                <th>Case #</th>
                <th>Site</th>
              </tr>
            </thead>
            <tbody id="distReassignItems"></tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn primary" id="distReassignConfirm">Transfer Selected</button>
      </div>
    </div>
  </div>
</div>`;
  }

  function page(root){
    if(!root) return;

    if(!canView()){
      root.innerHTML = `
        <div class="card">
          <div class="card-head"><div class="card-title">Command Center</div></div>
          <div class="card-body">You do not have access to this page.</div>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="card">
        <div class="card-head" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div class="card-title">Command Center</div>
            <div class="muted" style="margin-top:4px">Team Lead monitoring for member progress, problems, and pending task transfers.</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn" id="ccRefresh">Refresh</button>
          </div>
        </div>
        <div class="card-body">
          <div id="ccList"></div>
          <div style="display:flex;justify-content:center;margin-top:14px">
            <button class="btn" id="ccLoadMore">Load more (20)</button>
          </div>
        </div>
      </div>
      ${buildModal()}
    `;

    // Wire modal buttons
    const modal = UI.el('#distReassignModal');
    if(modal){
      modal.addEventListener('click', (e)=>{
        const btn = e.target.closest('[data-action]');
        if(!btn) return;
        const act = btn.getAttribute('data-action');
        if(act === 'close') UI.closeModal('distReassignModal');
      });
    }

    const state = {
      limit: 20,
      offset: 0,
      loading: false,
      done: false,
      dists: [],
      modalCtx: null,
    };

    const elList = UI.el('#ccList');
    const btnMore = UI.el('#ccLoadMore');
    const btnRefresh = UI.el('#ccRefresh');

    function render(){
      const elDistList = UI.el('#ccList');
      if(!elDistList) return;

      const html = [];
      if(!state.dists.length){
        html.push(`<div class="task-empty">No active distributions found. Click refresh to sync.</div>`);
      }

      state.dists.forEach((d)=>{
        const totals = d.totals || {};
        const members = Array.isArray(d.members) ? d.members : [];
        const distId = String(d.id || '');
        const distTitle = UI.esc(d.title || 'Untitled');
        const createdBy = UI.esc(d.created_by_name || 'System');

        html.push(`
          <div class="enterprise-dist-card">
            <div class="dist-header">
              <div class="dist-info">
                <div class="dist-badge">BATCH ID: ${UI.esc(distId ? distId.slice(0, 8) : 'N/A')}</div>
                <h3 class="dist-title">${distTitle}</h3>
                <div class="dist-meta">Lead: <b>${createdBy}</b> • ${UI.esc(fmtDate(d.created_at))}</div>
              </div>
              <div class="dist-actions">
                <button class="btn tiny ghost" data-export="${UI.esc(distId)}">Export CSV</button>
              </div>
            </div>
            <div class="dist-summary-pills">
              <div class="s-pill blue">Tasks: ${totals.total||0}</div>
              <div class="s-pill ${totals.with_problem ? 'red pulse' : 'gray'}">Problems: ${totals.with_problem||0}</div>
              <div class="s-pill gold">Pending: ${totals.pending||0}</div>
            </div>
            <div class="member-grid-compact">
              ${members.map((m)=>{
                const pct = Number(m.completion_pct||0);
                return `
                  <div class="member-mini-card">
                    <div class="m-info">
                      <span class="m-name">${UI.esc(m.name || 'Unknown')}</span>
                      <span class="m-stat">${m.completed||0}/${m.total||0}</span>
                    </div>
                    <div class="m-progress-wrap">
                      <div class="m-progress-bar" style="width:${pct}%; background:${pctColor(pct)}"></div>
                    </div>
                    <div class="m-actions">
                      ${(m.with_problem||0) > 0 ? '<span class="err-dot" title="Has Problem"></span>' : ''}
                      <button class="m-manage-btn" data-manage="${UI.esc(distId)}" data-from="${UI.esc(m.user_id || '')}">Manage</button>
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        `);
      });

      elDistList.innerHTML = `<div class="enterprise-dashboard-grid">${html.join('')}</div>`;

      if(!document.getElementById('cc-enterprise-styles')){
        const s = document.createElement('style');
        s.id = 'cc-enterprise-styles';
        s.textContent = `
          .enterprise-dashboard-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
          .enterprise-dist-card { background:rgba(30, 41, 59, 0.4); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; transition:transform .2s ease, border-color .2s ease; box-shadow:0 8px 24px rgba(0,0,0,.18); }
          .enterprise-dist-card:hover { transform:translateY(-2px); border-color:rgba(56,189,248,.35); }
          .dist-header { display:flex; justify-content:space-between; gap:10px; margin-bottom:12px; }
          .dist-info { min-width:0; }
          .dist-badge { font-size:10px; color:#38bdf8; font-weight:800; letter-spacing:.08em; }
          .dist-title { font-size:16px; margin:4px 0; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .dist-meta { font-size:11px; color:#94a3b8; }
          .dist-summary-pills { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px; }
          .s-pill { padding:4px 10px; border-radius:999px; font-size:10px; font-weight:800; border:1px solid rgba(255,255,255,0.1); }
          .s-pill.blue { background:rgba(56, 189, 248, 0.1); color:#38bdf8; }
          .s-pill.red.pulse { background:rgba(239, 68, 68, 0.2); color:#ef4444; border-color:#ef4444; animation:ccPulse 2s infinite; }
          .s-pill.gray { background:rgba(148,163,184,.12); color:#94a3b8; }
          .s-pill.gold { background:rgba(245, 158, 11, .15); color:#fbbf24; }
          .member-grid-compact { display:flex; flex-direction:column; gap:8px; }
          .member-mini-card { background:rgba(15, 23, 42, 0.3); border:1px solid rgba(255,255,255,.06); border-radius:8px; padding:8px 12px; display:grid; grid-template-columns:minmax(0,1fr) 120px auto; align-items:center; gap:10px; }
          .m-name { font-size:13px; font-weight:700; color:#e2e8f0; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .m-stat { font-size:10px; color:#94a3b8; }
          .m-progress-wrap { height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden; }
          .m-progress-bar { height:100%; border-radius:10px; }
          .m-actions { display:flex; justify-content:flex-end; align-items:center; gap:8px; }
          .m-manage-btn { background:transparent; border:1px solid #38bdf8; color:#38bdf8; font-size:10px; padding:2px 8px; border-radius:4px; cursor:pointer; }
          .m-manage-btn:hover { background:#38bdf8; color:#0f172a; }
          .err-dot { width:8px; height:8px; background:#ef4444; border-radius:50%; display:inline-block; box-shadow:0 0 8px #ef4444; }
          .dist-items-wrap { border:1px solid rgba(148,163,184,.25); border-radius:10px; background:rgba(15,23,42,.42); }
          .dist-items-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-bottom:1px solid rgba(148,163,184,.2); }
          .dist-items-selectall { display:flex; align-items:center; gap:6px; font-size:11px; color:#cbd5e1; font-weight:700; }
          .dist-items-scroll { max-height:220px; overflow:auto; }
          .dist-items-table { width:100%; border-collapse:collapse; font-size:11px; }
          .dist-items-table th { text-align:left; color:#94a3b8; font-weight:800; padding:7px 10px; position:sticky; top:0; background:rgba(15,23,42,.92); }
          .dist-items-table td { padding:6px 10px; border-top:1px solid rgba(148,163,184,.14); color:#e2e8f0; }
          .dist-items-table tr:hover td { background:rgba(56,189,248,.08); }
          .dist-item-checkbox { width:14px; height:14px; accent-color:#38bdf8; }
          .dist-item-empty { text-align:center; color:#94a3b8; }
          @keyframes ccPulse { 0% { opacity: 1; } 50% { opacity: .5; } 100% { opacity: 1; } }

          @media (max-width: 1200px) {
            .enterprise-dashboard-grid { grid-template-columns:1fr; }
          }
          @media (max-width: 600px) {
            .member-mini-card { grid-template-columns:1fr; }
            .m-progress-wrap { width:100%; }
            .m-actions { justify-content:flex-start; }
          }
        `;
        document.head.appendChild(s);
      }

      btnMore.disabled = state.loading || state.done;
      btnMore.style.display = state.done ? 'none' : '';
    }

    async function loadNext(reset){
      if(state.loading) return;
      if(reset){
        state.offset = 0;
        state.dists = [];
        state.done = false;
      }
      state.loading = true;
      render();
      try{
        const out = await CloudTasks.monitoring(state.limit, state.offset);
        if(!out.ok){
          UI.toast(out.message || out.error || 'Failed to load monitoring data', { variant: 'danger' });
          state.loading = false;
          render();
          return;
        }
        const list = (out.data && out.data.distributions) ? out.data.distributions : [];
        const hasMore = !!(out.data && out.data.has_more);
        state.dists = state.dists.concat(list);
        state.offset += list.length;
        state.done = !hasMore || list.length < state.limit;
      }catch(e){
        UI.toast(String(e && e.message ? e.message : e), { variant: 'danger' });
      }finally{
        state.loading = false;
        render();
      }
    }

    async function doExport(distId){
      const out = await CloudTasks.exportDistribution(distId, 'csv');
      if(!out.ok){
        UI.toast(out.message || 'Export failed', { variant: 'danger' });
        return;
      }
      // Try to extract filename from content-disposition.
      let name = `distribution_${distId}.csv`;
      try{
        const cd = out.disposition || '';
        const m = cd.match(/filename\*=UTF-8''([^;]+)|filename=\"([^\"]+)\"|filename=([^;]+)/i);
        const fn = m ? (m[1] || m[2] || m[3]) : '';
        if(fn) name = decodeURIComponent(String(fn).trim());
      }catch(_){ }
      downloadBlob(out.blob, name);
    }

    function getModalSelectedItemIds(){
      const tbody = UI.el('#distReassignItems');
      if(!tbody) return [];
      return Array.from(tbody.querySelectorAll('input[data-item-id]:checked'))
        .map((el)=>String(el.getAttribute('data-item-id') || '').trim())
        .filter(Boolean);
    }

    function syncSelectAllState(){
      const tbody = UI.el('#distReassignItems');
      const allEl = UI.el('#distReassignSelectAll');
      const infoEl = UI.el('#distReassignInfo');
      const btn = UI.el('#distReassignConfirm');
      const total = tbody ? Number(tbody.getAttribute('data-total') || 0) : 0;
      const selected = getModalSelectedItemIds().length;
      if(infoEl) infoEl.textContent = `Selected ${selected} of ${total} pending task(s)`;
      if(btn) btn.disabled = selected <= 0;
      if(allEl){
        allEl.checked = total > 0 && selected === total;
        allEl.indeterminate = selected > 0 && selected < total;
      }
    }

    function openManageModal(distId, fromUserId){
      const dist = state.dists.find((d)=>String(d.id)===String(distId));
      if(!dist) return;
      const members = Array.isArray(dist.members) ? dist.members : [];
      const from = members.find((m)=>String(m.user_id)===String(fromUserId));
      if(!from) return;

      const toSel = UI.el('#distReassignTo');
      const fromEl = UI.el('#distReassignFrom');
      const subEl = UI.el('#distReassignSub');
      const infoEl = UI.el('#distReassignInfo');
      const tbody = UI.el('#distReassignItems');
      const allEl = UI.el('#distReassignSelectAll');

      fromEl.textContent = `${from.name || from.user_id} (${from.user_id})`;
      subEl.textContent = `${dist.title || 'Distribution'} • Select pending tasks to transfer`;

      const opts = members
        .filter((m)=>String(m.user_id)!==String(from.user_id))
        .map((m)=>`<option value="${UI.esc(m.user_id)}">${UI.esc(m.name || m.user_id)}</option>`);
      toSel.innerHTML = opts.join('') || '<option value="">No other members</option>';

      const memberItems = Array.isArray(from.items) ? from.items : [];
      const pendingItems = memberItems.filter((it)=>String(it && it.status || '').trim().toLowerCase() === 'pending');
      if(tbody){
        tbody.setAttribute('data-total', String(pendingItems.length));
        if(!pendingItems.length){
          tbody.innerHTML = '<tr><td colspan="3" class="dist-item-empty">No pending tasks available.</td></tr>';
        }else{
          tbody.innerHTML = pendingItems.map((it)=>{
            const itemId = String(it && it.id || '').trim();
            const caseNo = it && (it.case_number || it.case_no) ? String(it.case_number || it.case_no) : 'N/A';
            const site = it && it.site ? String(it.site) : 'N/A';
            return `<tr><td><input class="dist-item-checkbox" type="checkbox" data-item-id="${UI.esc(itemId)}"></td><td>${UI.esc(caseNo)}</td><td>${UI.esc(site)}</td></tr>`;
          }).join('');
        }
      }

      if(allEl){
        allEl.checked = false;
        allEl.indeterminate = false;
      }

      const pendingCount = pendingItems.length;
      infoEl.textContent = `Selected 0 of ${pendingCount} pending task(s)`;

      state.modalCtx = { distribution_id: distId, from_user_id: from.user_id, pending: pendingCount };
      UI.openModal('distReassignModal');

      const btn = UI.el('#distReassignConfirm');
      btn.disabled = pendingCount <= 0 || !opts.length;
    }

    async function confirmTransfer(){
      const ctx = state.modalCtx;
      if(!ctx) return;
      const toUser = String((UI.el('#distReassignTo') && UI.el('#distReassignTo').value) || '').trim();
      if(!toUser){
        UI.toast('Select a recipient', { variant: 'danger' });
        return;
      }

      const btn = UI.el('#distReassignConfirm');
      btn.disabled = true;
      try{
        const selectedItemIds = getModalSelectedItemIds();
        if(!selectedItemIds.length){
          UI.toast('Select at least one pending task', { variant: 'danger' });
          btn.disabled = false;
          return;
        }
        const out = await CloudTasks.reassignPending({
          distribution_id: ctx.distribution_id,
          from_user_id: ctx.from_user_id,
          to_user_id: toUser,
          selected_item_ids: selectedItemIds
        });
        if(!out.ok){
          UI.toast(out.message || out.error || 'Transfer failed', { variant: 'danger' });
          btn.disabled = false;
          return;
        }
        UI.toast(`Transferred ${out.data && out.data.moved != null ? out.data.moved : 0} pending task(s).`, { variant: 'success' });
        UI.closeModal('distReassignModal');
        await loadNext(true);
      }catch(e){
        UI.toast(String(e && e.message ? e.message : e), { variant: 'danger' });
        btn.disabled = false;
      }
    }

    // Delegated click handlers
    elList.addEventListener('click', (e)=>{
      const ex = e.target.closest('[data-export]');
      if(ex){
        e.preventDefault();
        doExport(ex.getAttribute('data-export'));
        return;
      }
      const mg = e.target.closest('[data-manage]');
      if(mg){
        e.preventDefault();
        const distId = mg.getAttribute('data-manage');
        const from = mg.getAttribute('data-from');
        openManageModal(distId, from);
        return;
      }
    });

    UI.el('#distReassignConfirm').addEventListener('click', (e)=>{
      e.preventDefault();
      confirmTransfer();
    });

    const selectAllEl = UI.el('#distReassignSelectAll');
    if(selectAllEl){
      selectAllEl.addEventListener('change', ()=>{
        const tbody = UI.el('#distReassignItems');
        if(!tbody) return;
        const checks = tbody.querySelectorAll('input[data-item-id]');
        checks.forEach((el)=>{ el.checked = !!selectAllEl.checked; });
        syncSelectAllState();
      });
    }

    const itemsBodyEl = UI.el('#distReassignItems');
    if(itemsBodyEl){
      itemsBodyEl.addEventListener('change', (e)=>{
        const cb = e.target.closest('input[data-item-id]');
        if(!cb) return;
        syncSelectAllState();
      });
    }

    btnMore.addEventListener('click', (e)=>{
      e.preventDefault();
      loadNext(false);
    });

    btnRefresh.addEventListener('click', (e)=>{
      e.preventDefault();
      loadNext(true);
    });

    // Initial load
    loadNext(true);

    // Cleanup
    return () => {
      try{ UI.closeModal('distReassignModal'); }catch(_){ }
    };
  }

  window.Pages = window.Pages || {};
  window.Pages['distribution_monitoring'] = page;
})();
