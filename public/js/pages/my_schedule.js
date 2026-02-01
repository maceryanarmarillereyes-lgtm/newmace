(window.Pages = window.Pages || {}, window.Pages.my_schedule = function (root) {
  // ---------------------------------------------------------------------------
  // My Schedule — Enterprise Weekly/Daily Calendar (13126-08)
  // - Clean grid calendar aligned to team shift ruler
  // - Weekly + Daily views
  // - TEAM TASK color coding with badges
  // - Tooltip (task/time/audit), WCAG focus rings, mobile swipe day nav
  // ---------------------------------------------------------------------------

  const UI = window.UI || {};
  const Store = window.Store || {};
  const Auth = window.Auth || {};
  const Config = window.Config || {};

  const esc = UI.esc || function (s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\'/g, '&#39;');
  };

  const DAYS = UI.DAYS || ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tzManila = (Config && Config.TZ) || 'Asia/Manila';
  const localTZ = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'; } catch (_) { return 'Local'; }
  })();

  const me = (Auth.getUser ? (Auth.getUser() || {}) : {});
  const role = String(me.role || '');
  const ROLES = (Config.ROLES || {});
  const isSA = role === (ROLES.SUPER_ADMIN || 'SUPER_ADMIN');
  const isAdmin = isSA || role === (ROLES.ADMIN || 'ADMIN') || role === (ROLES.SUPER_USER || 'SUPER_USER');
  const isLead = role === (ROLES.TEAM_LEAD || 'TEAM_LEAD');

  const canEditSelf = isAdmin || isLead;

  const parseHM = UI.parseHM || function (hm) {
    const m = String(hm || '00:00').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    const hh = Math.max(0, Math.min(23, Number(m[1]) || 0));
    const mm = Math.max(0, Math.min(59, Number(m[2]) || 0));
    return hh * 60 + mm;
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const hm = (mins) => {
    const m = ((Number(mins) || 0) % (24 * 60) + (24 * 60)) % (24 * 60);
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  };

  const addDaysISO = UI.addDaysISO || function (iso, delta) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (Number(delta) || 0));
    return d.toISOString().slice(0, 10);
  };

  const weekdayFromISO = UI.weekdayFromISO || function (iso) {
    // iso assumed Manila date; using UTC as stable mapping (good enough for day index)
    const d = new Date(`${iso}T00:00:00Z`);
    return d.getUTCDay();
  };

  const manilaTodayISO = UI.manilaTodayISO || function () {
    // Best-effort: use browser date; Manila may differ near midnight for non-UTC+8
    return new Date().toISOString().slice(0, 10);
  };

  function getTeam() {
    try {
      if (Config.teamById && me.teamId != null) return Config.teamById(me.teamId) || null;
    } catch (_) { }
    return null;
  }

  function inferTeamShift(team) {
    // Returns { startMin, endMin, lenMin, wraps, startHM, endHM }
    const teamId = String(me.teamId || (team && team.id) || '').toLowerCase();
    let startHM = (team && team.teamStart) ? String(team.teamStart) : '';
    let endHM = (team && team.teamEnd) ? String(team.teamEnd) : '';

    // Fallback defaults by shift key
    if (!startHM || !endHM) {
      if (teamId === 'morning') { startHM = '06:00'; endHM = '15:00'; }
      else if (teamId === 'mid') { startHM = '15:00'; endHM = '23:00'; }
      else if (teamId === 'night') { startHM = '23:00'; endHM = '06:00'; }
      else { startHM = '06:00'; endHM = '15:00'; }
    }

    const startMin = parseHM(startHM);
    const endMin = parseHM(endHM);
    const wraps = endMin <= startMin;
    const lenMin = wraps ? ((24 * 60) - startMin + endMin) : (endMin - startMin);
    return { startMin, endMin, lenMin: Math.max(60, lenMin), wraps, startHM, endHM };
  }

  function shiftKey() {
    const t = String(me.teamId || '').toLowerCase();
    if (t === 'morning' || t === 'mid' || t === 'night') return t;
    const label = String((Config.teamLabel && me.teamId != null) ? Config.teamLabel(me.teamId) : '').toLowerCase();
    if (label.includes('morning')) return 'morning';
    if (label.includes('mid')) return 'mid';
    if (label.includes('night')) return 'night';
    return 'mid';
  }

  const DEFAULT_TASK_COLORS = {
    'mailbox manager': '#4aa3ff',
    'back office': '#ffa21a',
    'call available': '#2ecc71',
    'lunch': '#22d3ee',
  };

  function getTeamTasks() {
    try {
      if (Store.getTeamTasks && me.teamId != null) return Store.getTeamTasks(me.teamId) || [];
    } catch (_) { }
    return [];
  }

  function taskLabel(taskId) {
    const tasks = getTeamTasks();
    const hit = tasks.find(t => t && String(t.id) === String(taskId));
    if (hit && hit.label) return String(hit.label);
    const cs = (Config.SCHEDULES && Config.SCHEDULES[String(taskId)]) ? Config.SCHEDULES[String(taskId)] : null;
    if (cs && cs.label) return String(cs.label);
    return String(taskId || '');
  }

  function taskColor(taskId) {
    try {
      if (Store.getTeamTaskColor && me.teamId != null) {
        const c = Store.getTeamTaskColor(me.teamId, taskId);
        if (c) return String(c);
      }
    } catch (_) { }
    const label = taskLabel(taskId).toLowerCase();
    if (DEFAULT_TASK_COLORS[label]) return DEFAULT_TASK_COLORS[label];
    // Secondary: match substrings (for legacy labels)
    if (label.includes('mailbox')) return DEFAULT_TASK_COLORS['mailbox manager'];
    if (label.includes('back')) return DEFAULT_TASK_COLORS['back office'];
    if (label.includes('call')) return DEFAULT_TASK_COLORS['call available'];
    if (label.includes('lunch')) return DEFAULT_TASK_COLORS['lunch'];
    return '';
  }

  function hexToRgb(hex) {
    const h = String(hex || '').trim();
    const m = h.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function taskVars(colorHex) {
    const rgb = hexToRgb(colorHex);
    if (!rgb) {
      return { color: '', bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.12)', text: 'rgba(255,255,255,.92)' };
    }
    return {
      color: colorHex,
      bg: `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`,
      border: `rgba(${rgb.r},${rgb.g},${rgb.b},0.35)`,
      text: '#081018', // these palette colors are light; dark text is readable
    };
  }

  function getBlocks(dayIdx) {
    try {
      if (Store.getUserDayBlocks && me.id != null) return (Store.getUserDayBlocks(me.id, dayIdx) || []).slice();
    } catch (_) { }
    return [];
  }

  function normalizeBlock(b) {
    const o = Object.assign({}, b || {});
    o.start = String(o.start || '00:00');
    o.end = String(o.end || '00:00');
    o.schedule = String(o.schedule || o.role || o.label || '');
    o.notes = (o.notes == null) ? '' : String(o.notes);
    return o;
  }

  // Week range (Sun..Sat) based on Manila date
  const todayISO = manilaTodayISO();
  const todayWD = weekdayFromISO(todayISO);
  const weekStartSunISO = addDaysISO(todayISO, -todayWD);
  const isoForDay = (d) => addDaysISO(weekStartSunISO, d);

  // State
  let viewMode = (function () {
    try {
      const v = localStorage.getItem('mums_sched_view');
      if (v === 'week' || v === 'day') return v;
    } catch (_) { }
    return (window.innerWidth <= 720) ? 'day' : 'week';
  })();
  let focusDay = todayWD;
  let tickTimer = null;
  let storeListener = null;

  function setViewMode(mode) {
    viewMode = (mode === 'day') ? 'day' : 'week';
    try { localStorage.setItem('mums_sched_view', viewMode); } catch (_) { }
    render();
  }

  function setFocusDay(d) {
    focusDay = Math.max(0, Math.min(6, Number(d) || 0));
    render();
  }

  // Time conversion: Manila schedule times -> local display label
  function localTimeLabel(isoDate, hmStr) {
    try {
      if (!UI.parseManilaDateTimeLocal) return '';
      const ms = UI.parseManilaDateTimeLocal(`${isoDate}T${hmStr}`);
      if (!ms) return '';
      return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  function localRangeLabel(isoDate, startHM, endHM, shift) {
    try {
      const sMin = parseHM(startHM);
      const eMin = parseHM(endHM);
      const wraps = eMin <= sMin;
      const a = localTimeLabel(isoDate, startHM);
      const b = localTimeLabel(wraps ? addDaysISO(isoDate, 1) : isoDate, endHM);
      if (!a || !b) return '';
      return `${a}–${b}`;
    } catch (_) { return ''; }
  }

  function computeOffset(shift, hmStr) {
    const m = parseHM(hmStr);
    let off = m - shift.startMin;
    if (off < 0) off += (24 * 60);
    return off;
  }

  function blockMetrics(shift, b) {
    const startOff = Math.max(0, Math.min(shift.lenMin, computeOffset(shift, b.start)));
    let endOff = computeOffset(shift, b.end);
    // If end is before start (relative), assume wrap within shift window
    if (endOff <= startOff) endOff += (24 * 60);
    endOff = Math.max(0, Math.min(shift.lenMin, endOff));
    let dur = endOff - startOff;
    if (dur <= 0) dur = Math.min(15, shift.lenMin);
    const top = (startOff / shift.lenMin) * 100;
    const height = Math.max(2.8, (dur / shift.lenMin) * 100);
    return { top, height, dur, startOff };
  }

  function nowManilaParts() {
    try { return UI.manilaNow ? UI.manilaNow() : null; } catch (_) { return null; }
  }

  function computeCountdown(shift) {
    // Determine active/next block for today
    const parts = nowManilaParts() || { isoDate: todayISO, hh: new Date().getHours(), mm: new Date().getMinutes() };
    const nowMin = (Number(parts.hh) || 0) * 60 + (Number(parts.mm) || 0);
    const wd = weekdayFromISO(parts.isoDate || todayISO);
    const blocks = getBlocks(wd).map(normalizeBlock).sort((a, b) => parseHM(a.start) - parseHM(b.start));
    if (!blocks.length) return { label: '—', active: null, next: null, wd, isoDate: parts.isoDate || todayISO, blocks };

    const inBlock = (b) => {
      const s = parseHM(b.start);
      const e = parseHM(b.end);
      if (e > s) return nowMin >= s && nowMin < e;
      return (nowMin >= s) || (nowMin < e);
    };

    const active = blocks.find(inBlock) || null;
    const after = blocks.filter(b => parseHM(b.start) > nowMin);
    const next = after[0] || (active ? null : blocks[0] || null);

    let label = '—';
    try {
      const nowMs = Date.now();
      const fmt = (sec) => (UI.formatDuration ? UI.formatDuration(sec) : `${Math.round(sec / 60)}m`);
      if (active && UI.parseManilaDateTimeLocal) {
        const eMin = parseHM(active.end);
        const sMin = parseHM(active.start);
        const wraps = eMin <= sMin;
        const endISO = wraps && nowMin >= sMin ? addDaysISO(parts.isoDate, 1) : parts.isoDate;
        const endMs = UI.parseManilaDateTimeLocal(`${endISO}T${active.end}`);
        const left = Math.max(0, Math.floor((endMs - nowMs) / 1000));
        label = `Ends in ${fmt(left)}`;
      } else if (next && UI.parseManilaDateTimeLocal) {
        const nMin = parseHM(next.start);
        const startISO = (nMin < nowMin) ? addDaysISO(parts.isoDate, 1) : parts.isoDate;
        const startMs = UI.parseManilaDateTimeLocal(`${startISO}T${next.start}`);
        const left = Math.max(0, Math.floor((startMs - nowMs) / 1000));
        label = `Starts in ${fmt(left)}`;
      }
    } catch (_) { }

    return { label, active, next, wd, isoDate: parts.isoDate || todayISO, blocks };
  }

  function currentWeekStartMondayISO() {
    // Used for audit lookups (existing convention)
    const wd = weekdayFromISO(todayISO);
    const delta = (wd === 0) ? -6 : (1 - wd);
    return addDaysISO(todayISO, delta);
  }

  function findAuditForBlock(dayIdx, b) {
    try {
      if (!Store.getWeekAudit) return null;
      const weekStartISO = currentWeekStartMondayISO();
      const list = Store.getWeekAudit(me.teamId || '', weekStartISO) || [];
      if (!list.length) return null;
      const needle = `${b.start}-${b.end}`;
      const dayName = DAYS[dayIdx] || String(dayIdx);
      const hit = list.find(a => a && a.targetId === me.id && String(a.detail || '').includes(needle) && String(a.detail || '').includes(dayName));
      return hit || null;
    } catch (_) { return null; }
  }

  function render() {
    const host = root || document.getElementById('main') || document.body;
    const team = getTeam();
    const teamLabel = (Config.teamLabel && me.teamId != null) ? Config.teamLabel(me.teamId) : (team ? (team.label || team.id) : (me.teamId || '—'));
    const shift = inferTeamShift(team);
    const sk = shiftKey();

    const week = Array.from({ length: 7 }, (_, d) => {
      const iso = isoForDay(d);
      const blocks = getBlocks(d).map(normalizeBlock).sort((a, b) => parseHM(a.start) - parseHM(b.start));
      return { dayIdx: d, iso, dayLabel: DAYS[d], blocks };
    });

    const mode = viewMode;
    const visibleDays = (mode === 'day') ? [week[focusDay]] : week;
    const countdown = computeCountdown(shift);

    const localStrip = (localTZ && localTZ !== tzManila)
      ? `Local: <b>${esc(localTZ)}</b> • Manila: <b>${esc(tzManila)}</b>`
      : `Timezone: <b>${esc(tzManila)}</b>`;

    const totalWeekBlocks = week.reduce((n, d) => n + d.blocks.length, 0);
    const todayBlocks = week[todayWD] ? week[todayWD].blocks : [];

    host.innerHTML = `
      <div class="schx" data-shift="${esc(sk)}">
        <div class="schx-header">
          <div>
            <div class="ux-h1">My Schedule</div>
            <div class="small muted">${esc(todayISO)} • ${esc(DAYS[todayWD] || '')} • ${localStrip}</div>
          </div>
          <div class="schx-actions">
            <div class="schx-toggle" role="tablist" aria-label="Schedule view">
              <button class="btn ghost small ${mode === 'week' ? 'active' : ''}" type="button" data-view="week" role="tab" aria-selected="${mode === 'week'}">Weekly</button>
              <button class="btn ghost small ${mode === 'day' ? 'active' : ''}" type="button" data-view="day" role="tab" aria-selected="${mode === 'day'}">Daily</button>
            </div>
            <span class="ux-chip"><span class="dot"></span>${esc(role || '')}${teamLabel ? ` • ${esc(teamLabel)}` : ''}</span>
            <a class="btn" href="/my_attendance">Attendance</a>
            <a class="btn" href="/mailbox">Mailbox</a>
          </div>
        </div>

        <div class="schx-kpis">
          <div class="schx-kpi">
            <div class="small muted">Shift</div>
            <div class="big">${esc(teamLabel || '—')}</div>
            <div class="small muted">${esc(shift.startHM)}–${esc(shift.endHM)}</div>
          </div>
          <div class="schx-kpi">
            <div class="small muted">Today</div>
            <div class="big">${todayBlocks.length} block${todayBlocks.length === 1 ? '' : 's'}</div>
            <div class="small muted">${countdown.active ? `Active: ${esc(taskLabel(countdown.active.schedule))}` : (todayBlocks.length ? 'No active block' : 'No blocks')}</div>
          </div>
          <div class="schx-kpi">
            <div class="small muted">Countdown</div>
            <div class="big" id="schxCountdown">${esc(countdown.label)}</div>
            <div class="small muted">Auto-updates in real time</div>
          </div>
          <div class="schx-kpi">
            <div class="small muted">This week</div>
            <div class="big">${totalWeekBlocks} total</div>
            <div class="small muted">${esc(weekStartSunISO)} → ${esc(isoForDay(6))}</div>
          </div>
        </div>

        ${mode === 'day' ? renderDailyControls(week) : ''}

        <div class="schx-cal" aria-label="Schedule calendar">
          <div class="schx-grid" style="--shift-len:${shift.lenMin}">
            <div class="schx-ruler" aria-hidden="true">
              ${renderRuler(shift)}
            </div>

            <div class="schx-cols ${mode === 'day' ? 'day' : 'week'}" id="schxCols" aria-label="${mode === 'day' ? 'Daily calendar' : 'Weekly calendar'}">
              ${visibleDays.map(d => renderDay(d, shift)).join('')}
            </div>
          </div>

          <div class="schx-foot">
            <div class="small muted">Tip: ${mode === 'day' ? 'Swipe left/right to change day.' : 'On smaller screens, switch to Daily view for maximum readability.'}</div>
            <div class="ux-row" style="justify-content:flex-end">
              <a class="btn" href="/master_schedule">Master Schedule</a>
              ${canEditSelf ? '<a class="btn" href="/members">Edit Team Schedules</a>' : ''}
            </div>
          </div>
        </div>

        <details class="schx-audit" style="margin-top:14px">
          <summary class="mysx-summary">Audit trail (best-effort)</summary>
          <div class="small muted" style="margin-top:10px">Shows the latest schedule audit events recorded for this week (Team Lead actions).</div>
          <div style="margin-top:10px">${renderAuditList()}</div>
        </details>

        <div id="schxTooltip" class="mysx-tooltip" role="tooltip" aria-hidden="true"></div>
      </div>
    `;

    bindViewToggle(host);
    bindDayTabs(host);
    bindTooltip(host);
    bindSwipe(host);
    startTickLoop(host, shift);
  }

  function renderDailyControls(week) {
    return `
      <div class="schx-daytabs" role="tablist" aria-label="Daily focus day">
        ${week.map(d => {
          const active = d.dayIdx === focusDay ? 'active' : '';
          const dot = d.blocks.length ? '<span class="dot" aria-hidden="true"></span>' : '';
          return `<button class="schx-daytab ${active}" type="button" data-day="${d.dayIdx}" role="tab" aria-selected="${d.dayIdx === focusDay}">${esc(d.dayLabel.slice(0, 3))}${dot}</button>`;
        }).join('')}
      </div>
    `;
  }

  function renderRuler(shift) {
    // Hour ticks within shift range
    const ticks = [];
    const step = 60;
    const count = Math.floor(shift.lenMin / step);
    for (let i = 0; i <= count; i++) {
      const off = i * step;
      const top = (off / shift.lenMin) * 100;
      const label = hm(shift.startMin + off);
      ticks.push(`<div class="schx-tick" style="top:${top}%"><span>${esc(label)}</span></div>`);
    }
    return ticks.join('');
  }

  function renderDay(day, shift) {
    const d = day;
    const blocks = (d.blocks || []).map(normalizeBlock);
    const lines = renderGridLines(shift);

    const blocksHtml = blocks.map((b, idx) => {
      const id = b.schedule || '';
      const label = taskLabel(id) || 'Block';
      const c = taskColor(id);
      const vars = taskVars(c);
      const m = blockMetrics(shift, b);
      const localRange = (localTZ && localTZ !== tzManila) ? localRangeLabel(d.iso, b.start, b.end, shift) : '';
      const audit = findAuditForBlock(d.dayIdx, b);
      const auditLine = audit ? `Assigned by ${audit.actorName || '—'} • ${formatTs(audit.ts)}` : '';

      const tooltipLines = [
        `${label}`,
        `${b.start}–${b.end} (Manila)`,
      ];
      if (localRange) tooltipLines.push(`${localRange} (${localTZ})`);
      if (auditLine) tooltipLines.push(auditLine);
      if (b.notes) tooltipLines.push(`Notes: ${b.notes}`);

      return `
        <div
          class="schedule-block schx-block"
          style="top:${m.top}%;height:${m.height}%;--task-color:${esc(vars.color)};--task-bg:${esc(vars.bg)};--task-border:${esc(vars.border)};--task-text:${esc(vars.text)}"
          role="button"
          tabindex="0"
          data-tooltip="${esc(tooltipLines.join('\n'))}"
          aria-label="${esc(label)} ${esc(b.start)} to ${esc(b.end)}"
        >
          <div class="schx-btop">
            <span class="task-label" style="--task-color:${esc(vars.color)};--task-bg:${esc(vars.bg)};--task-border:${esc(vars.border)};--task-text:${esc(vars.text)}">
              <span class="task-color" style="background:${esc(vars.color)}"></span>
              ${esc(label)}
            </span>
            <span class="schx-time">${esc(b.start)}–${esc(b.end)}</span>
          </div>
          <div class="schx-bsub">
            ${localRange ? `<span class="small muted">Local: ${esc(localRange)} (${esc(localTZ)})</span>` : `<span class="small muted">${esc(tzManila)}</span>`}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="schx-day" aria-label="${esc(d.dayLabel)} schedule">
        <header class="schx-dayhead">
          <div class="schx-dayname">${esc(d.dayLabel.slice(0, 3))}</div>
          <div class="schx-daydate">${esc(d.iso)}</div>
        </header>
        <div class="schx-daybody" data-day="${d.dayIdx}" style="--shift-len:${shift.lenMin}">
          ${lines}
          ${blocksHtml || `<div class="schx-empty small muted">No blocks</div>`}
        </div>
      </section>
    `;
  }

  function renderGridLines(shift) {
    const lines = [];
    const step = 60;
    const count = Math.floor(shift.lenMin / step);
    for (let i = 0; i <= count; i++) {
      const off = i * step;
      const top = (off / shift.lenMin) * 100;
      lines.push(`<div class="schx-line" style="top:${top}%" aria-hidden="true"></div>`);
    }
    return `<div class="schx-lines" aria-hidden="true">${lines.join('')}</div>`;
  }

  function renderAuditList() {
    try {
      const weekStartISO = currentWeekStartMondayISO();
      const list = Store.getWeekAudit ? (Store.getWeekAudit(me.teamId || '', weekStartISO) || []) : [];
      const mine = list.filter(a => a && a.targetId === me.id).slice(0, 25);
      if (!mine.length) return `<div class="small muted">No audit entries recorded for your schedule yet this week.</div>`;
      return `<div class="mysx-audit">
        ${mine.map(a => {
          return `<div class="mysx-audit-row">
            <div class="mysx-audit-main">
              <div class="mysx-audit-action">${esc(a.action || '')}</div>
              <div class="small muted">${esc(a.detail || '')}</div>
              <div class="small muted">Actor: ${esc(a.actorName || '—')}</div>
            </div>
            <div class="mysx-audit-ts small muted">${esc(formatTs(a.ts))}</div>
          </div>`;
        }).join('')}
      </div>`;
    } catch (_) {
      return `<div class="small muted">Audit unavailable.</div>`;
    }
  }

  function formatTs(ts) {
    try {
      return new Date(Number(ts || 0)).toLocaleString('en-CA', {
        timeZone: tzManila,
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch (_) { return ''; }
  }

  function bindViewToggle(host) {
    const box = host.querySelector('.schx-toggle');
    if (!box) return;
    box.querySelectorAll('button[data-view]').forEach(btn => {
      btn.onclick = () => setViewMode(btn.dataset.view);
    });
  }

  function bindDayTabs(host) {
    const tabs = host.querySelector('.schx-daytabs');
    if (!tabs) return;
    tabs.querySelectorAll('button[data-day]').forEach(btn => {
      btn.onclick = () => setFocusDay(btn.dataset.day);
    });
  }

  function bindTooltip(host) {
    const tip = host.querySelector('#schxTooltip');
    if (!tip) return;

    function show(ev, text) {
      if (!text) return;
      tip.textContent = text;
      tip.setAttribute('aria-hidden', 'false');
      tip.style.opacity = '1';
      const x = (ev && (ev.clientX || 0)) + 12;
      const y = (ev && (ev.clientY || 0)) + 12;
      tip.style.left = `${x}px`;
      tip.style.top = `${y}px`;
    }

    function hide() {
      tip.setAttribute('aria-hidden', 'true');
      tip.style.opacity = '0';
    }

    host.querySelectorAll('.schx-block').forEach(el => {
      const text = el.getAttribute('data-tooltip') || '';
      el.addEventListener('mouseenter', (ev) => show(ev, text));
      el.addEventListener('mousemove', (ev) => show(ev, text));
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focus', (ev) => show(ev, text));
      el.addEventListener('blur', hide);
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') hide();
      });
    });
  }

  function bindSwipe(host) {
    if (viewMode !== 'day') return;
    const body = host.querySelector('.schx-daybody');
    if (!body) return;
    let x0 = null;
    body.addEventListener('touchstart', (e) => {
      if (!e.touches || !e.touches[0]) return;
      x0 = e.touches[0].clientX;
    }, { passive: true });
    body.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const x1 = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : x0;
      const dx = x1 - x0;
      x0 = null;
      if (Math.abs(dx) < 60) return;
      if (dx < 0) setFocusDay((focusDay + 1) % 7);
      else setFocusDay((focusDay + 6) % 7);
    }, { passive: true });
  }

  function startTickLoop(host, shift) {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    const el = host.querySelector('#schxCountdown');
    if (!el) return;
    tickTimer = setInterval(() => {
      try {
        const c = computeCountdown(shift);
        el.textContent = c.label || '—';
      } catch (_) { }
    }, 1000);
  }

  function startRealtimeRefresh() {
    // Rollback-safe: listen to store updates; re-render schedule if schedule-related keys changed
    if (storeListener && Store.unlisten) {
      try { Store.unlisten(storeListener); } catch (_) { }
      storeListener = null;
    }
    if (!Store.listen) return;
    try {
      storeListener = Store.listen(function (key) {
        const k = String(key || '');
        if (k.includes('schedule') || k.includes('tasks') || k.includes('audit')) {
          render();
        }
      });
    } catch (_) { }
  }

  // Init
  render();
  startRealtimeRefresh();
});
