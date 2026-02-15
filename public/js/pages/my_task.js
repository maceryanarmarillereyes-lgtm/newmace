(window.Pages = window.Pages || {}, window.Pages.my_task = function myTaskPage(root) {
  const esc = (v) => (window.UI && UI.esc ? UI.esc(v) : String(v == null ? '' : v));
  const safeText = (v, fallback = 'N/A') => {
    const out = String(v == null ? '' : v).trim();
    return out || fallback;
  };

  const state = {
    activeTab: 'assigned',
    loading: false,
    creating: false,
    parseError: '',
    dragActive: false,
    isSheetJsReady: false,

    assignedGroups: [],
    expandedAssignedId: '',

    distributions: [],
    expandedDistributionId: '',
    distributionItemsById: {},

    members: [],

    modalOpen: false,
    uploadMeta: { name: '', rows: 0, sheets: 0 },
    parsedRows: [],
    form: {
      title: '',
      description: '',
      reference_url: ''
    }
  };

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function statusNorm(value) {
    const s = String(value || 'PENDING').toUpperCase();
    if (s === 'DONE' || s === 'IN_PROGRESS') return s;
    return 'PENDING';
  }

  function normalizeDistributionStatus(value, pendingCount) {
    const pending = Number(pendingCount || 0);
    if (pending === 0) return 'COMPLETED';
    const text = String(value || 'ONGOING').toUpperCase();
    return text === 'COMPLETED' ? 'COMPLETED' : 'ONGOING';
  }

  function percent(done, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }

  function safeDate(value) {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
  }

  function unresolvedRowsCount() {
    return state.parsedRows.filter((row) => !row.assigned_to).length;
  }

  function guessMember(rawValue) {
    const input = normalizeName(rawValue);
    if (!input) return null;

    let winner = null;
    state.members.forEach((member) => {
      const label = normalizeName(member.name || member.username || member.user_id);
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

      if (!winner || score > winner.score) winner = { member, score };
    });

    return winner;
  }

  function ensureStyleTag() {
    if (document.getElementById('my-task-enterprise-style')) return;

    const style = document.createElement('style');
    style.id = 'my-task-enterprise-style';
    style.textContent = `
      .task-shell{position:relative;display:flex;flex-direction:column;gap:14px}
      .task-header{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
      .task-title-main{margin:0;font-size:34px}
      .task-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .task-tab{border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.6);color:#cbd5e1;padding:8px 14px;border-radius:999px;font-weight:700;cursor:pointer;transition:all .18s ease}
      .task-tab:hover{border-color:rgba(34,211,238,.55);color:#e2e8f0}
      .task-tab.active{background:linear-gradient(90deg,rgba(37,99,235,.8),rgba(8,145,178,.8));border-color:rgba(34,211,238,.75);color:#fff}

      .task-panel{display:flex;flex-direction:column;gap:12px}
      .task-panel-header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .task-muted{font-size:12px;color:#9ca3af}

      .task-card{background:rgba(15,23,42,.7);border-radius:8px;padding:14px;border:1px solid rgba(148,163,184,.14)}
      .task-empty{padding:24px 12px;text-align:center;color:#9ca3af;border:1px dashed rgba(255,255,255,.2);border-radius:8px}

      .task-accordion{display:block;width:100%;text-align:left;border:none;background:transparent;color:inherit;padding:0;cursor:pointer}
      .task-card-title{font-size:16px;font-weight:800;line-height:1.3;margin-bottom:4px}
      .task-meta-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:#9ca3af}
      .task-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800}
      .task-badge.pending{background:#fef3c7;color:#92400e}
      .task-badge.progress{background:#dbeafe;color:#1e40af}
      .task-badge.done{background:#10b981;color:#fff}

      .task-progress-rail{height:8px;background:rgba(148,163,184,.24);border-radius:999px;overflow:hidden}
      .task-progress-fill{height:100%;background:linear-gradient(90deg,#10b981,#06b6d4)}

      .task-grid-wrap{max-height:0;overflow:hidden;opacity:0;transition:max-height .24s ease, opacity .2s ease;margin-top:0}
      .task-grid-wrap.open{max-height:560px;opacity:1;margin-top:10px}
      .task-grid table{width:100%;border-collapse:collapse}
      .task-grid th,.task-grid td{padding:9px;border-bottom:1px solid rgba(148,163,184,.16);font-size:13px;text-align:left;vertical-align:top}
      .task-grid tbody tr:hover{background:rgba(148,163,184,.08)}

      .task-section{display:flex;flex-direction:column;gap:10px}
      .task-section-title{font-size:15px;font-weight:800;display:flex;align-items:center;gap:6px}
      .task-ref{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid rgba(148,163,184,.45);border-radius:999px;text-decoration:none;color:#22d3ee;margin-left:8px}

      .task-overlay{position:absolute;inset:0;background:rgba(2,6,23,.56);display:flex;align-items:center;justify-content:center;z-index:40;border-radius:8px}
      .task-spinner{width:32px;height:32px;border-radius:999px;border:4px solid rgba(255,255,255,.25);border-top-color:#22d3ee;animation:taskSpin 1s linear infinite}

      .task-modal-backdrop{position:fixed;inset:0;z-index:1050;background:rgba(2,6,23,.68);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}
      .task-modal{width:min(980px,95vw);max-height:88vh;overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,.2);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 48px rgba(0,0,0,.45)}
      .task-field label{display:block;font-size:12px;color:#9ca3af;margin-bottom:4px}
      .task-field input,.task-field textarea{width:100%}
      .upload-zone{border:2px dashed rgba(148,163,184,.4);border-radius:8px;padding:22px;text-align:center;transition:all .2s ease}
      .upload-zone.drag{border-color:#22d3ee;background:rgba(34,211,238,.08)}
      .task-invalid{background:rgba(239,68,68,.16)!important}

      @keyframes taskSpin{to{transform:rotate(360deg)}}
    `;

    document.head.appendChild(style);
  }

  function statusBadge(status) {
    const norm = statusNorm(status);
    if (norm === 'DONE') return '<span class="task-badge done">DONE</span>';
    if (norm === 'IN_PROGRESS') return '<span class="task-badge progress">IN PROGRESS</span>';
    return '<span class="task-badge pending">PENDING</span>';
  }

  function renderAssignedCards() {
    if (!state.assignedGroups.length) {
      return '<div class="task-empty">You have no pending tasks. Good job!</div>';
    }

    return state.assignedGroups.map((group) => {
      const id = String(group.distribution_id || group.id || '');
      const isOpen = state.expandedAssignedId === id;
      const title = safeText(group.distribution_title || group.title, 'Untitled Distribution');
      const total = Number(group.total_count || (Array.isArray(group.items) ? group.items.length : 0));
      const done = Number(group.done_count || 0);
      const pending = Math.max(0, total - done);

      const upcomingDue = (group.items || [])
        .map((item) => item.deadline || item.deadline_at || item.due_at)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || '';

      return `
        <article class="task-card">
          <button class="task-accordion" type="button" data-toggle-assigned="${esc(id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
            <div class="task-card-title">${esc(title)}</div>
            <div class="task-meta-line">
              <span>Due: ${esc(safeDate(upcomingDue))}</span>
              ${pending === 0 ? '<span class="task-badge done">COMPLETED</span>' : '<span class="task-badge pending">ONGOING</span>'}
              <span>${esc(done)} / ${esc(total)} complete</span>
            </div>
            <div class="task-progress-rail" style="margin-top:8px"><div class="task-progress-fill" style="width:${percent(done, total)}%"></div></div>
          </button>

          <div class="task-grid-wrap ${isOpen ? 'open' : ''}">
            <div class="task-grid" style="overflow:auto">
              <table>
                <thead>
                  <tr><th>Case #</th><th>Site</th><th>Description</th><th>Deadline</th><th>Status</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  ${(group.items || []).map((item) => `
                    <tr>
                      <td>${esc(safeText(item.case_number || item.case_no, 'N/A'))}</td>
                      <td>${esc(safeText(item.site, 'N/A'))}</td>
                      <td>${esc(safeText(item.description, 'N/A'))}</td>
                      <td>${esc(safeDate(item.deadline || item.deadline_at || item.due_at))}</td>
                      <td>
                        <select data-item-status="${esc(item.id)}" style="min-width:120px">
                          <option value="PENDING" ${statusNorm(item.status) === 'PENDING' ? 'selected' : ''}>PENDING</option>
                          <option value="IN_PROGRESS" ${statusNorm(item.status) === 'IN_PROGRESS' ? 'selected' : ''}>IN PROGRESS</option>
                          <option value="DONE" ${statusNorm(item.status) === 'DONE' ? 'selected' : ''}>DONE</option>
                        </select>
                      </td>
                      <td><input data-item-remarks="${esc(item.id)}" value="${esc(item.remarks || '')}" placeholder="Add remarks" style="width:100%" /></td>
                    </tr>
                  `).join('') || '<tr><td colspan="6" class="task-muted">No task items</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderDistributionCard(dist) {
    const id = String(dist.id || dist.distribution_id || '');
    const total = Number(dist.total_count || dist.total_items || 0);
    const pending = Number(dist.pending_count || dist.pending_items || 0);
    const done = Math.max(0, total - pending);
    const isOpen = state.expandedDistributionId === id;
    const items = isOpen ? (state.distributionItemsById[id] || []) : [];

    return `
      <article class="task-card">
        <button class="task-accordion" type="button" data-toggle-dist="${esc(id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
          <div class="task-card-title">${esc(safeText(dist.title, 'Untitled Distribution'))}</div>
          <div class="task-meta-line">
            <span>${esc(safeText(dist.description, 'N/A'))}</span>
            ${/^https?:\/\//i.test(String(dist.reference_url || '')) ? `<a class="task-ref" href="${esc(dist.reference_url)}" target="_blank" rel="noopener" title="Open Work Instruction">🔗</a>` : ''}
          </div>
          <div class="task-meta-line" style="margin-top:8px">
            <span>${esc(done)} / ${esc(total)} complete</span>
            <span>${esc(percent(done, total))}%</span>
          </div>
          <div class="task-progress-rail" style="margin-top:6px"><div class="task-progress-fill" style="width:${percent(done, total)}%"></div></div>
        </button>

        <div class="task-grid-wrap ${isOpen ? 'open' : ''}">
          <div class="task-grid" style="overflow:auto">
            <table>
              <thead><tr><th>Case #</th><th>Site</th><th>Assignee</th><th>Status</th><th>Deadline</th></tr></thead>
              <tbody>
                ${items.map((item) => `
                  <tr>
                    <td>${esc(safeText(item.case_number || item.case_no, 'N/A'))}</td>
                    <td>${esc(safeText(item.site, 'N/A'))}</td>
                    <td>${esc(safeText(item.assigned_to || item.assignee_user_id, 'N/A'))}</td>
                    <td>${statusBadge(item.status)}</td>
                    <td>${esc(safeDate(item.deadline || item.deadline_at || item.due_at))}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5" class="task-muted">No task items</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }

  function renderDistributionSections() {
    const ongoing = [];
    const completed = [];

    state.distributions.forEach((dist) => {
      const status = normalizeDistributionStatus(dist.status, dist.pending_count || dist.pending_items);
      if (status === 'COMPLETED') completed.push(dist);
      else ongoing.push(dist);
    });

    return `
      <section class="task-section">
        <div class="task-section-title">📌 ONGOING (Active Batches)</div>
        ${ongoing.length ? ongoing.map(renderDistributionCard).join('') : '<div class="task-empty">No ongoing distributions</div>'}
      </section>

      <section class="task-section">
        <details>
          <summary class="task-section-title">✅ COMPLETED (100% Done)</summary>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
            ${completed.length ? completed.map(renderDistributionCard).join('') : '<div class="task-empty">No completed distributions</div>'}
          </div>
        </details>
      </section>
    `;
  }

  function renderAssignedPanel() {
    return `
      <section class="task-panel">
        <div class="task-panel-header">
          <h3 style="margin:0">My Assigned Tasks</h3>
          <div class="task-muted">Incoming workload grouped by project/distribution.</div>
        </div>
        ${renderAssignedCards()}
      </section>
    `;
  }

  function renderDistributionPanel() {
    return `
      <section class="task-panel">
        <div class="task-panel-header">
          <h3 style="margin:0">Distribution Management</h3>
          <button type="button" class="btn primary" id="openDistributionModal">+ Create Distribution</button>
        </div>
        ${renderDistributionSections()}
      </section>
    `;
  }

  function renderModal() {
    const unresolved = unresolvedRowsCount();

    return `
      <div class="task-modal-backdrop" id="distributionModalBackdrop">
        <div class="task-modal" role="dialog" aria-modal="true" aria-label="Create Distribution Wizard">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <h3 style="margin:0">Create Distribution</h3>
            <button class="btn" type="button" id="closeDistributionModal">Close</button>
          </div>

          <article class="task-card">
            <div class="task-card-title" style="font-size:20px">Section A: Project Metadata</div>
            <div class="task-field" style="margin-top:8px">
              <label for="distTitleInput">Project Title</label>
              <input id="distTitleInput" type="text" value="${esc(state.form.title)}" placeholder="e.g. Custom Screen Request" />
            </div>
            <div class="task-field" style="margin-top:8px">
              <label for="distDescriptionInput">Description</label>
              <textarea id="distDescriptionInput" rows="3" placeholder="Global description for the whole batch">${esc(state.form.description)}</textarea>
            </div>
            <div class="task-field" style="margin-top:8px">
              <label for="distReferenceInput">Work Instruction Link (URL)</label>
              <input id="distReferenceInput" type="url" value="${esc(state.form.reference_url)}" placeholder="https://..." />
            </div>
          </article>

          <article class="task-card">
            <div class="task-card-title" style="font-size:20px">Section B: Universal Excel Adapter</div>
            <div class="task-muted">Parser focuses on Task Data only: Case #, Site, and Assignee.</div>

            <div id="uploadZone" class="upload-zone ${state.dragActive ? 'drag' : ''}" style="margin-top:10px">
              <div style="font-weight:700;font-size:16px">Drag & Drop File Here</div>
              <div class="task-muted" style="margin:8px 0">or select manually</div>
              <input type="file" id="taskFileInput" accept=".xlsx,.xls,.csv" />
              <div class="task-muted" style="margin-top:8px">${esc(state.uploadMeta.name ? `${state.uploadMeta.name} • ${state.uploadMeta.rows} rows • ${state.uploadMeta.sheets} sheet(s)` : 'No file selected')}</div>
              ${state.parseError ? `<div style="color:#ef4444;margin-top:8px;font-size:13px">${esc(state.parseError)}</div>` : ''}
            </div>

            <div style="margin-top:10px;overflow:auto" class="task-grid">
              <table>
                <thead><tr><th>Case #</th><th>Site</th><th>Assignee</th><th>State</th></tr></thead>
                <tbody>
                  ${state.parsedRows.map((row, idx) => {
                    const invalid = !row.assigned_to;
                    return `
                      <tr>
                        <td>${esc(safeText(row.case_number, 'N/A'))}</td>
                        <td>${esc(safeText(row.site, 'N/A'))}</td>
                        <td class="${invalid ? 'task-invalid' : ''}">
                          <div style="font-weight:600">${esc(safeText(row.assigned_name, 'Unknown Member'))}</div>
                          <select data-assignee-fix="${idx}" style="width:100%;margin-top:4px">
                            <option value="">Resolve member</option>
                            ${state.members.map((member) => {
                              const id = String(member.user_id || '');
                              const label = safeText(member.name || member.username || member.user_id);
                              return `<option value="${esc(id)}" ${String(row.assigned_to) === id ? 'selected' : ''}>${esc(label)}</option>`;
                            }).join('')}
                          </select>
                        </td>
                        <td>${invalid ? '<span class="task-badge pending">Needs Fix</span>' : '<span class="task-badge done">Ready</span>'}</td>
                      </tr>
                    `;
                  }).join('') || '<tr><td colspan="4" class="task-muted">Upload a file to preview parsed tasks.</td></tr>'}
                </tbody>
              </table>
            </div>
            ${unresolved > 0 ? `<div style="color:#f59e0b;margin-top:8px;font-size:13px">Resolve ${esc(unresolved)} unknown member(s) to enable submit.</div>` : ''}
          </article>

          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button class="btn" type="button" id="cancelDistributionCreate">Cancel</button>
            <button class="btn primary" type="button" id="submitDistribution" ${state.creating || unresolved > 0 || !state.parsedRows.length || !state.form.title.trim() ? 'disabled' : ''}>${state.creating ? 'Submitting...' : 'Create Distribution'}</button>
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    ensureStyleTag();

    root.innerHTML = `
      <section class="task-shell">
        ${state.loading || state.creating ? '<div class="task-overlay"><div class="task-spinner" aria-label="Loading"></div></div>' : ''}

        <header class="task-header">
          <h2 class="task-title-main">My Task</h2>
          <nav class="task-tabs" aria-label="My Task Views">
            <button type="button" class="task-tab ${state.activeTab === 'assigned' ? 'active' : ''}" id="tabAssigned">📥 My Assigned Tasks</button>
            <button type="button" class="task-tab ${state.activeTab === 'distribution' ? 'active' : ''}" id="tabDistribution">🚀 Distribution Management</button>
          </nav>
        </header>

        ${state.activeTab === 'assigned' ? renderAssignedPanel() : renderDistributionPanel()}
        ${state.modalOpen ? renderModal() : ''}
      </section>
    `;

    bindEvents();
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
      rows.forEach((row) => matrix.push(Array.isArray(row) ? row : []));
    });

    return { matrix, sheets: (workbook.SheetNames || []).length || 1 };
  }

  function splitMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const headerIndex = rows.findIndex((row) => (Array.isArray(row) ? row : []).some((cell) => String(cell || '').trim()));
    if (headerIndex < 0) return { headers: [], rows: [] };

    const headers = (Array.isArray(rows[headerIndex]) ? rows[headerIndex] : []).map((h, idx) => safeText(h, `Column ${idx + 1}`));
    const dataRows = rows.slice(headerIndex + 1).filter((row) => (Array.isArray(row) ? row : []).some((cell) => String(cell || '').trim()));

    return { headers, rows: dataRows };
  }

  function detectColumns(headers, dataRows) {
    let assigneeColumnIndex = -1;
    let siteColumnIndex = -1;
    let bestAssigneeScore = 0;
    const sampleRows = dataRows.slice(0, 250);

    headers.forEach((header, idx) => {
      const h = normalizeName(header);
      if (siteColumnIndex < 0 && /site|location|branch|store|facility/.test(h)) siteColumnIndex = idx;

      let nonEmpty = 0;
      let hits = 0;
      sampleRows.forEach((row) => {
        const value = String((Array.isArray(row) ? row[idx] : '') || '').trim();
        if (!value) return;
        nonEmpty += 1;
        const match = guessMember(value);
        if (match && match.score >= 0.72) hits += 1;
      });

      const ratio = nonEmpty ? hits / nonEmpty : 0;
      const explicit = /assignee|owner|agent|assigned/.test(h);
      if (ratio > bestAssigneeScore || (explicit && ratio >= bestAssigneeScore)) {
        bestAssigneeScore = ratio;
        assigneeColumnIndex = idx;
      }
    });

    return { assigneeColumnIndex, siteColumnIndex };
  }

  function buildParsedRows(dataRows, detection) {
    return dataRows.map((row) => {
      const values = Array.isArray(row) ? row : [];
      const caseNumber = safeText(values[0], 'N/A');
      const site = detection.siteColumnIndex >= 0 ? safeText(values[detection.siteColumnIndex], 'N/A') : 'N/A';
      const assigneeName = detection.assigneeColumnIndex >= 0 ? String(values[detection.assigneeColumnIndex] || '').trim() : '';
      const match = guessMember(assigneeName);

      return {
        case_number: caseNumber,
        site,
        assigned_name: assigneeName,
        assigned_to: match && match.score >= 0.72 ? String(match.member.user_id || '') : ''
      };
    }).filter((row) => row.case_number !== 'N/A' || row.site !== 'N/A' || row.assigned_name);
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
      state.parsedRows = buildParsedRows(split.rows, detection);
      state.uploadMeta = { name: String(file.name || ''), rows: state.parsedRows.length, sheets: parsed.sheets };
    } catch (err) {
      state.parseError = String(err && err.message ? err.message : err);
      state.parsedRows = [];
    } finally {
      state.creating = false;
      render();
    }
  }

  function closeModal() {
    state.modalOpen = false;
    state.dragActive = false;
    state.parseError = '';
    state.uploadMeta = { name: '', rows: 0, sheets: 0 };
    state.parsedRows = [];
    render();
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

  async function loadDistributionItems(distributionId) {
    const id = String(distributionId || '');
    if (!id) return;
    if (state.distributionItemsById[id]) return;

    const out = await CloudTasks.distributionItems(id);
    state.distributionItemsById[id] = out.ok && Array.isArray(out.data.rows) ? out.data.rows : [];
  }

  function bindEvents() {
    const tabAssigned = root.querySelector('#tabAssigned');
    const tabDistribution = root.querySelector('#tabDistribution');

    if (tabAssigned) {
      tabAssigned.onclick = () => {
        state.activeTab = 'assigned';
        render();
      };
    }

    if (tabDistribution) {
      tabDistribution.onclick = () => {
        state.activeTab = 'distribution';
        render();
      };
    }

    root.querySelectorAll('[data-toggle-assigned]').forEach((button) => {
      button.onclick = () => {
        const id = String(button.getAttribute('data-toggle-assigned') || '');
        state.expandedAssignedId = state.expandedAssignedId === id ? '' : id;
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
        if (!out.ok) await loadBaseData();
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

    const openBtn = root.querySelector('#openDistributionModal');
    if (openBtn) {
      openBtn.onclick = () => {
        state.modalOpen = true;
        render();
      };
    }

    root.querySelectorAll('[data-toggle-dist]').forEach((button) => {
      button.onclick = async () => {
        const id = String(button.getAttribute('data-toggle-dist') || '');
        if (!id) return;

        if (state.expandedDistributionId === id) {
          state.expandedDistributionId = '';
          render();
          return;
        }

        state.expandedDistributionId = id;
        state.loading = true;
        render();
        await loadDistributionItems(id);
        state.loading = false;
        render();
      };
    });

    if (!state.modalOpen) return;

    const closeBtn = root.querySelector('#closeDistributionModal');
    const cancelBtn = root.querySelector('#cancelDistributionCreate');
    const backdrop = root.querySelector('#distributionModalBackdrop');

    if (backdrop) {
      backdrop.onclick = (event) => {
        if (event.target === backdrop) closeModal();
      };
    }
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    const titleInput = root.querySelector('#distTitleInput');
    const descriptionInput = root.querySelector('#distDescriptionInput');
    const referenceInput = root.querySelector('#distReferenceInput');

    if (titleInput) {
      titleInput.oninput = () => {
        state.form.title = String(titleInput.value || '');
        const submitBtn = root.querySelector('#submitDistribution');
        if (submitBtn) submitBtn.disabled = !state.form.title.trim() || unresolvedRowsCount() > 0 || !state.parsedRows.length || state.creating;
      };
    }

    if (descriptionInput) descriptionInput.oninput = () => { state.form.description = String(descriptionInput.value || ''); };
    if (referenceInput) referenceInput.oninput = () => { state.form.reference_url = String(referenceInput.value || ''); };

    const fileInput = root.querySelector('#taskFileInput');
    if (fileInput) fileInput.onchange = () => handleFile(fileInput.files && fileInput.files[0]);

    const uploadZone = root.querySelector('#uploadZone');
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
        if (!state.form.title.trim()) return;
        if (!state.parsedRows.length || unresolvedRowsCount() > 0) return;

        const items = state.parsedRows
          .filter((row) => row.assigned_to)
          .map((row) => ({
            case_number: row.case_number || 'N/A',
            site: row.site || 'N/A',
            assigned_to: row.assigned_to
          }));

        state.creating = true;
        render();

        const out = await CloudTasks.createDistribution({
          title: state.form.title,
          description: state.form.description,
          reference_url: state.form.reference_url,
          items
        });

        state.creating = false;
        if (!out.ok) {
          state.parseError = out.message || 'Failed to create distribution';
          render();
          return;
        }

        state.form = { title: '', description: '', reference_url: '' };
        closeModal();
        await loadBaseData();
      };
    }
  }

  loadBaseData();
});
