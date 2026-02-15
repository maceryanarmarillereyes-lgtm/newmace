(window.Pages = window.Pages || {}, window.Pages.my_task = function (root) {
  const esc = (v) => (window.UI && UI.esc) ? UI.esc(v) : String(v || '');
  const safe = (v, fallback) => {
    const s = String(v == null ? '' : v).trim();
    return s || String(fallback || 'N/A');
  };

  const state = {
    tab: 'incoming',
    assignedGroups: [],
    distributions: [],
    selectedDistributionId: '',
    distributionItems: [],
    members: [],
    expandedGroupId: '',
    gridRows: []
  };

  const GRID_COLUMNS = ['case_number', 'site', 'description', 'assigned_name', 'deadline', 'reference_url'];

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

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function scoreNameMatch(input, candidate) {
    const a = normalizeName(input);
    const b = normalizeName(candidate);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.86;
    const aTokens = a.split(' ').filter(Boolean);
    const bTokens = b.split(' ').filter(Boolean);
    if (!aTokens.length || !bTokens.length) return 0;
    const overlap = aTokens.filter((tok) => bTokens.includes(tok)).length;
    return overlap / Math.max(aTokens.length, bTokens.length);
  }

  function findMemberMatch(nameInput) {
    let best = null;
    state.members.forEach((member) => {
      const label = safe(member.name || member.username || member.user_id, 'N/A');
      const score = Math.max(scoreNameMatch(nameInput, label), scoreNameMatch(nameInput, member.username || ''));
      if (!best || score > best.score) {
        best = { member, score };
      }
    });
    return best;
  }

  function normalizeDeadlineInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hour = String(parsed.getHours()).padStart(2, '0');
    const minute = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  function createGridRow(value) {
    const row = Object.assign({
      case_number: '',
      site: '',
      description: '',
      assigned_name: '',
      assigned_to: '',
      deadline: '',
      reference_url: '',
      match_score: 0,
      match_state: 'none'
    }, value || {});

    if (row.assigned_name && !row.assigned_to) {
      applyNameMatch(row, row.assigned_name);
    }

    return row;
  }

  function applyNameMatch(row, assignedName) {
    const picked = findMemberMatch(assignedName);
    row.assigned_name = String(assignedName || '').trim();
    if (!picked || picked.score < 0.72) {
      row.assigned_to = '';
      row.match_score = picked ? picked.score : 0;
      row.match_state = 'none';
      return;
    }
    row.assigned_to = String(picked.member.user_id || '');
    row.match_score = picked.score;
    row.match_state = picked.score >= 0.95 ? 'high' : 'good';
  }

  function rowMatchBadge(row) {
    if (!row) return '';
    if (row.match_state === 'high' || row.match_state === 'good') return '<span style="color:#22c55e;font-weight:600">GREEN • Matched</span>';
    return '<span style="color:#ef4444;font-weight:600">RED • Select member</span>';
  }

  function hasUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  function renderIncomingGroups() {
    if (!state.assignedGroups.length) return '<div class="card pad"><div class="small muted">No assigned tasks.</div></div>';

    return state.assignedGroups.map((group) => {
      const id = String(group.distribution_id || '');
      const pending = Number(group.pending_count || 0);
      const total = Number(group.total_count || 0);
      const done = Number(group.done_count || Math.max(total - pending, 0));
      const progress = pct(done, total);
      const expanded = state.expandedGroupId === id;
      return `
        <div class="card pad" style="margin-bottom:10px;border:1px solid rgba(255,255,255,.12)">
          <button class="btn" data-group-toggle="${esc(id)}" type="button" style="width:100%;text-align:left;padding:10px 12px">
            <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <div>
                <div style="font-weight:700">${esc(safe(group.project_title, 'Untitled Distribution'))}</div>
                <div class="small muted">Assigned by ${esc(safe(group.assigner_name, 'N/A'))}</div>
              </div>
              <div style="text-align:right">
                <div style="font-weight:700;color:${pending > 0 ? '#ef4444' : '#22c55e'}">🔴 ${esc(pending)} Pending</div>
                <div class="small muted">${esc(done)} / ${esc(total)} complete</div>
              </div>
            </div>
            <div style="height:8px;background:rgba(255,255,255,.1);border-radius:999px;overflow:hidden;margin-top:10px">
              <div style="height:100%;width:${Math.max(0, Math.min(100, progress))}%;background:linear-gradient(90deg,#22c55e,#14b8a6)"></div>
            </div>
          </button>
          ${expanded ? `
            <div style="margin-top:10px;overflow:auto">
              <table class="table">
                <thead>
                  <tr><th>Case #</th><th>Site</th><th>Description</th><th>Deadline</th><th>Link/WI</th><th>Status</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  ${(group.items || []).map((item) => `
                    <tr>
                      <td>${esc(safe(item.case_number || item.case_no, 'N/A'))}</td>
                      <td>${esc(safe(item.site, 'N/A'))}</td>
                      <td>${esc(safe(item.description, 'N/A'))}</td>
                      <td>${esc(fmtDate(item.deadline || item.deadline_at || item.due_at))}</td>
                      <td>
                        ${hasUrl(item.reference_url) ? `<a href="${esc(item.reference_url)}" target="_blank" rel="noopener" title="Open work instruction">📎</a>` : '<span class="muted">—</span>'}
                      </td>
                      <td>
                        <select data-item-status="${esc(item.id)}" class="ux-focusable">
                          <option value="PENDING" ${statusBadgeText(item) === 'PENDING' ? 'selected' : ''}>PENDING</option>
                          <option value="IN_PROGRESS" ${statusBadgeText(item) === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
                          <option value="DONE" ${statusBadgeText(item) === 'DONE' ? 'selected' : ''}>DONE</option>
                        </select>
                      </td>
                      <td><input data-item-remarks="${esc(item.id)}" value="${esc(item.remarks || '')}" placeholder="Add remarks" style="width:100%" /></td>
                    </tr>
                  `).join('') || '<tr><td colspan="7" class="muted">No task items in this group.</td></tr>'}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function memberOptions(selectedUid) {
    return state.members.map((m) => {
      const label = safe(m.name || m.username, m.user_id);
      const selected = String(selectedUid || '') === String(m.user_id || '') ? 'selected' : '';
      return `<option value="${esc(m.user_id || '')}" ${selected}>${esc(label)}</option>`;
    }).join('');
  }

  function renderDistributionGridRows() {
    if (!state.gridRows.length) return '';
    return state.gridRows.map((row, idx) => `
      <tr data-grid-row="${idx}" style="background:${row.match_state === 'none' ? 'rgba(239,68,68,.08)' : 'rgba(34,197,94,.08)'}">
        <td><input data-grid-input="${idx}" data-col="case_number" value="${esc(row.case_number)}" placeholder="Case #" style="width:100%" /></td>
        <td><input data-grid-input="${idx}" data-col="site" value="${esc(row.site)}" placeholder="Site" style="width:100%" /></td>
        <td><input data-grid-input="${idx}" data-col="description" value="${esc(row.description)}" placeholder="Description" style="width:100%" /></td>
        <td>
          <input data-grid-input="${idx}" data-col="assigned_name" value="${esc(row.assigned_name)}" placeholder="Assigned To" style="width:100%;margin-bottom:4px" />
          <select data-grid-assignee="${idx}" style="width:100%"><option value="">Select Assignee</option>${memberOptions(row.assigned_to)}</select>
        </td>
        <td><input data-grid-input="${idx}" data-col="deadline" value="${esc(row.deadline)}" placeholder="YYYY-MM-DDTHH:mm" style="width:100%" /></td>
        <td><input data-grid-input="${idx}" data-col="reference_url" value="${esc(row.reference_url)}" placeholder="https://..." style="width:100%" /></td>
        <td>${rowMatchBadge(row)}</td>
        <td><button class="btn" data-grid-remove="${idx}" type="button">Remove</button></td>
      </tr>
    `).join('');
  }

  function render() {
    root.innerHTML = `
      <h2 style="margin:0 0 10px">My Task</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn ${state.tab === 'incoming' ? 'primary' : ''}" id="tabIncoming" type="button">My Assigned Tasks</button>
        <button class="btn ${state.tab === 'outgoing' ? 'primary' : ''}" id="tabOutgoing" type="button">Task Distributions</button>
      </div>

      <div id="incomingView" style="display:${state.tab === 'incoming' ? 'block' : 'none'};margin-top:12px">
        ${renderIncomingGroups()}
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
                    <span class="small muted">${esc(localDone)} / ${esc(localItems.length)} done (${esc(localPct)}%)</span>
                  </div>
                  ${isSelected ? `<div style="margin-top:8px" class="row"><button class="btn" data-share-link="${esc(d.id)}" type="button">Share Link</button></div>` : ''}
                </div>
              `;
            }).join('') || '<div class="small muted">No task distributions yet.</div>'}
          </div>
        </div>
      </div>

      <div class="modal" id="taskDistributionModal" style="display:none">
        <div class="panel" style="max-width:1200px">
          <div class="head"><div class="announce-title">Create New Distribution</div><button class="btn ghost" data-close-task-modal="1" type="button">✕</button></div>
          <div class="body">
            <label class="small muted">Project Title</label>
            <input id="distributionTitleInput" placeholder="Billing Help" style="width:100%;margin-bottom:8px" />
            <div class="small muted" style="margin-bottom:6px">Excel Bulk Paste supported (Case #, Site, Description, Assigned To, Deadline, Link/WI)</div>
            <table class="table" id="distributionGrid">
              <thead><tr><th>Case #</th><th>Site</th><th>Description</th><th>Assigned To</th><th>Deadline</th><th>Link/WI</th><th>Match</th><th></th></tr></thead>
              <tbody id="distributionGridBody">${renderDistributionGridRows()}</tbody>
            </table>
            <div class="row" style="gap:8px"><button class="btn" id="addGridRowBtn" type="button">+ Add Row</button></div>
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

  function openModal() {
    if (!state.gridRows.length) state.gridRows = [createGridRow({}), createGridRow({})];
    const modal = root.querySelector('#taskDistributionModal');
    if (modal) modal.style.display = 'flex';
    render();
    const reopened = root.querySelector('#taskDistributionModal');
    if (reopened) reopened.style.display = 'flex';
  }

  function closeModal() {
    const modal = root.querySelector('#taskDistributionModal');
    if (modal) modal.style.display = 'none';
  }

  function applyPasteData(startRow, startCol, rawText) {
    const rows = String(rawText || '').replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
    rows.forEach((line, rowOffset) => {
      const cells = line.split('\t');
      const targetIndex = startRow + rowOffset;
      while (!state.gridRows[targetIndex]) state.gridRows.push(createGridRow({}));
      const row = state.gridRows[targetIndex];

      cells.forEach((cell, colOffset) => {
        const col = GRID_COLUMNS[startCol + colOffset];
        if (!col) return;
        const trimmed = String(cell || '').trim();
        if (col === 'assigned_name') {
          applyNameMatch(row, trimmed);
        } else if (col === 'deadline') {
          row.deadline = normalizeDeadlineInput(trimmed);
        } else {
          row[col] = trimmed;
        }
        if (hasUrl(trimmed) && !row.reference_url) row.reference_url = trimmed;
      });

      if (row.assigned_name && !row.assigned_to) applyNameMatch(row, row.assigned_name);
    });
  }

  async function refreshDistributionItems(distributionId) {
    if (!distributionId) {
      state.distributionItems = [];
      return;
    }
    const out = await CloudTasks.distributionItems(distributionId);
    state.distributionItems = out.ok && Array.isArray(out.data.rows) ? out.data.rows : [];
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
        await loadData(false);
      };
    });

    (root.querySelectorAll('[data-group-toggle]') || []).forEach((btn) => {
      btn.onclick = () => {
        const groupId = String(btn.getAttribute('data-group-toggle') || '');
        state.expandedGroupId = state.expandedGroupId === groupId ? '' : groupId;
        render();
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
        state.gridRows.push(createGridRow({}));
        render();
        const modal = root.querySelector('#taskDistributionModal');
        if (modal) modal.style.display = 'flex';
      };
    }

    const gridBody = root.querySelector('#distributionGridBody');
    if (gridBody) {
      gridBody.onpaste = (event) => {
        const target = event.target;
        if (!target || !target.getAttribute) return;
        const rowIndex = Number(target.getAttribute('data-grid-input') || 0);
        const col = String(target.getAttribute('data-col') || 'case_number');
        const colIndex = Math.max(0, GRID_COLUMNS.indexOf(col));
        const clipboardText = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
        if (!clipboardText) return;
        event.preventDefault();
        applyPasteData(rowIndex, colIndex, clipboardText);
        render();
        const modal = root.querySelector('#taskDistributionModal');
        if (modal) modal.style.display = 'flex';
      };

      gridBody.oninput = (event) => {
        const target = event.target;
        if (!target || !target.getAttribute) return;
        const idx = Number(target.getAttribute('data-grid-input'));
        const col = String(target.getAttribute('data-col') || '');
        if (!Number.isFinite(idx) || !state.gridRows[idx] || !col) return;
        const value = String(target.value || '');
        if (col === 'assigned_name') {
          applyNameMatch(state.gridRows[idx], value);
        } else if (col === 'deadline') {
          state.gridRows[idx].deadline = normalizeDeadlineInput(value);
        } else {
          state.gridRows[idx][col] = value;
        }
        if (hasUrl(value)) state.gridRows[idx].reference_url = value;
      };

      gridBody.onchange = (event) => {
        const target = event.target;
        if (!target || !target.getAttribute) return;
        const idx = Number(target.getAttribute('data-grid-assignee'));
        if (!Number.isFinite(idx) || !state.gridRows[idx]) return;
        state.gridRows[idx].assigned_to = String(target.value || '');
        state.gridRows[idx].match_state = state.gridRows[idx].assigned_to ? 'good' : 'none';
        render();
        const modal = root.querySelector('#taskDistributionModal');
        if (modal) modal.style.display = 'flex';
      };

      (root.querySelectorAll('[data-grid-remove]') || []).forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-grid-remove'));
          if (!Number.isFinite(idx)) return;
          state.gridRows.splice(idx, 1);
          if (!state.gridRows.length) state.gridRows.push(createGridRow({}));
          render();
          const modal = root.querySelector('#taskDistributionModal');
          if (modal) modal.style.display = 'flex';
        };
      });
    }

    const submitBtn = root.querySelector('#submitDistributionBtn');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const titleEl = root.querySelector('#distributionTitleInput');
        const title = titleEl ? String(titleEl.value || '').trim() : '';
        const items = state.gridRows
          .map((row) => ({
            case_number: String(row.case_number || '').trim(),
            site: String(row.site || '').trim(),
            description: String(row.description || '').trim(),
            assigned_to: String(row.assigned_to || '').trim(),
            deadline: String(row.deadline || '').trim(),
            reference_url: String(row.reference_url || '').trim()
          }))
          .filter((row) => row.description && row.assigned_to);

        if (!items.length) {
          UI.toast && UI.toast('Please add at least one valid row with Description + Assignee.', 'warn');
          return;
        }

        const out = await CloudTasks.createDistribution({ title, items });
        if (!out.ok) {
          UI.toast && UI.toast(`Failed to create distribution: ${out.message}`, 'warn');
          return;
        }

        state.gridRows = [];
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

    state.assignedGroups = assignedOut.ok && Array.isArray(assignedOut.data.groups) ? assignedOut.data.groups : [];
    state.distributions = distributionsOut.ok ? (distributionsOut.data.rows || []) : [];
    state.members = membersOut.ok ? (membersOut.data.rows || []) : [];

    if (!state.expandedGroupId && state.assignedGroups[0]) {
      state.expandedGroupId = String(state.assignedGroups[0].distribution_id || '');
    }

    if (!state.selectedDistributionId && state.distributions[0]) {
      state.selectedDistributionId = String(state.distributions[0].id || '');
    }
    if (reloadSelectedItems !== false) await refreshDistributionItems(state.selectedDistributionId);

    render();
  }

  const qs = new URLSearchParams(location.search);
  const sharedDistribution = String(qs.get('distribution') || '').trim();
  if (sharedDistribution) state.selectedDistributionId = sharedDistribution;

  loadData(true).catch((err) => {
    root.innerHTML = `<div class="card pad">Failed to load task orchestration data. ${esc(err && err.message ? err.message : err)}</div>`;
  });
});
