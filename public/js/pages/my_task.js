(window.Pages = window.Pages || {}, window.Pages.my_task = function myTaskPage(root) {
  const esc = (v) => (window.UI && UI.esc ? UI.esc(v) : String(v == null ? '' : v));
  const safeText = (v, fallback = 'N/A') => {
    const out = String(v == null ? '' : v).trim();
    return out || fallback;
  };

  const state = {
    tab: 'viewer',
    assignedGroups: [],
    expandedViewerId: '',
    distributions: [],
    selectedDistributionId: '',
    selectedDistributionItems: [],
    members: [],
    loading: false,
    creating: false,
    deletingDistributionId: '',
    dragActive: false,
    parseError: '',
    uploadMeta: { name: '', rows: 0, sheets: 0 },
    parsedRows: [],
    assigneeColumnLocked: false,
    assigneeColumnIndex: -1,
    linkColumnIndex: -1,
    isSheetJsReady: false
  };

  const badgeClass = {
    PENDING: 'task-status-pill status-pending',
    IN_PROGRESS: 'task-status-pill status-pending',
    DONE: 'task-status-pill status-done'
  };

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function safeDate(value) {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function percent(done, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }

  function statusNorm(value) {
    const s = String(value || 'PENDING').toUpperCase();
    if (s === 'DONE' || s === 'IN_PROGRESS') return s;
    return 'PENDING';
  }

  function descriptionFromRow(headers, row, skipIndexes) {
    const ignored = new Set(skipIndexes || []);
    return headers
      .map((header, idx) => {
        if (ignored.has(idx)) return '';
        const v = String(row[idx] == null ? '' : row[idx]).trim();
        if (!v) return '';
        return `${safeText(header, `Column ${idx + 1}`)}: ${v}`;
      })
      .filter(Boolean)
      .join(' | ');
  }

  function guessMember(rawValue) {
    const input = normalizeName(rawValue);
    if (!input) return null;

    let winner = null;
    state.members.forEach((m) => {
      const label = normalizeName(m.name || m.username || m.user_id);
      if (!label) return;
      let score = 0;
      if (label === input) score = 1;
      else if (label.includes(input) || input.includes(label)) score = 0.86;
      else {
        const a = input.split(' ').filter(Boolean);
        const b = label.split(' ').filter(Boolean);
        const overlap = a.filter((token) => b.includes(token)).length;
        score = overlap / Math.max(a.length || 1, b.length || 1);
      }
      if (!winner || score > winner.score) winner = { member: m, score };
    });

    return winner;
  }

  function ensureStyleTag() {
    if (document.getElementById('my-task-enterprise-style')) return;
    const style = document.createElement('style');
    style.id = 'my-task-enterprise-style';
    style.textContent = `
      .task-shell{position:relative;display:flex;flex-direction:column;gap:12px}
      .task-toolbar{display:flex;gap:8px;flex-wrap:wrap}
      .task-muted{font-size:13px;color:#9ca3af}
      .task-empty{padding:36px 16px;text-align:center;color:#9ca3af;border:1px dashed rgba(255,255,255,.2);border-radius:8px}
      .task-card{background:rgba(15,23,42,.65);border-radius:8px;padding:16px;box-shadow:0 2px 4px rgba(0,0,0,.05);border:1px solid rgba(148,163,184,.12);transition:all .16s ease}
      .task-card:hover{background:rgba(30,41,59,.72);transform:translateY(-1px)}
      .task-card-title{font-size:16px;font-weight:800;line-height:1.3}
      .task-meta{font-size:12px;color:#9ca3af;margin-top:4px}
      .task-progress-rail{height:8px;background:rgba(148,163,184,.2);border-radius:999px;overflow:hidden}
      .task-progress-fill{height:100%;background:linear-gradient(90deg,#10b981,#06b6d4)}
      .task-status-pill{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:700}
      .status-pending{background:#fef3c7;color:#92400e}
      .status-done{background:#10b981;color:white}
      .task-grid-wrap{max-height:0;overflow:hidden;opacity:0;transition:max-height .24s ease, opacity .2s ease;margin-top:0}
      .task-grid-wrap.open{max-height:520px;opacity:1;margin-top:12px}
      .task-grid table{width:100%;border-collapse:collapse}
      .task-grid th,.task-grid td{padding:10px;border-bottom:1px solid rgba(148,163,184,.16);font-size:13px;text-align:left;vertical-align:top}
      .task-grid tbody tr:hover{background:rgba(148,163,184,.08)}
      .upload-zone{border:2px dashed rgba(148,163,184,.4);border-radius:8px;padding:26px;text-align:center;transition:all .2s ease}
      .upload-zone.drag{border-color:#22d3ee;background:rgba(34,211,238,.08)}
      .task-invalid{background:rgba(239,68,68,.16)!important}
      .task-overlay{position:absolute;inset:0;background:rgba(2,6,23,.56);display:flex;align-items:center;justify-content:center;z-index:40;border-radius:8px}
      .task-spinner{width:32px;height:32px;border-radius:999px;border:4px solid rgba(255,255,255,.25);border-top-color:#22d3ee;animation:taskSpin 1s linear infinite}
      .task-trash{border:none;background:transparent;color:#ef4444;cursor:pointer;font-size:16px;opacity:.9}
      .task-trash:hover{opacity:1;transform:scale(1.06)}
      @keyframes taskSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function unresolvedRowsCount() {
    return state.parsedRows.filter((row) => !row.assigned_to).length;
  }

  function renderViewerCards() {
    if (!state.assignedGroups.length) {
      return '<div class="task-empty">No active distributions found</div>';
    }

    return state.assignedGroups.map((group) => {
      const id = String(group.distribution_id || '');
      const total = Number(group.total_count || 0);
      const pending = Number(group.pending_count || 0);
      const done = Math.max(0, total - pending);
      const isOpen = state.expandedViewerId === id;

      return `
        <article class="task-card">
          <button class="btn" type="button" data-toggle-viewer="${esc(id)}" style="width:100%;text-align:left;padding:0;background:transparent;border:none">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
              <div>
                <div class="task-card-title">${esc(safeText(group.project_title, 'Untitled Distribution'))}</div>
                <div class="task-meta">Assigned by ${esc(safeText(group.assigner_name))} • ${esc(safeDate(group.assigned_at || group.created_at))}</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="task-status-pill ${pending > 0 ? 'status-pending' : 'status-done'}">${pending > 0 ? `${esc(pending)} Pending` : 'Done'}</span>
              </div>
            </div>
            <div class="task-progress-rail" style="margin-top:10px"><div class="task-progress-fill" style="width:${percent(done, total)}%"></div></div>
            <div class="task-meta" style="margin-top:6px">${esc(done)} / ${esc(total)} complete</div>
          </button>
          <div class="task-grid-wrap ${isOpen ? 'open' : ''}">
            <div class="task-grid" style="overflow:auto">
              <table>
                <thead>
                  <tr><th>Case #</th><th>Site</th><th>Description</th><th>Deadline</th><th>Reference</th><th>Status</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  ${(group.items || []).map((item) => `
                    <tr>
                      <td>${esc(safeText(item.case_number || item.case_no, 'N/A'))}</td>
                      <td>${esc(safeText(item.site, 'N/A'))}</td>
                      <td>${esc(safeText(item.description, 'N/A'))}</td>
                      <td>${esc(safeDate(item.deadline || item.deadline_at || item.due_at))}</td>
                      <td>${/^https?:\/\//i.test(String(item.reference_url || '')) ? `<a href="${esc(item.reference_url)}" target="_blank" rel="noopener">Open</a>` : '<span class="task-muted">N/A</span>'}</td>
                      <td>
                        <select data-item-status="${esc(item.id)}" style="min-width:120px">
                          <option value="PENDING" ${statusNorm(item.status) === 'PENDING' ? 'selected' : ''}>PENDING</option>
                          <option value="IN_PROGRESS" ${statusNorm(item.status) === 'IN_PROGRESS' ? 'selected' : ''}>IN PROGRESS</option>
                          <option value="DONE" ${statusNorm(item.status) === 'DONE' ? 'selected' : ''}>DONE</option>
                        </select>
                      </td>
                      <td><input data-item-remarks="${esc(item.id)}" value="${esc(item.remarks || '')}" placeholder="Add remarks" style="width:100%" /></td>
                    </tr>
                  `).join('') || '<tr><td colspan="7" class="task-muted">No task items</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderCreatorRows() {
    if (!state.parsedRows.length) {
      return '<tr><td colspan="7" class="task-muted">Upload a file to preview parsed tasks.</td></tr>';
    }

    return state.parsedRows.map((row, idx) => {
      const invalid = !row.assigned_to;
      return `
        <tr>
          <td>${esc(safeText(row.case_number || 'N/A'))}</td>
          <td>${esc(safeText(row.site || 'N/A'))}</td>
          <td>${esc(safeText(row.description || 'N/A'))}</td>
          <td class="${invalid ? 'task-invalid' : ''}">
            <div style="font-weight:600">${esc(safeText(row.assigned_name || 'Unknown Member'))}</div>
            <select data-assignee-fix="${idx}" style="width:100%;margin-top:4px">
              <option value="">Resolve member</option>
              ${state.members.map((member) => {
                const id = String(member.user_id || '');
                const label = safeText(member.name || member.username || member.user_id);
                return `<option value="${esc(id)}" ${String(row.assigned_to) === id ? 'selected' : ''}>${esc(label)}</option>`;
              }).join('')}
            </select>
          </td>
          <td>${row.reference_url ? `<a href="${esc(row.reference_url)}" target="_blank" rel="noopener">${esc(row.reference_url)}</a>` : '<span class="task-muted">N/A</span>'}</td>
          <td>${esc(safeText(row.deadline || 'N/A'))}</td>
          <td>${invalid ? '<span class="task-status-pill status-pending">Needs Fix</span>' : '<span class="task-status-pill status-done">Ready</span>'}</td>
        </tr>
      `;
    }).join('');
  }

  function renderDistributions() {
    if (!state.distributions.length) {
      return '<div class="task-empty">No active distributions found</div>';
    }

    return state.distributions.map((dist) => {
      const id = String(dist.id || '');
      const isOpen = state.selectedDistributionId === id;
      const total = Number(dist.total_count || dist.total_items || 0);
      const pending = Number(dist.pending_count || dist.pending_items || 0);
      const done = Math.max(0, total - pending);

      return `
        <article class="task-card">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
            <button class="btn" type="button" data-open-distribution="${esc(id)}">${esc(safeText(dist.title, 'Untitled Distribution'))}</button>
            <button class="task-trash" title="Delete distribution" data-delete-distribution="${esc(id)}" ${state.deletingDistributionId === id ? 'disabled' : ''}>🗑</button>
          </div>
          <div class="task-meta">${esc(done)} / ${esc(total)} complete</div>
          <div class="task-progress-rail" style="margin-top:8px"><div class="task-progress-fill" style="width:${percent(done, total)}%"></div></div>
          <div class="task-grid-wrap ${isOpen ? 'open' : ''}">
            <div class="task-grid" style="overflow:auto">
              <table>
                <thead><tr><th>Case #</th><th>Site</th><th>Description</th><th>Assignee</th><th>Status</th></tr></thead>
                <tbody>
                  ${(isOpen ? state.selectedDistributionItems : []).map((item) => {
                    const status = statusNorm(item.status);
                    return `<tr>
                      <td>${esc(safeText(item.case_number, 'N/A'))}</td>
                      <td>${esc(safeText(item.site, 'N/A'))}</td>
                      <td>${esc(safeText(item.description, 'N/A'))}</td>
                      <td>${esc(safeText(item.assigned_to || item.assignee_user_id, 'N/A'))}</td>
                      <td><span class="${badgeClass[status] || badgeClass.PENDING}">${esc(status)}</span></td>
                    </tr>`;
                  }).join('') || '<tr><td colspan="5" class="task-muted">No rows</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function render() {
    ensureStyleTag();
    const unresolved = unresolvedRowsCount();

    root.innerHTML = `
      <section class="task-shell">
        ${state.loading || state.creating ? '<div class="task-overlay"><div class="task-spinner" aria-label="Loading"></div></div>' : ''}
        <h2 style="margin:0">Task Orchestration</h2>
        <div class="task-toolbar">
          <button type="button" class="btn ${state.tab === 'viewer' ? 'primary' : ''}" id="tabViewer">My Assigned Tasks</button>
          <button type="button" class="btn ${state.tab === 'creator' ? 'primary' : ''}" id="tabCreator">Create & Manage Distribution</button>
        </div>

        <section style="display:${state.tab === 'viewer' ? 'block' : 'none'}">
          ${renderViewerCards()}
        </section>

        <section style="display:${state.tab === 'creator' ? 'block' : 'none'};display:flex;flex-direction:column;gap:12px">
          <article class="task-card">
            <div class="task-card-title">Universal Excel Adapter</div>
            <div class="task-meta">Drop any .xlsx/.xls/.csv file. Assignees and links are auto-detected, remaining columns are concatenated into task description.</div>
            <div id="uploadZone" class="upload-zone ${state.dragActive ? 'drag' : ''}" style="margin-top:12px">
              <div style="font-weight:700;font-size:16px">Drag & Drop File Here</div>
              <div class="task-muted" style="margin:8px 0">or select manually</div>
              <input type="file" id="taskFileInput" accept=".xlsx,.xls,.csv" />
              <div class="task-meta" style="margin-top:8px">${esc(state.uploadMeta.name ? `${state.uploadMeta.name} • ${state.uploadMeta.rows} rows • ${state.uploadMeta.sheets} sheet(s)` : 'No file selected')}</div>
              ${state.assigneeColumnLocked ? '<div class="task-meta" style="color:#22c55e">Assignee column auto-locked (>=30% member match)</div>' : ''}
              ${state.parseError ? `<div style="color:#ef4444;margin-top:8px;font-size:13px">${esc(state.parseError)}</div>` : ''}
            </div>
          </article>

          <article class="task-card">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
              <div>
                <div class="task-card-title">Validation Preview</div>
                <div class="task-meta">Red rows require assignee mapping before submission.</div>
              </div>
              <button id="submitDistribution" class="btn primary" type="button" ${state.creating || unresolved > 0 || !state.parsedRows.length ? 'disabled' : ''}>${state.creating ? 'Submitting...' : 'Submit Distribution'}</button>
            </div>
            <div style="margin-top:10px;overflow:auto" class="task-grid">
              <table>
                <thead><tr><th>Case #</th><th>Site</th><th>Description</th><th>Assignee</th><th>Reference URL</th><th>Deadline</th><th>State</th></tr></thead>
                <tbody>${renderCreatorRows()}</tbody>
              </table>
            </div>
            ${unresolved > 0 ? `<div style="color:#f59e0b;margin-top:8px;font-size:13px">Resolve ${esc(unresolved)} unknown member(s) to enable submit.</div>` : ''}
          </article>

          <article class="task-card">
            <div class="task-card-title">Distribution Batches</div>
            <div class="task-meta">Clean up old or ghost records with the trash icon.</div>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px">${renderDistributions()}</div>
          </article>
        </section>
      </section>
    `;

    bindEvents();
  }

  async function ensureSheetJs() {
    if (window.XLSX) {
      state.isSheetJsReady = true;
      return true;
    }
    if (state.isSheetJsReady) return true;

    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });

    state.isSheetJsReady = Boolean(window.XLSX);
    return state.isSheetJsReady;
  }

  function parseCsvLine(line) {
    const cells = [];
    let buf = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          buf += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(buf.trim());
        buf = '';
      } else {
        buf += ch;
      }
    }
    cells.push(buf.trim());
    return cells;
  }

  async function fileToMatrix(file) {
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const text = await file.text();
      const matrix = text
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parseCsvLine(line));
      return { matrix, sheets: 1 };
    }

    const ready = await ensureSheetJs();
    if (!ready || !window.XLSX) throw new Error('SheetJS failed to load. Use CSV or retry.');

    const buf = await file.arrayBuffer();
    const workbook = window.XLSX.read(buf, { type: 'array' });
    const matrix = [];
    (workbook.SheetNames || []).forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      rows.forEach((r) => matrix.push(Array.isArray(r) ? r : []));
    });
    return { matrix, sheets: (workbook.SheetNames || []).length || 1 };
  }

  function splitMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const headerIndex = rows.findIndex((row) => (Array.isArray(row) ? row : []).some((cell) => String(cell || '').trim()));
    if (headerIndex < 0) return { headers: [], rows: [] };
    const headerRow = Array.isArray(rows[headerIndex]) ? rows[headerIndex] : [];
    const headers = headerRow.map((h, idx) => safeText(String(h || '').trim(), `Column ${idx + 1}`));
    const dataRows = rows.slice(headerIndex + 1).filter((row) => (Array.isArray(row) ? row : []).some((cell) => String(cell || '').trim()));
    return { headers, rows: dataRows };
  }

  function detectColumns(headers, dataRows) {
    const sampleRows = dataRows.slice(0, 250);
    let bestAssignee = { idx: -1, ratio: 0 };
    let linkIdx = -1;

    headers.forEach((header, idx) => {
      const headerNorm = normalizeName(header);
      let assigneeHits = 0;
      let nonEmpty = 0;
      let linkHits = 0;

      sampleRows.forEach((row) => {
        const value = String((Array.isArray(row) ? row[idx] : '') || '').trim();
        if (!value) return;
        nonEmpty += 1;
        const match = guessMember(value);
        if (match && match.score >= 0.72) assigneeHits += 1;
        if (/^https?:\/\//i.test(value)) linkHits += 1;
      });

      const ratio = nonEmpty ? assigneeHits / nonEmpty : 0;
      const linkRatio = nonEmpty ? linkHits / nonEmpty : 0;
      const explicitAssigneeHeader = /assignee|owner|agent|assigned/.test(headerNorm);
      const explicitLinkHeader = /url|link|reference|wi/.test(headerNorm);

      if (ratio > bestAssignee.ratio || (explicitAssigneeHeader && ratio >= bestAssignee.ratio)) {
        bestAssignee = { idx, ratio };
      }
      if (linkRatio >= 0.2 || explicitLinkHeader) {
        if (linkIdx < 0 || linkRatio > 0.2) linkIdx = idx;
      }
    });

    return {
      assigneeColumnIndex: bestAssignee.idx,
      assigneeColumnLocked: bestAssignee.ratio > 0.3,
      linkColumnIndex: linkIdx
    };
  }

  function inferCaseAndSite(headers, row) {
    const result = { caseNumber: '', site: '', deadline: '' };
    headers.forEach((header, idx) => {
      const value = String((Array.isArray(row) ? row[idx] : '') || '').trim();
      if (!value) return;
      const h = normalizeName(header);
      if (!result.caseNumber && /case|ticket|reference|incident|id/.test(h)) result.caseNumber = value;
      if (!result.site && /site|location|branch|store|facility/.test(h)) result.site = value;
      if (!result.deadline && /deadline|due|eta|target|date/.test(h)) result.deadline = value;
    });
    return result;
  }

  function buildParsedRows(headers, dataRows, detection) {
    const output = [];
    dataRows.forEach((row) => {
      const values = Array.isArray(row) ? row : [];
      const assigneeName = detection.assigneeColumnIndex >= 0 ? String(values[detection.assigneeColumnIndex] || '').trim() : '';
      const link = detection.linkColumnIndex >= 0 ? String(values[detection.linkColumnIndex] || '').trim() : '';
      const match = guessMember(assigneeName);
      const misc = inferCaseAndSite(headers, values);
      const description = descriptionFromRow(headers, values, [detection.assigneeColumnIndex, detection.linkColumnIndex]);

      if (!description && !assigneeName && !link && !misc.caseNumber && !misc.site) return;

      output.push({
        case_number: misc.caseNumber,
        site: misc.site,
        description: description || 'N/A',
        assigned_name: assigneeName,
        assigned_to: match && match.score >= 0.72 ? String(match.member.user_id || '') : '',
        reference_url: /^https?:\/\//i.test(link) ? link : '',
        deadline: misc.deadline || ''
      });
    });

    return output;
  }

  async function handleFile(file) {
    if (!file) return;
    state.creating = true;
    state.parseError = '';
    render();

    try {
      const parsed = await fileToMatrix(file);
      const split = splitMatrix(parsed.matrix);
      const detection = detectColumns(split.headers, split.rows);
      const rows = buildParsedRows(split.headers, split.rows, detection);

      state.uploadMeta = { name: String(file.name || ''), rows: rows.length, sheets: parsed.sheets };
      state.assigneeColumnLocked = detection.assigneeColumnLocked;
      state.assigneeColumnIndex = detection.assigneeColumnIndex;
      state.linkColumnIndex = detection.linkColumnIndex;
      state.parsedRows = rows;
    } catch (err) {
      state.parseError = String(err && err.message ? err.message : err);
      state.parsedRows = [];
    } finally {
      state.creating = false;
      render();
    }
  }

  async function loadBaseData() {
    state.loading = true;
    render();

    const [assignedRes, distRes, membersRes] = await Promise.all([
      CloudTasks.assigned(),
      CloudTasks.distributions(),
      CloudTasks.members()
    ]);

    state.assignedGroups = assignedRes.ok && Array.isArray(assignedRes.data.groups) ? assignedRes.data.groups : [];
    state.distributions = distRes.ok && Array.isArray(distRes.data.rows) ? distRes.data.rows : [];
    state.members = membersRes.ok && Array.isArray(membersRes.data.rows) ? membersRes.data.rows : [];

    state.loading = false;
    render();
  }

  async function refreshDistributionItems(distributionId) {
    const out = await CloudTasks.distributionItems(distributionId);
    state.selectedDistributionItems = out.ok && Array.isArray(out.data.rows) ? out.data.rows : [];
  }

  function updateAssignedItemLocal(itemId, patch) {
    state.assignedGroups.forEach((group) => {
      group.items = (group.items || []).map((item) => {
        if (String(item.id) !== String(itemId)) return item;
        return Object.assign({}, item, patch);
      });
      const doneCount = (group.items || []).filter((item) => statusNorm(item.status) === 'DONE').length;
      group.done_count = doneCount;
      group.total_count = (group.items || []).length;
      group.pending_count = Math.max(0, group.total_count - doneCount);
    });
  }

  function bindEvents() {
    const tabViewer = root.querySelector('#tabViewer');
    const tabCreator = root.querySelector('#tabCreator');
    if (tabViewer) tabViewer.onclick = () => { state.tab = 'viewer'; render(); };
    if (tabCreator) tabCreator.onclick = () => { state.tab = 'creator'; render(); };

    root.querySelectorAll('[data-toggle-viewer]').forEach((button) => {
      button.onclick = () => {
        const id = String(button.getAttribute('data-toggle-viewer') || '');
        state.expandedViewerId = state.expandedViewerId === id ? '' : id;
        render();
      };
    });

    root.querySelectorAll('[data-item-status]').forEach((select) => {
      select.onchange = async () => {
        const itemId = String(select.getAttribute('data-item-status') || '');
        const status = statusNorm(select.value);
        const remarksInput = root.querySelector(`[data-item-remarks="${CSS.escape(itemId)}"]`);
        const remarks = remarksInput ? remarksInput.value : '';

        updateAssignedItemLocal(itemId, { status, remarks });
        render();

        const out = await CloudTasks.updateItemStatus({ item_id: itemId, status, remarks });
        if (!out.ok) {
          await loadBaseData();
        }
      };
    });

    root.querySelectorAll('[data-item-remarks]').forEach((input) => {
      input.onblur = async () => {
        const itemId = String(input.getAttribute('data-item-remarks') || '');
        const group = state.assignedGroups.find((g) => (g.items || []).some((it) => String(it.id) === itemId));
        const existing = group && group.items.find((it) => String(it.id) === itemId);
        const status = statusNorm(existing && existing.status);
        const remarks = input.value;

        updateAssignedItemLocal(itemId, { remarks });
        const out = await CloudTasks.updateItemStatus({ item_id: itemId, status, remarks });
        if (!out.ok) await loadBaseData();
      };
    });

    const uploadZone = root.querySelector('#uploadZone');
    const fileInput = root.querySelector('#taskFileInput');
    if (fileInput) fileInput.onchange = () => handleFile(fileInput.files && fileInput.files[0]);

    if (uploadZone) {
      uploadZone.ondragover = (event) => {
        event.preventDefault();
        state.dragActive = true;
        render();
      };
      uploadZone.ondragleave = () => {
        state.dragActive = false;
        render();
      };
      uploadZone.ondrop = (event) => {
        event.preventDefault();
        state.dragActive = false;
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        render();
        handleFile(file);
      };
    }

    root.querySelectorAll('[data-assignee-fix]').forEach((select) => {
      select.onchange = () => {
        const idx = Number(select.getAttribute('data-assignee-fix'));
        if (!Number.isFinite(idx) || !state.parsedRows[idx]) return;
        state.parsedRows[idx].assigned_to = String(select.value || '');
        render();
      };
    });

    const submitBtn = root.querySelector('#submitDistribution');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const title = `Distribution ${new Date().toLocaleDateString()}`;
        const items = state.parsedRows
          .filter((row) => row.description && row.assigned_to)
          .map((row) => ({
            case_number: row.case_number || 'N/A',
            site: row.site || 'N/A',
            description: row.description || 'N/A',
            assigned_to: row.assigned_to,
            deadline: row.deadline || null,
            reference_url: row.reference_url || ''
          }));

        if (!items.length || unresolvedRowsCount() > 0) return;

        state.creating = true;
        render();
        const out = await CloudTasks.createDistribution({ title, items });
        state.creating = false;

        if (!out.ok) {
          state.parseError = out.message || 'Failed to create distribution';
          render();
          return;
        }

        state.parseError = '';
        state.parsedRows = [];
        state.uploadMeta = { name: '', rows: 0, sheets: 0 };
        await loadBaseData();
        state.tab = 'creator';
        render();
      };
    }

    root.querySelectorAll('[data-open-distribution]').forEach((button) => {
      button.onclick = async () => {
        const id = String(button.getAttribute('data-open-distribution') || '');
        if (!id) return;
        if (state.selectedDistributionId === id) {
          state.selectedDistributionId = '';
          state.selectedDistributionItems = [];
          render();
          return;
        }
        state.selectedDistributionId = id;
        state.loading = true;
        render();
        await refreshDistributionItems(id);
        state.loading = false;
        render();
      };
    });

    root.querySelectorAll('[data-delete-distribution]').forEach((button) => {
      button.onclick = async () => {
        const id = String(button.getAttribute('data-delete-distribution') || '');
        if (!id) return;
        state.deletingDistributionId = id;
        render();

        const out = await CloudTasks.deleteDistribution(id);
        state.deletingDistributionId = '';
        if (!out.ok) {
          state.parseError = out.message || 'Delete failed';
          render();
          return;
        }

        if (state.selectedDistributionId === id) {
          state.selectedDistributionId = '';
          state.selectedDistributionItems = [];
        }
        await loadBaseData();
      };
    });
  }

  loadBaseData();
});
