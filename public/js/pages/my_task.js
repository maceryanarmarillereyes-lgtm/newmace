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

    // Member experience: status editing
    pendingStatusByItemId: {},
    savingStatusByItemId: {},
    problemModal: {
      open: false,
      taskItemId: '',
      prevStatus: 'Pending',
      notes: '',
      error: ''
    },

    // Deep-link support: /my_task?dist=<distribution_id>
    deepLinkDistId: '',
    deepLinkApplied: false,
    deepLinkScrolled: false,

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

    isSheetJsReady: false,
    loginAlert: {
      open: false,
      overdueCount: 0,
      distributionTitle: '',
      nearestDeadline: ''
    }
  };

  const LOGIN_ALERT_SESSION_KEY = 'mums:my_task:high_priority_login_alert_shown';

  const STATUS_OPTIONS = ['Pending', 'Ongoing', 'Completed', 'With Problem'];

  function normalizeItemStatus(value) {
    const s = String(value == null ? '' : value).trim().toLowerCase();
    if (!s) return 'Pending';
    if (s === 'pending' || s === 'p' || s === 'new') return 'Pending';
    if (s === 'ongoing' || s === 'in progress' || s === 'in_progress') return 'Ongoing';
    if (s === 'completed' || s === 'done' || s === 'complete') return 'Completed';
    if (s === 'with problem' || s === 'with_problem' || s === 'problem') return 'With Problem';
    // Back-compat for legacy uppercase statuses
    if (s === 'pending') return 'Pending';
    if (s === 'ongoing') return 'Ongoing';
    if (s === 'completed') return 'Completed';
    if (s === 'with problem') return 'With Problem';
    return 'Pending';
  }

  function statusClass(label) {
    const s = normalizeItemStatus(label).toLowerCase();
    if (s === 'completed') return 'status-completed';
    if (s === 'ongoing') return 'status-ongoing';
    if (s === 'with problem') return 'status-problem';
    return 'status-pending';
  }

  function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get(name);
    } catch (_) {
      return null;
    }
  }

  function findTaskItem(taskItemId) {
    const id = String(taskItemId || '');
    for (const group of state.assignedGroups) {
      const rows = Array.isArray(group.items) ? group.items : [];
      const hit = rows.find((r) => String(r.id || '') === id);
      if (hit) return { group, item: hit };
    }
    return { group: null, item: null };
  }

  function applyDeepLinkIfNeeded() {
    if (state.deepLinkApplied) return;
    const dist = String(getQueryParam('dist') || '').trim();
    if (!dist) return;
    state.deepLinkApplied = true;
    state.deepLinkDistId = dist;
    state.activeTab = 'assigned';
    state.expandedAssignedId = dist;
  }

  function requestDeepLinkScroll() {
    if (!state.deepLinkDistId || state.deepLinkScrolled) return;
    state.deepLinkScrolled = true;
    setTimeout(() => {
      const el = document.getElementById(`assignedGroup_${state.deepLinkDistId}`);
      if (el && el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { el.scrollIntoView(); }
      }
    }, 50);
  }

  // Allow notifications to expand a distribution without page reload
  const onOpenTaskDistribution = (ev) => {
    try {
      const distId = String(ev && ev.detail ? ev.detail.distribution_id || '' : '');
      if (!distId) return;
      state.activeTab = 'assigned';
      state.expandedAssignedId = distId;
      state.deepLinkDistId = distId;
      state.deepLinkApplied = true;
      state.deepLinkScrolled = false;
      render();
    } catch (_) {
      // no-op
    }
  };
  window.addEventListener('mums:open_task_distribution', onOpenTaskDistribution);

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

  function isDailyAlertsEnabled(value) {
    if (value === true || value === 1) return true;
    const normalized = String(value == null ? '' : value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 't' || normalized === 'yes';
  }

  function isOverdue(value) {
    if (!value) return false;
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
  }

  function computeLoginAlertData() {
    let overdueCount = 0;
    let distributionTitle = '';
    let nearestDeadline = '';
    let nearestMs = Number.POSITIVE_INFINITY;

    state.assignedGroups.forEach((group) => {
      const alertsEnabled = isDailyAlertsEnabled(group && group.enable_daily_alerts);
      if (!alertsEnabled) return;

      const items = Array.isArray(group.items) ? group.items : [];
      items.forEach((item) => {
        const status = normalizeItemStatus(item && item.status);
        const pendingLike = status === 'Pending' || status === 'Ongoing';
        if (!pendingLike) return;

        const deadline = item && (item.deadline || item.deadline_at || item.due_at);
        if (!isOverdue(deadline)) return;

        overdueCount += 1;
        const ms = new Date(deadline).getTime();
        if (ms < nearestMs) {
          nearestMs = ms;
          distributionTitle = safeText(group && group.project_title, 'Untitled Distribution');
          nearestDeadline = safeDate(deadline);
        }
      });
    });

    return { overdueCount, distributionTitle, nearestDeadline };
  }

  function maybeShowLoginAlertOncePerSession() {
    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(LOGIN_ALERT_SESSION_KEY) === '1';
    } catch (_) {
      alreadyShown = false;
    }
    if (alreadyShown) return;

    const info = computeLoginAlertData();
    if (info.overdueCount < 1) return;

    state.loginAlert = {
      open: true,
      overdueCount: info.overdueCount,
      distributionTitle: info.distributionTitle,
      nearestDeadline: info.nearestDeadline
    };

    try { sessionStorage.setItem(LOGIN_ALERT_SESSION_KEY, '1'); } catch (_) { }
  }

  function closeLoginAlertModal() {
    state.loginAlert.open = false;
    render();
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
      /* Base & Existing Styles */
      .task-shell{position:relative;display:flex;flex-direction:column;gap:14px;color:#e2e8f0;}
      .task-header{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
      .task-section{display:flex;flex-direction:column;gap:10px}
      .task-section-title{font-size:15px;font-weight:800;display:flex;align-items:center;gap:6px;color:#f8fafc;}
      .task-card{background:rgba(15,23,42,.7);border-radius:8px;padding:14px;border:1px solid rgba(148,163,184,.14)}
      .task-empty{padding:24px 12px;text-align:center;color:#9ca3af;border:1px dashed rgba(255,255,255,.2);border-radius:8px}
      .task-meta{font-size:12px;color:#9ca3af}
      .task-title{font-size:16px;font-weight:800;line-height:1.3;margin-bottom:4px;color:#f1f5f9;}
      .task-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .task-tab{border:1px solid rgba(148,163,184,.35);border-radius:999px;background:rgba(15,23,42,.45);padding:6px 12px;color:#cbd5e1;cursor:pointer;font-weight:600;transition:all 0.2s;}
      .task-tab:hover{background:rgba(56,189,248,.1);border-color:rgba(56,189,248,.4);}
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

      /* ========================================= */
      /* HIGH LEVEL ENTERPRISE MODAL UI UPGRADE    */
      /* ========================================= */

      /* Custom Scrollbar for Modal */
      .task-modal-glass::-webkit-scrollbar, .glass-table-container::-webkit-scrollbar { width: 6px; height: 6px; }
      .task-modal-glass::-webkit-scrollbar-track, .glass-table-container::-webkit-scrollbar-track { background: transparent; }
      .task-modal-glass::-webkit-scrollbar-thumb, .glass-table-container::-webkit-scrollbar-thumb { background: rgba(148, 163, 184, 0.3); border-radius: 10px; }
      .task-modal-glass::-webkit-scrollbar-thumb:hover, .glass-table-container::-webkit-scrollbar-thumb:hover { background: rgba(148, 163, 184, 0.5); }
      .task-modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.8);backdrop-filter:blur(8px);z-index:14060;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;}

      .task-modal-glass{
        width:min(1000px,100%); max-height:90vh; overflow-y:auto; overflow-x:hidden;
        background:linear-gradient(145deg, rgba(15,23,42,0.95) 0%, rgba(2,6,23,0.98) 100%);
        border:1px solid rgba(148,163,184,.2); border-radius:16px;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1);
        display:flex; flex-direction:column;
      }

      .modal-header-glass {
        padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06);
        display:flex; justify-content:space-between; align-items:center;
        background: rgba(15,23,42,0.6); position:sticky; top:0; z-index:10; backdrop-filter:blur(10px);
      }

      .modal-header-glass h3 { margin:0; font-size:18px; font-weight:800; color:#f8fafc; letter-spacing:-0.5px; display:flex; align-items:center; gap:8px;}

      .glass-card {
        background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
        border-radius: 12px; padding: 20px; margin-bottom: 20px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.02);
      }

      .premium-label { display:block; font-size:12px; font-weight:600; color:#94a3b8; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; }

      .premium-input {
        width:100%; background:rgba(2,6,23,0.5); border:1px solid rgba(148,163,184,0.2);
        border-radius:8px; padding:10px 14px; color:#f8fafc; font-size:14px;
        transition:all 0.2s; outline:none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
      }
      .premium-input:focus { border-color:#38bdf8; box-shadow: 0 0 0 2px rgba(56,189,248,0.2), inset 0 2px 4px rgba(0,0,0,0.2); background:rgba(15,23,42,0.8); }
      .premium-input::placeholder { color:#475569; }

      .premium-checkbox-container {
        display:flex; align-items:center; gap:10px; padding:12px 16px;
        background:rgba(2,6,23,0.4); border:1px solid rgba(148,163,184,0.15); border-radius:8px;
        cursor:pointer; transition:all 0.2s;
      }
      .premium-checkbox-container:hover { border-color:rgba(148,163,184,0.3); background:rgba(15,23,42,0.6); }

      .upload-zone-glass {
        border: 2px dashed rgba(56,189,248,0.3); border-radius: 12px; padding: 30px 20px;
        text-align: center; transition: all 0.3s ease; background: rgba(56,189,248,0.03);
        cursor:pointer; position:relative; overflow:hidden;
      }
      .upload-zone-glass:hover, .upload-zone-glass.drag {
        border-color: #38bdf8; background: rgba(56,189,248,0.08); transform: translateY(-2px);
        box-shadow: 0 10px 25px -5px rgba(56,189,248,0.1);
      }
      .upload-icon { font-size:32px; margin-bottom:12px; opacity:0.8; }

      .glass-table-container { border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; overflow-x: auto; background: rgba(2,6,23,0.4); }
      .glass-table-container table { width:100%; border-collapse:collapse; }
      .glass-table-container th { background: rgba(15,23,42,0.8); color:#cbd5e1; font-weight:600; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; padding:12px; border-bottom:1px solid rgba(255,255,255,0.05); position:sticky; top:0; }
      .glass-table-container td { padding:12px; border-bottom:1px solid rgba(255,255,255,0.02); font-size:13px; vertical-align:middle; }
      .glass-table-container tr:last-child td { border-bottom:none; }
      .glass-table-container tr:hover { background: rgba(255,255,255,0.02); }

      .btn-glass {
        padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px;
        cursor: pointer; transition: all 0.2s; outline: none; border: 1px solid transparent;
      }
      .btn-glass-ghost { background: transparent; color: #94a3b8; border-color: rgba(148,163,184,0.3); }
      .btn-glass-ghost:hover { background: rgba(148,163,184,0.1); color: #f8fafc; }
      .btn-glass-primary { background: #0ea5e9; color: #fff; box-shadow: 0 4px 12px rgba(14,165,233,0.3); }
      .btn-glass-primary:hover:not(:disabled) { background: #0284c7; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(14,165,233,0.4); }
      .btn-glass-primary:disabled { background: rgba(14,165,233,0.4); color: rgba(255,255,255,0.5); cursor: not-allowed; box-shadow:none; }
      .task-invalid{background:rgba(239,68,68,.1) !important; border-left:3px solid #ef4444;}
      .task-status-select{width:max-content;max-width:220px;padding:6px 10px;border-radius:999px;font-weight:800;font-size:12px;border:1px solid rgba(148,163,184,.28);background:rgba(15,23,42,.55);color:#e2e8f0;outline:none}
      .task-status-select:disabled{opacity:.65;cursor:not-allowed}
      .task-status-select.status-pending{border-color:rgba(245,158,11,.55);background:rgba(245,158,11,.14);color:#fde68a}
      .task-status-select.status-ongoing{border-color:rgba(59,130,246,.55);background:rgba(59,130,246,.14);color:#bfdbfe}
      .task-status-select.status-completed{border-color:rgba(16,185,129,.55);background:rgba(16,185,129,.14);color:#a7f3d0}
      .task-status-select.status-problem{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.14);color:#fecaca}
      .task-problem-notes{font-size:12px;color:#fecaca;line-height:1.3;word-break:break-word;opacity:.95}
      .task-modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
      .task-modal-error{font-size:12px;color:#fecaca;background:rgba(239,68,68,.14);border:1px solid rgba(239,68,68,.25);padding:10px 12px;border-radius:8px}
      .login-alert-modal{width:min(560px,96vw);max-height:calc(100vh - 150px);overflow:auto;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(30,41,59,.9));backdrop-filter:blur(14px);border:1px solid rgba(248,113,113,.36);box-shadow:0 18px 48px rgba(2,6,23,.6);border-radius:14px;padding:18px;color:#f8fafc;display:flex;flex-direction:column;gap:12px}
      .login-alert-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(239,68,68,.2);border:1px solid rgba(248,113,113,.45);color:#fecaca;font-size:12px;font-weight:800;width:max-content}
      .login-alert-summary{font-size:13px;color:#cbd5e1;line-height:1.45;background:rgba(15,23,42,.58);border:1px solid rgba(248,113,113,.24);border-radius:10px;padding:10px 12px}
      .login-alert-actions{display:flex;justify-content:flex-end}
      @keyframes taskSpin{to{transform:rotate(360deg)}}
`;
    document.head.appendChild(style);
  }


  function renderModal() {
    const unresolved = unresolvedRowsCount();
    return `
      <div class="task-modal-backdrop" id="distributionModalBackdrop">
        <div class="task-modal-glass" role="dialog" aria-modal="true" aria-label="Create Distribution">
          <div class="modal-header-glass">
            <h3>✨ Create New Distribution</h3>
            <button class="btn-glass btn-glass-ghost" type="button" id="closeDistributionModal" style="padding:6px 12px;">✕ Close</button>
          </div>
          <div style="padding: 24px;">
            <div class="glass-card">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                <div style="background:#0ea5e9; color:#fff; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold;">1</div>
                <div class="task-title" style="margin:0;">Project Metadata</div>
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                <div style="grid-column: 1 / -1;">
                  <label class="premium-label" for="distTitleInput">Project Title <span style="color:#ef4444">*</span></label>
                  <input class="premium-input" id="distTitleInput" type="text" value="${esc(state.form.title)}" placeholder="e.g. Q3 Custom Screen Remapping" autocomplete="off" />
                </div>

                <div style="grid-column: 1 / -1;">
                  <label class="premium-label" for="distDescriptionInput">Global Description</label>
                  <textarea class="premium-input" id="distDescriptionInput" rows="2" placeholder="Provide context or instructions for the whole batch...">${esc(state.form.description)}</textarea>
                </div>

                <div style="grid-column: 1 / -1;">
                  <label class="premium-label" for="distReferenceInput">Work Instruction URL</label>
                  <input class="premium-input" id="distReferenceInput" type="url" value="${esc(state.form.reference_url)}" placeholder="https://confluence.yourcompany.com/..." autocomplete="off" />
                </div>
              </div>
              <label class="premium-checkbox-container" style="margin-top:16px;">
                <input id="distEnableDailyAlerts" type="checkbox" ${state.form.enable_daily_alerts ? 'checked' : ''} style="width:18px; height:18px; accent-color:#0ea5e9;" />
                <div>
                  <div style="font-size:14px; font-weight:600; color:#e2e8f0;">Enable Daily Reminders</div>
                  <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Automated notifications for incomplete tasks (Phase 4 Automation)</div>
                </div>
              </label>
            </div>
            <div class="glass-card" style="margin-bottom:0;">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <div style="background:#0ea5e9; color:#fff; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold;">2</div>
                <div class="task-title" style="margin:0;">Enterprise Data Ingestion</div>
              </div>
              <div class="task-meta" style="margin-bottom:16px; margin-left:34px;">Upload any structured Excel/CSV file. The system will dynamically pack columns into the payload.</div>

              <div id="uploadZone" class="upload-zone-glass ${state.dragActive ? 'drag' : ''}">
                <div class="upload-icon">📊</div>
                <div style="font-weight:700;font-size:16px; color:#e2e8f0;">Drag & Drop your dataset here</div>
                <div class="task-meta" style="margin:6px 0 16px 0;">Supports .xlsx, .xls, .csv</div>

                <label class="btn-glass btn-glass-primary" style="display:inline-block; cursor:pointer;">
                  Browse Files
                  <input type="file" id="taskFileInput" accept=".xlsx,.xls,.csv" style="display:none;" />
                </label>

                <div class="task-meta" style="margin-top:12px; color:#38bdf8; font-weight:600;">
                  ${esc(state.uploadMeta.name ? `📄 ${state.uploadMeta.name} • ${state.uploadMeta.rows} rows detected` : '')}
                </div>
                ${state.parseError ? `<div style="color:#ef4444;margin-top:8px;font-size:13px;font-weight:bold;background:rgba(239,68,68,0.1);padding:6px;border-radius:4px;">⚠️ ${esc(state.parseError)}</div>` : ''}
              </div>
              <div class="glass-table-container" style="margin-top:20px; max-height:350px;">
                <table>
                  <thead>
                    <tr>
                      <th>Task Reference & Data Summary</th>
                      <th style="width:220px;">Assignee Matching</th>
                      <th style="width:100px; text-align:center;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${state.parsedRows.map((row, idx) => {
                      const invalid = !row.assigned_to;
                      return `
                        <tr class="${invalid ? 'task-invalid' : ''}">
                          <td>
                            <div style="font-weight:700; color:#f8fafc; font-size:14px; margin-bottom:4px;">${esc(safeText(row.case_number, 'N/A'))}</div>
                            <div class="task-meta" style="font-size:11px; max-width:400px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(row.description)}">
                              <span style="color:#38bdf8; opacity:0.8;">Payload:</span> ${esc(row.description)}
                            </div>
                          </td>
                          <td>
                            <div style="font-weight:600; font-size:12px; color:${invalid ? '#ef4444' : '#94a3b8'}; margin-bottom:4px;">
                              Extracted: "${esc(safeText(row.assigned_name, 'Unknown'))}"
                            </div>
                            <select class="premium-input" data-assignee-fix="${idx}" style="padding:6px; font-size:12px; background:rgba(15,23,42,0.8);">
                              <option value="">-- Resolve Member --</option>
                              ${state.members.map((m) => `<option value="${esc(m.user_id)}" ${String(row.assigned_to) === String(m.user_id) ? 'selected' : ''}>${esc(m.name || m.username || m.user_id)}</option>`).join('')}
                            </select>
                          </td>
                          <td style="text-align:center;">
                            ${invalid
                              ? '<div style="background:rgba(239,68,68,0.2); color:#fca5a5; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; border:1px solid rgba(239,68,68,0.3);">NEEDS FIX</div>'
                              : '<div style="background:rgba(34,197,94,0.2); color:#86efac; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:700; border:1px solid rgba(34,197,94,0.3);">READY</div>'}
                          </td>
                        </tr>
                      `;
                    }).join('') || '<tr><td colspan="3" class="task-meta" style="text-align:center; padding:30px;">Drop a file above to generate the data mapping preview.</td></tr>'}
                  </tbody>
                </table>
              </div>

              ${unresolved > 0 ? `
                <div style="display:flex; align-items:center; gap:8px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:8px; padding:10px 14px; margin-top:16px;">
                  <span style="font-size:18px;">⚠️</span>
                  <div style="color:#fcd34d; font-size:13px; font-weight:600;">Action Required: Please resolve ${esc(unresolved)} unmatched member(s) to enable submission.</div>
                </div>
              ` : ''}

            </div>
          </div>
          <div class="modal-header-glass" style="border-top: 1px solid rgba(255,255,255,0.06); border-bottom:none; justify-content:space-between; top:auto; bottom:0;">
            <div class="task-meta">
              ${state.parsedRows.length > 0 && unresolved === 0 ? `<span style="color:#86efac; font-weight:700;">✓ Ready to deploy ${state.parsedRows.length} tasks</span>` : 'Complete all fields to continue'}
            </div>
            <div style="display:flex; gap:12px;">
              <button class="btn-glass btn-glass-ghost" type="button" id="cancelDistributionCreate">Cancel</button>
              <button class="btn-glass btn-glass-primary" type="button" id="submitDistribution" style="padding:8px 24px;" ${state.creating || unresolved > 0 || !state.parsedRows.length || !state.form.title.trim() ? 'disabled' : ''}>
                ${state.creating ? 'Deploying...' : 'Launch Distribution 🚀'}
              </button>
            </div>
          </div>
        </div>
      </div>
`;
  }


  function renderProblemModal() {
    const taskItemId = String(state.problemModal.taskItemId || '');
    const { item } = findTaskItem(taskItemId);
    const title = item ? `Report a Problem — Case ${safeText(item.case_number || item.case_no, 'N/A')}` : 'Report a Problem';
    const subtitle = item ? safeText(item.site, '') : '';
    const err = String(state.problemModal.error || '').trim();
    const notes = String(state.problemModal.notes || '');

    return `
      <div class="task-modal-backdrop" id="problemModalBackdrop">
        <div class="task-modal" role="dialog" aria-modal="true" aria-label="With Problem Notes">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div>
              <h3 style="margin:0">${esc(title)}</h3>
              ${subtitle ? `<div class="task-meta">${esc(subtitle)}</div>` : ''}
            </div>
            <button class="task-btn task-btn-ghost" type="button" id="problemModalClose">Close</button>
          </div>

          <div style="margin-top:10px">
            <div class="task-meta" style="margin-bottom:8px">Status “With Problem” requires notes before it can be saved.</div>
            <textarea id="problemModalNotes" rows="4" placeholder="Enter the reason / problem details…" style="width:100%;resize:vertical">${esc(notes)}</textarea>
            ${err ? `<div class="task-modal-error" style="margin-top:10px">${esc(err)}</div>` : ''}
          </div>

          <div class="task-modal-actions" style="margin-top:14px">
            <button class="task-btn task-btn-ghost" type="button" id="problemModalCancel">Cancel</button>
            <button class="task-btn task-btn-primary" type="button" id="problemModalSave">Save</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLoginAlertModal() {
    const info = state.loginAlert || {};
    return `
      <div class="task-modal-backdrop" id="loginAlertBackdrop">
        <div class="login-alert-modal" role="dialog" aria-modal="true" aria-label="High Priority Login Alert">
          <div class="login-alert-pill">⚠️ High Priority Login Alert</div>
          <div style="font-size:22px;font-weight:900;line-height:1.2">Overdue tasks require immediate action</div>
          <div class="login-alert-summary">
            You have <strong>${esc(String(info.overdueCount || 0))}</strong> overdue task(s) in Pending/Ongoing status with daily alerts enabled.
            ${info.distributionTitle ? `<div style="margin-top:8px"><strong>Distribution:</strong> ${esc(info.distributionTitle)}</div>` : ''}
            ${info.nearestDeadline ? `<div style="margin-top:4px"><strong>Oldest deadline:</strong> ${esc(info.nearestDeadline)}</div>` : ''}
          </div>
          <div class="task-meta">Please update progress or resolve blockers to prevent escalation.</div>
          <div class="login-alert-actions">
            <button class="task-btn task-btn-primary" type="button" id="loginAlertAcknowledge">Acknowledge</button>
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
        ${state.problemModal && state.problemModal.open ? renderProblemModal() : ''}
        ${state.loginAlert && state.loginAlert.open ? renderLoginAlertModal() : ''}
      </section>
    `;

    bindEvents();
    requestDeepLinkScroll();
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

  function buildParsedRows(dataRows, detection, headers) {
    return dataRows.map((row) => {
      const values = Array.isArray(row) ? row : [];
      const safeHeaders = Array.isArray(headers) ? headers : [];
      let assigneeName = '';
      if (detection.assigneeColumnIndex >= 0) assigneeName = String(values[detection.assigneeColumnIndex] || '').trim();

      let site = 'N/A';
      if (detection.siteColumnIndex >= 0) site = safeText(values[detection.siteColumnIndex], 'N/A');

      const details = [];
      let primaryReference = 'N/A';
      let foundPrimary = false;

      safeHeaders.forEach((header, idx) => {
        const val = String(values[idx] || '').trim();
        if (!val) return;
        details.push(`${safeText(header, `Column ${idx + 1}`)}: ${val}`);
        if (!foundPrimary && idx !== detection.assigneeColumnIndex && idx !== detection.siteColumnIndex) {
          primaryReference = val;
          foundPrimary = true;
        }
      });

      const compiledDesc = details.join(' | ');
      const match = guessMember(assigneeName);

      return {
        case_number: primaryReference,
        site,
        description: compiledDesc,
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
      state.parsedRows = buildParsedRows(split.rows, detection, split.headers);
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

    maybeShowLoginAlertOncePerSession();

    // Apply /my_task?dist=<distribution_id> deep-link once base data is available.
    applyDeepLinkIfNeeded();

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

    if (state.loginAlert && state.loginAlert.open) {
      const backdrop = root.querySelector('#loginAlertBackdrop');
      const acknowledgeBtn = root.querySelector('#loginAlertAcknowledge');
      if (backdrop) {
        backdrop.onclick = (event) => {
          if (event.target === backdrop) closeLoginAlertModal();
        };
      }
      if (acknowledgeBtn) acknowledgeBtn.onclick = closeLoginAlertModal;
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

    // --- Phase 2: Interactive status controls (My Assigned Tasks) ---
    root.querySelectorAll('[data-item-status]').forEach((selectEl) => {
      selectEl.onchange = async () => {
        const taskItemId = String(selectEl.getAttribute('data-item-status') || '');
        if (!taskItemId) return;
        const next = normalizeItemStatus(selectEl.value);
        const { item } = findTaskItem(taskItemId);
        if (!item) {
          UI && UI.toast && UI.toast('Task item not found.', 'danger');
          return;
        }

        const prev = normalizeItemStatus(item.status);
        if (next === prev) return;

        // With Problem requires notes (modal).
        if (next === 'With Problem') {
          state.pendingStatusByItemId[taskItemId] = 'With Problem';
          state.problemModal = {
            open: true,
            taskItemId,
            prevStatus: prev,
            notes: String(item.problem_notes || ''),
            error: ''
          };
          render();
          return;
        }

        // Normal status update
        state.savingStatusByItemId[taskItemId] = true;
        state.pendingStatusByItemId[taskItemId] = next;
        render();

        const out = await CloudTasks.updateItemStatus({ task_item_id: taskItemId, status: next });
        if (!out.ok) {
          delete state.pendingStatusByItemId[taskItemId];
          delete state.savingStatusByItemId[taskItemId];
          render();
          UI && UI.toast && UI.toast(out.message || 'Failed to update status.', 'danger');
          return;
        }

        item.status = next;
        item.problem_notes = null;
        delete state.pendingStatusByItemId[taskItemId];
        delete state.savingStatusByItemId[taskItemId];
        render();
      };
    });

    // Problem notes modal
    if (state.problemModal && state.problemModal.open) {
      const backdrop = root.querySelector('#problemModalBackdrop');
      const cancelBtn = root.querySelector('#problemModalCancel');
      const closeBtn = root.querySelector('#problemModalClose');
      const saveBtn = root.querySelector('#problemModalSave');
      const notesEl = root.querySelector('#problemModalNotes');

      const cancel = () => {
        const taskItemId = String(state.problemModal.taskItemId || '');
        if (taskItemId) delete state.pendingStatusByItemId[taskItemId];
        state.problemModal = { open: false, taskItemId: '', prevStatus: 'Pending', notes: '', error: '' };
        render();
      };

      if (backdrop) {
        backdrop.onclick = (event) => {
          // Treat close/backdrop as cancel.
          if (event.target === backdrop) cancel();
        };
      }
      if (cancelBtn) cancelBtn.onclick = cancel;
      if (closeBtn) closeBtn.onclick = cancel;
      if (notesEl) {
        notesEl.oninput = () => {
          state.problemModal.notes = String(notesEl.value || '');
          const btn = root.querySelector('#problemModalSave');
          if (btn) btn.disabled = !String(state.problemModal.notes || '').trim();
        };
      }
      if (saveBtn) {
        saveBtn.disabled = !String(state.problemModal.notes || '').trim();
        saveBtn.onclick = async () => {
          const taskItemId = String(state.problemModal.taskItemId || '');
          const notes = String(state.problemModal.notes || '').trim();
          if (!taskItemId) return cancel();
          if (!notes) {
            state.problemModal.error = 'Notes are required for “With Problem”.';
            try{ UI && UI.toast && UI.toast(state.problemModal.error, 'danger'); }catch(_){ }
            render();
            return;
          }
          const { item } = findTaskItem(taskItemId);
          if (!item) return cancel();

          state.savingStatusByItemId[taskItemId] = true;
          render();
          const out = await CloudTasks.updateItemStatus({ task_item_id: taskItemId, status: 'With Problem', problem_notes: notes });
          if (!out.ok) {
            state.problemModal.error = out.message || 'Failed to update status.';
            try{ UI && UI.toast && UI.toast(state.problemModal.error, 'danger'); }catch(_){ }
            delete state.savingStatusByItemId[taskItemId];
            render();
            return;
          }

          item.status = 'With Problem';
          item.problem_notes = notes;
          delete state.pendingStatusByItemId[taskItemId];
          delete state.savingStatusByItemId[taskItemId];
          state.problemModal = { open: false, taskItemId: '', prevStatus: 'Pending', notes: '', error: '' };
          render();
        };
      }
    }

    if (!state.modalOpen) return;

    const closeBtn = root.querySelector('#closeDistributionModal');
    const cancelBtn = root.querySelector('#cancelDistributionCreate');
    const backdrop = root.querySelector('#distributionModalBackdrop');

    if (backdrop) {
      backdrop.onclick = () => {
        // Intentionally disabled: backdrop clicks must not close this data-entry modal.
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

        const modalEl = root.querySelector('.task-modal');
        const gridEl = root.querySelector('.task-modal .task-grid');
        const modalScrollTop = modalEl ? modalEl.scrollTop : 0;
        const gridScrollTop = gridEl ? gridEl.scrollTop : 0;

        state.parsedRows[idx].assigned_to = String(select.value || '');
        render();

        requestAnimationFrame(() => {
          const rebuiltModalEl = root.querySelector('.task-modal');
          const rebuiltGridEl = root.querySelector('.task-modal .task-grid');
          if (rebuiltModalEl) rebuiltModalEl.scrollTop = modalScrollTop;
          if (rebuiltGridEl) rebuiltGridEl.scrollTop = gridScrollTop;
        });
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
            description: row.description || '',
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
