// Phase 3: Command Center (Team Lead Monitoring Dashboard)
(function(){
  const UI = window.UI;
  const Config = window.Config;
  const CloudTasks = window.CloudTasks;

  function canView(){
    try{
      const role = (window.Me && window.Me.profile && window.Me.profile.role) ? String(window.Me.profile.role) : '';
      // Prefer permission system if present.
      if(Config && typeof Config.can === 'function') return !!Config.can('view_distribution_monitoring');
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

      <div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div class="muted" id="distReassignInfo" style="font-size:12px"></div>
        <button class="btn primary" id="distReassignConfirm">Transfer Pending</button>
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
      const html = [];

      if(!state.dists.length){
        html.push(`<div class="muted">No distributions yet.</div>`);
      }

      state.dists.forEach((d)=>{
        const totals = d.totals || {};
        const members = Array.isArray(d.members) ? d.members : [];

        const headerBadges = [];
        headerBadges.push(`<span class="pill">Tasks: ${totals.total||0}</span>`);
        if((totals.with_problem||0) > 0){
          headerBadges.push(`<span class="pill" style="border-color:rgba(239,68,68,.35);color:rgba(239,68,68,1);background:rgba(239,68,68,.10)">With Problem: ${totals.with_problem}</span>`);
        }
        if((totals.pending||0) > 0){
          headerBadges.push(`<span class="pill">Pending: ${totals.pending}</span>`);
        }

        const distTitle = UI.esc(d.title || 'Untitled');
        const createdBy = UI.esc(d.created_by_name || d.created_by || '');
        const createdAt = fmtDate(d.created_at);

        html.push(`
          <div class="card" style="margin-top:12px">
            <div class="card-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap">
              <div style="min-width:240px">
                <div class="card-title" style="font-size:16px">${distTitle}</div>
                <div class="muted" style="margin-top:3px;font-size:12px">Created by <b>${createdBy}</b> • ${UI.esc(createdAt)}</div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${headerBadges.join('')}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <button class="btn" data-export="${UI.esc(d.id)}">Download Excel/CSV</button>
              </div>
            </div>
            <div class="card-body">
              <table class="table">
                <thead>
                  <tr>
                    <th style="width:36%">Member</th>
                    <th style="width:42%">Completion</th>
                    <th style="width:22%">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${members.map((m)=>{
                    const pct = Number(m.completion_pct||0);
                    const bar = `<div class="syscheck-progress"><div class="bar"><div class="fill" style="width:${pct}%;background:${pctColor(pct)}"></div></div></div>`;
                    const prob = (m.with_problem||0) > 0 ? `<span class="pill" style="margin-left:8px;border-color:rgba(239,68,68,.35);color:rgba(239,68,68,1);background:rgba(239,68,68,.10)">With Problem: ${m.with_problem}</span>` : '';
                    const counts = `<div class="muted" style="font-size:12px;margin-top:4px">${m.completed||0}/${m.total||0} done • ${m.pending||0} pending</div>`;
                    return `
                      <tr>
                        <td>
                          <div style="font-weight:900">${UI.esc(m.name || m.user_id)}</div>
                          <div class="muted" style="font-size:12px">${UI.esc(m.user_id||'')}</div>
                        </td>
                        <td>
                          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                            <div style="font-weight:900">${pct}%</div>
                            <div>${prob}</div>
                          </div>
                          ${bar}
                          ${counts}
                        </td>
                        <td>
                          <button class="btn" data-manage="${UI.esc(d.id)}" data-from="${UI.esc(m.user_id)}">Manage</button>
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `);
      });

      elList.innerHTML = html.join('');

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

      fromEl.textContent = `${from.name || from.user_id} (${from.user_id})`;
      subEl.textContent = `${dist.title || 'Distribution'} • Transfer ONLY PENDING tasks`;

      const opts = members
        .filter((m)=>String(m.user_id)!==String(from.user_id))
        .map((m)=>`<option value="${UI.esc(m.user_id)}">${UI.esc(m.name || m.user_id)}</option>`);
      toSel.innerHTML = opts.join('') || '<option value="">No other members</option>';

      const pendingCount = Number(from.pending||0);
      infoEl.textContent = `Pending tasks to transfer: ${pendingCount}`;

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
        const out = await CloudTasks.reassignPending({
          distribution_id: ctx.distribution_id,
          from_user_id: ctx.from_user_id,
          to_user_id: toUser
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
