(window.Pages = window.Pages || {}, window.Pages.my_task = function myTaskPage(root) {
  const esc = (v) => (window.UI && UI.esc ? UI.esc(v) : String(v == null ? '' : v));
  const safeText = (v, fallback = 'N/A') => {
    const out = String(v == null ? '' : v).trim();
    return out || fallback;
  };

  const state = {
    loading: false,
    creating: false,
    activeTab: 'assigned',

    assignedGroups: [],
    expandedAssignedId: '',

    distributions: [],
    expandedDistributionId: '',
    distributionItemsById: {},

    members: [],

    modalOpen: false,
    parseError: '',
    dragActive: false,
    uploadMeta: { name: '', rows: 0, sheets: 0 },
    parsedRows: [],
    assigneeColumnIndex: -1,
    form: {
      title: '',
      description: '',
      reference_url: '',
      enable_daily_alerts: false
    },

    isSheetJsReady: false
  };

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

  function normalizeStatus(value, pendingCount) {
    const pending = Number(pendingCount || 0);
    if (pending === 0) return 'COMPLETED';
    const text = String(value || 'ONGOING').toUpperCase();
    return text === 'COMPLETED' ? 'COMPLETED' : 'ONGOING';
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
    if (document.getElementById('my-task-dashboard-style')) return;
    const style = document.createElement('style');
    style.id = 'my-task-dashboard-style';
    style.textContent = `
      .task-shell{position:relative;display:flex;flex-direction:column;gap:14px}
      .task-header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .task-section{display:flex;flex-direction:column;gap:10px}
      .task-section-title{font-size:15px;font-weight:800;display:flex;align-items:center;gap:6px}
      .task-card{background:rgba(15,23,42,.7);border-radius:8px;padding:14px;border:1px solid rgba(148,163,184,.14)}
      .task-empty{padding:24px 12px;text-align:center;color:#9ca3af;border:1px dashed rgba(255,255,255,.2);border-radius:8px}
      .task-meta{font-size:12px;color:#9ca3af}
      .task-title{font-size:16px;font-weight:800;line-height:1.3;margin-bottom:4px}
      .task-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .task-tab{border:1px solid rgba(148,163,184,.35);border-radius:999px;background:rgba(15,23,42,.45);padding:6px 12px;color:#cbd5e1;cursor:pointer}
      .task-tab.active{background:rgba(56,189,248,.24);border-color:rgba(56,189,248,.65);color:#e0f2fe}
      .task-ref{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:1px solid rgba(148,163,184,.45);border-radius:999px;text-decoration:none;color:#22d3ee;margin-left:8px}
      .task-progress-rail{height:8px;background:rgba(148,163,184,.24);border-radius:999px;overflow:hidden}
      .task-progress-fill{height:100%;background:linear-gradient(90deg,#10b981,#06b6d4)}
      .task-grid-wrap{max-height:0;overflow:hidden;opacity:0;transition:max-height .24s ease, opacity .2s ease;margin-top:0}
      .task-grid-wrap.open{max-height:550px;opacity:1;margin-top:10px}
      .task-grid table{width:100%;border-collapse:collapse}
      .task-grid th,.task-grid td{padding:9px;border-bottom:1px solid rgba(148,163,184,.16);font-size:13px;text-align:left;vertical-align:top}
      .task-grid tbody tr:hover{background:rgba(148,163,184,.08)}
      .task-overlay{position:absolute;inset:0;background:rgba(2,6,23,.56);display:flex;align-items:center;justify-content:center;z-index:40;border-radius:8px}
      .task-spinner{width:32px;height:32px;border-radius:999px;border:4px solid rgba(255,255,255,.25);border-top-color:#22d3ee;animation:taskSpin 1s linear infinite}
      .task-accordion{display:block;width:100%;text-align:left;border:none;background:transparent;color:inherit;padding:0;cursor:pointer}
      .task-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:14060;display:flex;align-items:center;justify-content:center;padding:16px 16px calc(16px + env(safe-area-inset-bottom) + 86px);overflow:auto}
      .task-modal{width:min(980px,95vw);max-height:calc(100vh - 140px);overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,.2);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:12px}
      .task-field label{display:block;font-size:12px;color:#9ca3af;margin-bottom:4px}
      .task-field input,.task-field textarea{width:100%}
      .upload-zone{border:2px dashed rgba(148,163,184,.4);border-radius:8px;padding:22px;text-align:center;transition:all .2s ease}
      .upload-zone.drag{border-color:#22d3ee;background:rgba(34,211,238,.08)}
      .task-invalid{background:rgba(239,68,68,.16)!important}
      @keyframes taskSpin{to{transform:rotate(360deg)}}
    `;

    document.head.appendChild(style);
  }

  function renderAssignedCard(group) {
    const id = String(group.distribution_id || 'unassigned');
    const total = Number(group.total_count || (Array.isArray(group.items) ? group.items.length : 0));
    const done = Number(group.done_count || 0);
    const assignedAt = safeDate(group.assigned_at);
    const isOpen = state.expandedAssignedId === id;
    const items = Array.isArray(group.items) ? group.items : [];

    return `
      <article class="task-card">
        <button class="task-accordion" type="button" data-toggle-assigned="${esc(id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
          <div class="task-title">${esc(safeText(group.project_title, 'Untitled Distribution'))}</div>
          <div class="task-meta">Assigned by: ${esc(safeText(group.assigner_name, 'N/A'))} • ${esc(assignedAt)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap">
            <div class="task-meta">${esc(done)} / ${esc(total)} complete</div>
            <div class="task-meta">${esc(percent(done, total))}%</div>
          </div>
          <div class="task-progress-rail" style="margin-top:6px"><div class="task-progress-fill" style="width:${percent(done, total)}%"></div></div>
        </button>

        <div class="task-grid-wrap ${isOpen ? 'open' : ''}">
          <div class="task-grid" style="overflow:auto">
            <table>
              <thead><tr><th>Case #</th><th>Site</th><th>Status</th><th>Deadline</th></tr></thead>
              <tbody>
                ${items.map((item) => `
                  <tr>
                    <td>${esc(safeText(item.case_number || item.case_no, 'N/A'))}</td>
                    <td>${esc(safeText(item.site, 'N/A'))}</td>
                    <td>${esc(safeText(item.status, 'PENDING'))}</td>
                    <td>${esc(safeDate(item.deadline || item.deadline_at || item.due_at))}</td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="task-meta">No assigned items</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }

  function renderAssignedPanel() {
    return `
      <section class="task-section">
        <div class="task-section-title">📥 My Assigned Tasks</div>
        ${state.assignedGroups.length ? state.assignedGroups.map(renderAssignedCard).join('') : '<div class="task-empty">No assigned tasks yet</div>'}
      </section>
    `;
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
          <div class="task-title">${esc(safeText(dist.title, 'Untitled Distribution'))}</div>
          <div class="task-meta">
            ${esc(safeText(dist.description, 'N/A'))}
            ${/^https?:\/\//i.test(String(dist.reference_url || '')) ? `<a class="task-ref" href="${esc(dist.reference_url)}" target="_blank" rel="noopener" title="Open Work Instruction">🔗</a>` : ''}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap">
            <div class="task-meta">${esc(done)} / ${esc(total)} complete</div>
            <div class="task-meta">${esc(percent(done, total))}%</div>
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
                    <td>${esc(safeText(item.status, 'PENDING'))}</td>
                    <td>${esc(safeDate(item.deadline || item.deadline_at || item.due_at))}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5" class="task-meta">No task items</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }

  function renderDistributionPanel() {
    const ongoing = [];
    const completed = [];

    state.distributions.forEach((dist) => {
      const status = normalizeStatus(dist.status, dist.pending_count || dist.pending_items);
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
            <div class="task-title" style="font-size:15px">Section A: Project Metadata</div>
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
            <div class="task-field" style="margin-top:8px; display:flex; align-items:center; gap:10px">
              <input id="distEnableDailyAlerts" type="checkbox" ${state.form.enable_daily_alerts ? 'checked' : ''} />
              <label for="distEnableDailyAlerts" style="margin:0">Enable Daily Reminders for Incomplete Tasks</label>
            </div>
            <div class="task-meta" style="margin-top:-2px; opacity:0.85">When enabled, the system will send daily reminders for tasks not yet completed (Phase 4 automation).</div>
          </article>

          <article class="task-card">
            <div class="task-title" style="font-size:15px">Section B: Universal Excel Adapter</div>
            <div class="task-meta">Parser focuses on Task Data only: Case #, Site, and Assignee.</div>
            <div id="uploadZone" class="upload-zone ${state.dragActive ? 'drag' : ''}" style="margin-top:10px">
              <div style="font-weight:700;font-size:16px">Drag & Drop File Here</div>
              <div class="task-meta" style="margin:8px 0">or select manually</div>
              <input type="file" id="taskFileInput" accept=".xlsx,.xls,.csv" />
              <div class="task-meta" style="margin-top:8px">${esc(state.uploadMeta.name ? `${state.uploadMeta.name} • ${state.uploadMeta.rows} rows • ${state.uploadMeta.sheets} sheet(s)` : 'No file selected')}</div>
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
                        <td>${invalid ? '<span class="task-meta" style="color:#f59e0b">Needs Fix</span>' : '<span class="task-meta" style="color:#22c55e">Ready</span>'}</td>
                      </tr>
                    `;
                  }).join('') || '<tr><td colspan="4" class="task-meta">Upload a file to preview parsed tasks.</td></tr>'}
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
            <button type="button" class="btn primary" id="openDistributionModal" ${state.activeTab === 'distribution' ? '' : 'style="display:none"'}>+ Create Distribution</button>
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
      state.assigneeColumnIndex = detection.assigneeColumnIndex;
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
    state.parseError = '';
    state.dragActive = false;
    state.uploadMeta = { name: '', rows: 0, sheets: 0 };
    state.parsedRows = [];
    state.form = { title: '', description: '', reference_url: '', enable_daily_alerts: false };
    render();
  }

  async function loadDistributionItems(distributionId) {
    const id = String(distributionId || '');
    if (!id) return;
    if (state.distributionItemsById[id]) return;

    const out = await CloudTasks.distributionItems(id);
    state.distributionItemsById[id] = out.ok && Array.isArray(out.data.rows) ? out.data.rows : [];
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

    const openBtn = root.querySelector('#openDistributionModal');
    if (openBtn) {
      openBtn.onclick = () => {
        state.modalOpen = true;
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

    const dailyAlertsToggle = root.querySelector('#distEnableDailyAlerts');
    if (dailyAlertsToggle) dailyAlertsToggle.onchange = () => { state.form.enable_daily_alerts = !!dailyAlertsToggle.checked; };

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
          enable_daily_alerts: !!state.form.enable_daily_alerts,
          items
        });

        state.creating = false;
        if (!out.ok) {
          state.parseError = out.message || 'Failed to create distribution';
          render();
          return;
        }

        state.form = { title: '', description: '', reference_url: '', enable_daily_alerts: false };
        closeModal();
        await loadBaseData();
      };
    }
  }

  loadBaseData();
});
