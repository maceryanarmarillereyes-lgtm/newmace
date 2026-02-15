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
    gridRows: [],
    uploadMeta: { fileName: '', sheetCount: 0, rowCount: 0 },
    parserReady: false,
    parserError: ''
  };

  const MATCH_THRESHOLD = 0.72;
  const STRONG_MATCH_THRESHOLD = 0.95;

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

  function hasUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  function looksLikeDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw) || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(raw)) return true;
    const d = new Date(raw);
    return !Number.isNaN(d.getTime());
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

    if (row.assigned_name && !row.assigned_to) applyNameMatch(row, row.assigned_name);
    return row;
  }

  function applyNameMatch(row, assignedName) {
    const picked = findMemberMatch(assignedName);
    row.assigned_name = String(assignedName || '').trim();
    if (!picked || picked.score < MATCH_THRESHOLD) {
      row.assigned_to = '';
      row.match_score = picked ? picked.score : 0;
      row.match_state = 'none';
      return;
    }
    row.assigned_to = String(picked.member.user_id || '');
    row.match_score = picked.score;
    row.match_state = picked.score >= STRONG_MATCH_THRESHOLD ? 'high' : 'good';
  }

  function memberOptions(selectedUid) {
    return state.members.map((m) => {
      const label = safe(m.name || m.username, m.user_id);
      const selected = String(selectedUid || '') === String(m.user_id || '') ? 'selected' : '';
      return `<option value="${esc(m.user_id || '')}" ${selected}>${esc(label)}</option>`;
    }).join('');
  }

  function unresolvedRowsCount() {
    return state.gridRows.filter((row) => row.description && !row.assigned_to).length;
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
        <div class="card pad" style="margin-bottom:12px;border:1px solid rgba(255,255,255,.12)">
          <button class="btn" data-group-toggle="${esc(id)}" type="button" style="width:100%;text-align:left;padding:12px">
            <div class="row" style="justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <div>
                <div style="font-weight:800;font-size:15px">${esc(safe(group.project_title, 'Untitled Distribution'))}</div>
                <div class="small muted">Assigned by: ${esc(safe(group.assigner_name, 'N/A'))} | Date: ${esc(fmtDate(group.assigned_at || group.created_at || group.updated_at))}</div>
              </div>
              <div style="text-align:right;min-width:140px">
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
                      <td>${hasUrl(item.reference_url) ? `<a href="${esc(item.reference_url)}" target="_blank" rel="noopener" title="Open work instruction">📎</a>` : '<span class="muted">—</span>'}</td>
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

  function renderDistributionGridRows() {
    if (!state.gridRows.length) return '<tr><td colspan="8" class="small muted">Upload a file to preview parsed rows.</td></tr>';
    return state.gridRows.map((row, idx) => `
      <tr data-grid-row="${idx}" style="background:${row.assigned_to ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)'}">
        <td><input data-grid-input="${idx}" data-col="case_number" value="${esc(row.case_number)}" placeholder="Case #" style="width:100%" /></td>
        <td><input data-grid-input="${idx}" data-col="site" value="${esc(row.site)}" placeholder="Site" style="width:100%" /></td>
        <td><input data-grid-input="${idx}" data-col="description" value="${esc(row.description)}" placeholder="Description" style="width:100%" /></td>
        <td style="background:${row.assigned_to ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.18)'}">
          <input data-grid-input="${idx}" data-col="assigned_name" value="${esc(row.assigned_name)}" placeholder="Assignee" style="width:100%;margin-bottom:4px" />
          <select data-grid-assignee="${idx}" style="width:100%"><option value="">Select Assignee</option>${memberOptions(row.assigned_to)}</select>
        </td>
        <td><input data-grid-input="${idx}" data-col="deadline" value="${esc(row.deadline)}" placeholder="YYYY-MM-DDTHH:mm" style="width:100%" /></td>
        <td><input data-grid-input="${idx}" data-col="reference_url" value="${esc(row.reference_url)}" placeholder="https://..." style="width:100%" /></td>
        <td>${row.assigned_to ? '<span style="color:#22c55e;font-weight:700">GREEN • Matched</span>' : '<span style="color:#ef4444;font-weight:700">RED • Resolve</span>'}</td>
        <td><button class="btn" data-grid-remove="${idx}" type="button">Remove</button></td>
      </tr>
    `).join('');
  }

  function render() {
    const unresolved = unresolvedRowsCount();
    root.innerHTML = `
      <h2 style="margin:0 0 10px">My Task</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn ${state.tab === 'incoming' ? 'primary' : ''}" id="tabIncoming" type="button">My Assigned Tasks</button>
        <button class="btn ${state.tab === 'outgoing' ? 'primary' : ''}" id="tabOutgoing" type="button">Task Distributions</button>
      </div>

      <div id="incomingView" style="display:${state.tab === 'incoming' ? 'block' : 'none'};margin-top:12px">${renderIncomingGroups()}</div>

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
        <div class="panel" style="max-width:1260px">
          <div class="head"><div class="announce-title">Create New Distribution</div><button class="btn ghost" data-close-task-modal="1" type="button">✕</button></div>
          <div class="body">
            <label class="small muted">Project Title</label>
            <input id="distributionTitleInput" placeholder="Billing Help" style="width:100%;margin-bottom:10px" />

            <div id="uploadZone" style="border:2px dashed rgba(255,255,255,.2);border-radius:12px;padding:24px;text-align:center;background:rgba(255,255,255,.02)">
              <div style="font-weight:700;margin-bottom:6px">Upload .xlsx or .csv</div>
              <div class="small muted" style="margin-bottom:8px">Drag-and-drop file here, or choose file manually. Assignee and links are auto-detected from content.</div>
              <input type="file" id="distributionFileInput" accept=".xlsx,.xls,.csv" />
              <div class="small muted" id="uploadMeta" style="margin-top:8px">${esc(state.uploadMeta.fileName ? `${state.uploadMeta.fileName} • ${state.uploadMeta.sheetCount} sheet(s) • ${state.uploadMeta.rowCount} row(s)` : 'No file parsed yet.')}</div>
              ${state.parserError ? `<div class="small" style="color:#ef4444;margin-top:8px">${esc(state.parserError)}</div>` : ''}
            </div>

            <div class="row" style="justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 6px">
              <div class="small muted">Validation Preview (GREEN matched / RED unresolved)</div>
              <button class="btn" id="addGridRowBtn" type="button">+ Add Row</button>
            </div>
            <table class="table" id="distributionGrid">
              <thead><tr><th>Case #</th><th>Site</th><th>Description</th><th>Assigned To</th><th>Deadline</th><th>Link/WI</th><th>Match</th><th></th></tr></thead>
              <tbody id="distributionGridBody">${renderDistributionGridRows()}</tbody>
            </table>
            ${unresolved > 0 ? `<div class="small" style="color:#ef4444;margin-top:6px">Resolve ${esc(unresolved)} unmatched assignee row(s) before submitting.</div>` : ''}
          </div>
          <div class="foot">
            <button class="btn" data-close-task-modal="1" type="button">Cancel</button>
            <button class="btn primary" id="submitDistributionBtn" type="button" ${unresolved > 0 ? 'disabled' : ''}>Submit Distribution</button>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function keepModalOpenAfterRender() {
    const modal = root.querySelector('#taskDistributionModal');
    if (modal) modal.style.display = 'flex';
  }

  function openModal() {
    render();
    keepModalOpenAfterRender();
  }

  function closeModal() {
    const modal = root.querySelector('#taskDistributionModal');
    if (modal) modal.style.display = 'none';
  }

  function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  async function ensureSheetJs() {
    if (window.XLSX) {
      state.parserReady = true;
      state.parserError = '';
      return true;
    }

    return new Promise((resolve) => {
      const existing = document.querySelector('script[data-sheetjs="1"]');
      if (existing) {
        existing.addEventListener('load', () => {
          state.parserReady = Boolean(window.XLSX);
          state.parserError = state.parserReady ? '' : 'SheetJS failed to load. CSV upload is still supported.';
          resolve(state.parserReady);
        }, { once: true });
        existing.addEventListener('error', () => {
          state.parserReady = false;
          state.parserError = 'SheetJS failed to load. CSV upload is still supported.';
          resolve(false);
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.setAttribute('data-sheetjs', '1');
      script.onload = () => {
        state.parserReady = Boolean(window.XLSX);
        state.parserError = state.parserReady ? '' : 'SheetJS loaded unexpectedly without XLSX global. CSV upload is still supported.';
        resolve(state.parserReady);
      };
      script.onerror = () => {
        state.parserReady = false;
        state.parserError = 'Could not load SheetJS in this environment. Upload CSV or refresh and retry .xlsx.';
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  function matrixFromWorkbook(workbook) {
    const rows = [];
    (workbook.SheetNames || []).forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      matrix.forEach((r) => rows.push(Array.isArray(r) ? r : []));
    });
    return rows;
  }

  function detectColumnRoles(matrix) {
    const maxCols = matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const roleByIndex = {};
    const info = [];

    for (let col = 0; col < maxCols; col += 1) {
      const samples = [];
      for (let row = 0; row < Math.min(matrix.length, 10); row += 1) {
        const value = matrix[row] && typeof matrix[row][col] !== 'undefined' ? String(matrix[row][col]).trim() : '';
        if (value) samples.push(value);
      }

      const total = samples.length || 1;
      let memberMatches = 0;
      let urlMatches = 0;
      let dateLike = 0;

      samples.forEach((value) => {
        const candidate = findMemberMatch(value);
        if (candidate && candidate.score >= MATCH_THRESHOLD) memberMatches += 1;
        if (hasUrl(value)) urlMatches += 1;
        if (looksLikeDate(value)) dateLike += 1;
      });

      info.push({
        col,
        assigneeRatio: memberMatches / total,
        urlRatio: urlMatches / total,
        dateRatio: dateLike / total
      });
    }

    const assigneeBest = info.slice().sort((a, b) => b.assigneeRatio - a.assigneeRatio)[0];
    if (assigneeBest && assigneeBest.assigneeRatio > 0.3) roleByIndex[assigneeBest.col] = 'assigned_name';

    const linkBest = info
      .filter((i) => roleByIndex[i.col] !== 'assigned_name')
      .sort((a, b) => b.urlRatio - a.urlRatio)[0];
    if (linkBest && linkBest.urlRatio > 0.3) roleByIndex[linkBest.col] = 'reference_url';

    const deadlineBest = info
      .filter((i) => !roleByIndex[i.col])
      .sort((a, b) => b.dateRatio - a.dateRatio)[0];
    if (deadlineBest && deadlineBest.dateRatio > 0.4) roleByIndex[deadlineBest.col] = 'deadline';

    return roleByIndex;
  }

  function rowsFromMatrix(matrix) {
    const roleByIndex = detectColumnRoles(matrix);
    const parsed = [];

    matrix.forEach((cells) => {
      if (!Array.isArray(cells)) return;
      if (!cells.some((v) => String(v || '').trim())) return;

      const row = createGridRow({});
      const descParts = [];

      cells.forEach((cell, colIdx) => {
        const value = String(cell || '').trim();
        if (!value) return;
        const role = roleByIndex[colIdx] || 'description';

        if (role === 'assigned_name') {
          applyNameMatch(row, value);
        } else if (role === 'reference_url') {
          if (hasUrl(value)) row.reference_url = value;
          else descParts.push(value);
        } else if (role === 'deadline') {
          row.deadline = normalizeDeadlineInput(value);
        } else {
          descParts.push(value);
        }
      });

      if (!row.reference_url) {
        const fromDesc = descParts.find((part) => hasUrl(part));
        if (fromDesc) row.reference_url = fromDesc;
      }

      row.description = descParts.join(' | ').slice(0, 1000);
      if (!row.description && row.assigned_name) row.description = `Task assigned to ${row.assigned_name}`;
      if (row.description || row.assigned_name || row.reference_url) parsed.push(row);
    });

    return parsed;
  }

  async function parseFileToRows(file) {
    const ext = (String(file && file.name || '').split('.').pop() || '').toLowerCase();

    if (ext === 'csv') {
      const text = await readFileAsText(file);
      const matrix = text.replace(/\r/g, '').split('\n').filter(Boolean).map((line) => parseCsvLine(line));
      return { rows: rowsFromMatrix(matrix), sheetCount: 1 };
    }

    const ready = await ensureSheetJs();
    if (!ready || !window.XLSX) throw new Error(state.parserError || 'SheetJS is unavailable for .xlsx parsing.');

    const buffer = await readFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const matrix = matrixFromWorkbook(workbook);
    return { rows: rowsFromMatrix(matrix), sheetCount: (workbook.SheetNames || []).length || 1 };
  }

  async function refreshDistributionItems(distributionId) {
    if (!distributionId) {
      state.distributionItems = [];
      return;
    }
    const out = await CloudTasks.distributionItems(distributionId);
    state.distributionItems = out.ok && Array.isArray(out.data.rows) ? out.data.rows : [];
  }

  async function handleFileUpload(file) {
    if (!file) return;
    try {
      state.parserError = '';
      const parsed = await parseFileToRows(file);
      state.gridRows = parsed.rows;
      state.uploadMeta = {
        fileName: String(file.name || ''),
        rowCount: state.gridRows.length,
        sheetCount: parsed.sheetCount || 1
      };
      if (!state.gridRows.length) {
        UI.toast && UI.toast('No task rows detected from file. Please verify content.', 'warn');
      }
      render();
      keepModalOpenAfterRender();
    } catch (err) {
      state.parserError = String(err && err.message ? err.message : err || 'File parse failed.');
      render();
      keepModalOpenAfterRender();
      UI.toast && UI.toast(state.parserError, 'warn');
    }
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
          UI.toast && UI.toast(`Failed to update status: ${out.message}`, 'warn');
          return;
        }
        UI.toast && UI.toast('Task status updated.');
        await loadData(true);
      };
    });

    (root.querySelectorAll('[data-group-toggle]') || []).forEach((btn) => {
      btn.onclick = () => {
        const id = String(btn.getAttribute('data-group-toggle') || '');
        state.expandedGroupId = state.expandedGroupId === id ? '' : id;
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
        const id = String(btn.getAttribute('data-share-link') || '');
        const shareUrl = `${location.origin}${location.pathname}?page=my_task&distribution=${encodeURIComponent(id)}`;
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
        keepModalOpenAfterRender();
      };
    }

    const uploadZone = root.querySelector('#uploadZone');
    const fileInput = root.querySelector('#distributionFileInput');
    if (fileInput) {
      fileInput.onchange = async (event) => {
        const file = event.target && event.target.files ? event.target.files[0] : null;
        await handleFileUpload(file);
      };
    }

    if (uploadZone) {
      uploadZone.ondragover = (event) => {
        event.preventDefault();
        uploadZone.style.borderColor = 'rgba(34,197,94,.7)';
      };
      uploadZone.ondragleave = () => {
        uploadZone.style.borderColor = 'rgba(255,255,255,.2)';
      };
      uploadZone.ondrop = async (event) => {
        event.preventDefault();
        uploadZone.style.borderColor = 'rgba(255,255,255,.2)';
        const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
        await handleFileUpload(file);
      };
    }

    const gridBody = root.querySelector('#distributionGridBody');
    if (gridBody) {
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
        keepModalOpenAfterRender();
      };

      (root.querySelectorAll('[data-grid-remove]') || []).forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-grid-remove'));
          if (!Number.isFinite(idx)) return;
          state.gridRows.splice(idx, 1);
          render();
          keepModalOpenAfterRender();
        };
      });
    }

    const submitBtn = root.querySelector('#submitDistributionBtn');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const titleEl = root.querySelector('#distributionTitleInput');
        const title = titleEl ? String(titleEl.value || '').trim() : '';

        const unresolved = unresolvedRowsCount();
        if (unresolved > 0) {
          UI.toast && UI.toast('Resolve all red assignee rows before submit.', 'warn');
          return;
        }

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
          UI.toast && UI.toast('Please upload or add valid rows with Description + Assignee.', 'warn');
          return;
        }

        const out = await CloudTasks.createDistribution({ title, items });
        if (!out.ok) {
          UI.toast && UI.toast(`Failed to create distribution: ${out.message}`, 'warn');
          return;
        }

        state.gridRows = [];
        state.uploadMeta = { fileName: '', sheetCount: 0, rowCount: 0 };
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
