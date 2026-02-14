(window.Pages = window.Pages || {}, window.Pages.my_task = function (root) {
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser() || {}) : {};
  const esc = (v) => (window.UI && UI.esc) ? UI.esc(v) : String(v || '');
  const safe = (v, fallback) => {
    const s = String(v == null ? '' : v).trim();
    return s || String(fallback || 'N/A');
  };

  const state = {
    tab: 'incoming',
    assigned: [],
    distributions: [],
    selectedDistributionId: '',
    distributionItems: [],
    members: []
  };

  function fmtDate(v) {
    if (!v) return 'N/A';
    try { return new Date(v).toLocaleString(); } catch (_) { return String(v); }
  }

  function pct(done, total) {
    if (!total) return 0;
    return Math.round((Number(done || 0) / Number(total || 0)) * 100);
  }

  function statusBadgeText(row) {
    const status = String((row && row.status) || 'PENDING').toUpperCase();
    if (status === 'DONE') return 'DONE';
    if (status === 'IN_PROGRESS') return 'IN_PROGRESS';
    return 'PENDING';
  }

  function render() {
    const selected = state.distributions.find((d) => String(d.id) === String(state.selectedDistributionId)) || null;
    const doneCount = state.distributionItems.filter((r) => String(r.status || '').toUpperCase() === 'DONE').length;
    const completion = pct(doneCount, state.distributionItems.length);

    root.innerHTML = `
      <h2 style="margin:0 0 10px">My Task</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn ${state.tab === 'incoming' ? 'primary' : ''}" id="tabIncoming" type="button">My Assigned Tasks</button>
        <button class="btn ${state.tab === 'outgoing' ? 'primary' : ''}" id="tabOutgoing" type="button">Task Distributions</button>
      </div>

      <div id="incomingView" style="display:${state.tab === 'incoming' ? 'block' : 'none'};margin-top:12px">
        <div class="card pad">
          <table class="table">
            <thead>
              <tr>
                <th>Task Description</th><th>From (Creator)</th><th>Deadline</th><th>Status</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${state.assigned.map((row) => `
                <tr>
                  <td>${esc(safe(row.description, 'N/A'))}</td>
                  <td>${esc(safe(row.creator_name, 'N/A'))}</td>
                  <td>${esc(fmtDate(row.deadline))}</td>
                  <td>
                    <select data-item-status="${esc(row.id)}" class="ux-focusable">
                      <option value="PENDING" ${statusBadgeText(row) === 'PENDING' ? 'selected' : ''}>PENDING</option>
                      <option value="IN_PROGRESS" ${statusBadgeText(row) === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
                      <option value="DONE" ${statusBadgeText(row) === 'DONE' ? 'selected' : ''}>DONE</option>
                    </select>
                  </td>
                  <td>
                    <input data-item-remarks="${esc(row.id)}" value="${esc(row.remarks || '')}" placeholder="Add remarks" style="width:100%" />
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="muted">No assigned tasks.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div id="outgoingView" style="display:${state.tab === 'outgoing' ? 'block' : 'none'};margin-top:12px">
        <div class="row" style="justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="small muted">Manage task batches you distributed to the team.</div>
          <button class="btn primary" id="createDistributionBtn" type="button">Create New Distribution</button>
        </div>

        <div class="card pad" style="margin-top:10px">
          <div id="distributionList">
            ${state.distributions.map((d) => {
              const isSelected = String(d.id) === String(state.selectedDistributionId);
              const localItems = isSelected ? state.distributionItems : [];
              const localDone = localItems.filter((it) => String(it.status || '').toUpperCase() === 'DONE').length;
              const localPct = pct(localDone, localItems.length);
              return `
                <div class="card pad" style="margin-bottom:8px;border:1px solid rgba(255,255,255,.1)">
                  <div class="row" style="justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
                    <button class="btn" data-distribution-open="${esc(d.id)}" type="button">${esc(safe(d.title, 'Untitled Distribution'))}</button>
                    <span class="small muted">${esc(safe(d.title, 'Untitled'))} - ${esc(localPct)}% Complete</span>
                  </div>
                  ${isSelected ? `
                    <div style="margin-top:10px" class="small muted">${esc(localDone)} / ${esc(localItems.length)} tasks done</div>
                    <div style="height:8px;background:rgba(255,255,255,.08);border-radius:999px;margin-top:6px;overflow:hidden">
                      <div style="height:100%;width:${Math.max(0, Math.min(100, localPct))}%;background:linear-gradient(90deg,#22c55e,#14b8a6)"></div>
                    </div>
                    <div style="margin-top:8px" class="row">
                      <button class="btn" data-share-link="${esc(d.id)}" type="button">Share Link</button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('') || '<div class="small muted">No task distributions yet.</div>'}
          </div>
        </div>
      </div>

      <div class="modal" id="taskDistributionModal" style="display:none">
        <div class="panel" style="max-width:900px">
          <div class="head"><div class="announce-title">Create New Distribution</div><button class="btn ghost" data-close-task-modal="1" type="button">✕</button></div>
          <div class="body">
            <label class="small muted">Project Title</label>
            <input id="distributionTitleInput" placeholder="Billing Help" style="width:100%;margin-bottom:8px" />
            <div class="small muted" style="margin-bottom:6px">Task Grid</div>
            <table class="table" id="distributionGrid">
              <thead><tr><th>Task Description</th><th>Assignee</th><th>Deadline</th><th></th></tr></thead>
              <tbody id="distributionGridBody"></tbody>
            </table>
            <button class="btn" id="addGridRowBtn" type="button">+ Add Row</button>
          </div>
          <div class="foot">
            <button class="btn" data-close-task-modal="1" type="button">Cancel</button>
            <button class="btn primary" id="submitDistributionBtn" type="button">Submit Distribution</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function buildGridRow(idx, value) {
    const memberOpts = state.members.map((m) => {
      const label = safe(m.name || m.username, m.user_id);
      const selected = String(value.assigned_to || '') === String(m.user_id || '') ? 'selected' : '';
      return `<option value="${esc(m.user_id || '')}" ${selected}>${esc(label)}</option>`;
    }).join('');

    return `
      <tr data-grid-row="${idx}">
        <td><input data-grid-desc="${idx}" value="${esc(value.description || '')}" placeholder="Task description" style="width:100%" /></td>
        <td><select data-grid-assignee="${idx}" style="width:100%"><option value="">Select Assignee</option>${memberOpts}</select></td>
        <td><input type="datetime-local" data-grid-deadline="${idx}" value="${esc(value.deadline || '')}" style="width:100%" /></td>
        <td><button class="btn" data-grid-remove="${idx}" type="button">Remove</button></td>
      </tr>
    `;
  }

  function openModal() {
    const modal = root.querySelector('#taskDistributionModal');
    const body = root.querySelector('#distributionGridBody');
    if (!modal || !body) return;
    modal.style.display = 'flex';
    body.innerHTML = buildGridRow(0, {}) + buildGridRow(1, {});
  }

  function closeModal() {
    const modal = root.querySelector('#taskDistributionModal');
    if (modal) modal.style.display = 'none';
  }

  async function refreshDistributionItems(distributionId) {
    if (!distributionId) {
      state.distributionItems = [];
      return;
    }
    const out = await CloudTasks.distributionItems(distributionId);
    if (!out.ok) {
      state.distributionItems = [];
      return;
    }
    state.distributionItems = Array.isArray(out.data.rows) ? out.data.rows : [];
  }

  function bindEvents() {
    const tabIncoming = root.querySelector('#tabIncoming');
    const tabOutgoing = root.querySelector('#tabOutgoing');
    if (tabIncoming) tabIncoming.onclick = () => { state.tab = 'incoming'; render(); };
    if (tabOutgoing) tabOutgoing.onclick = () => { state.tab = 'outgoing'; render(); };

    (root.querySelectorAll('[data-item-status]') || []).forEach((sel) => {
      sel.onchange = async () => {
        const taskItemId = sel.getAttribute('data-item-status');
        const remarksEl = root.querySelector(`[data-item-remarks="${CSS.escape(String(taskItemId || ''))}"]`);
        const remarks = remarksEl ? String(remarksEl.value || '') : '';
        const out = await CloudTasks.updateItemStatus({ task_item_id: taskItemId, status: sel.value, remarks });
        if (!out.ok) {
          UI.toast && UI.toast(`Failed to update task: ${out.message}`, 'warn');
          return;
        }
        if (String(sel.value || '').toUpperCase() === 'DONE') UI.toast && UI.toast('Task marked as DONE.');
        await loadData(false);
      };
    });

    (root.querySelectorAll('[data-distribution-open]') || []).forEach((btn) => {
      btn.onclick = async () => {
        state.selectedDistributionId = String(btn.getAttribute('data-distribution-open') || '');
        await refreshDistributionItems(state.selectedDistributionId);
        render();
      };
    });

    (root.querySelectorAll('[data-share-link]') || []).forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-share-link');
        const shareUrl = `${location.origin}/my_task?distribution=${encodeURIComponent(String(id || ''))}&readonly=1`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          UI.toast && UI.toast('Share link copied to clipboard.');
        } catch (_) {
          UI.toast && UI.toast(shareUrl);
        }
      };
    });

    const createBtn = root.querySelector('#createDistributionBtn');
    if (createBtn) createBtn.onclick = () => openModal();

    (root.querySelectorAll('[data-close-task-modal]') || []).forEach((btn) => {
      btn.onclick = () => closeModal();
    });

    const addGridRowBtn = root.querySelector('#addGridRowBtn');
    if (addGridRowBtn) {
      addGridRowBtn.onclick = () => {
        const body = root.querySelector('#distributionGridBody');
        if (!body) return;
        const idx = body.querySelectorAll('tr').length;
        body.insertAdjacentHTML('beforeend', buildGridRow(idx, {}));
        bindEvents();
      };
    }

    (root.querySelectorAll('[data-grid-remove]') || []).forEach((btn) => {
      btn.onclick = () => {
        const idx = String(btn.getAttribute('data-grid-remove') || '');
        const row = root.querySelector(`tr[data-grid-row="${CSS.escape(idx)}"]`);
        if (row && row.parentNode) row.parentNode.removeChild(row);
      };
    });

    const submitBtn = root.querySelector('#submitDistributionBtn');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const titleEl = root.querySelector('#distributionTitleInput');
        const title = titleEl ? String(titleEl.value || '').trim() : '';
        const rows = [];
        (root.querySelectorAll('#distributionGridBody tr') || []).forEach((row) => {
          const idx = row.getAttribute('data-grid-row');
          const descEl = root.querySelector(`[data-grid-desc="${CSS.escape(String(idx || ''))}"]`);
          const asgEl = root.querySelector(`[data-grid-assignee="${CSS.escape(String(idx || ''))}"]`);
          const ddlEl = root.querySelector(`[data-grid-deadline="${CSS.escape(String(idx || ''))}"]`);
          rows.push({
            description: descEl ? String(descEl.value || '').trim() : '',
            assigned_to: asgEl ? String(asgEl.value || '').trim() : '',
            deadline: ddlEl ? String(ddlEl.value || '').trim() : ''
          });
        });
        const payload = { title, items: rows.filter((r) => r.description && r.assigned_to) };
        const out = await CloudTasks.createDistribution(payload);
        if (!out.ok) {
          UI.toast && UI.toast(`Failed to create distribution: ${out.message}`, 'warn');
          return;
        }
        closeModal();
        UI.toast && UI.toast('Distribution created successfully.');
        await loadData(true);
      };
    }
  }

  async function loadData(reloadSelectedItems) {
    const [assignedOut, distributionsOut, membersOut] = await Promise.all([
      CloudTasks.assigned(),
      CloudTasks.distributions(),
      CloudTasks.members()
    ]);

    state.assigned = assignedOut.ok ? (assignedOut.data.rows || []) : [];
    state.distributions = distributionsOut.ok ? (distributionsOut.data.rows || []) : [];
    state.members = membersOut.ok ? (membersOut.data.rows || []) : [];

    if (!state.selectedDistributionId && state.distributions[0]) {
      state.selectedDistributionId = String(state.distributions[0].id || '');
    }
    if (reloadSelectedItems !== false) await refreshDistributionItems(state.selectedDistributionId);

    const byDistribution = {};
    state.distributions.forEach((d) => { byDistribution[String(d.id || '')] = d; });
    state.assigned = state.assigned.map((row) => {
      const d = byDistribution[String(row.distribution_id || '')] || {};
      return Object.assign({}, row, {
        creator_name: safe(d.creator_name || d.created_by_name || d.created_by, 'N/A'),
        deadline: row.deadline || row.deadline_at || row.due_at || ''
      });
    });

    render();
  }

  const qs = new URLSearchParams(location.search);
  const sharedDistribution = String(qs.get('distribution') || '').trim();
  if (sharedDistribution) state.selectedDistributionId = sharedDistribution;

  loadData(true).catch((err) => {
    root.innerHTML = `<div class="card pad">Failed to load task orchestration data. ${esc(err && err.message ? err.message : err)}</div>`;
  });
});
