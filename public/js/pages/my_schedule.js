(window.Pages = window.Pages || {}, window.Pages.my_schedule = function (root) {
  // ---------------------------------------------------------------------------
  // My Schedule — Enterprise Calendar (13126-09)
  // - Weekly / Daily / Team views
  // - Pixel-perfect hour ruler alignment (shared row height grid)
  // - TEAM TASK color coding + badges (.task-label / .task-color)
  // - Team tabular view inspired by enterprise scheduling systems
  // ---------------------------------------------------------------------------
  const session = (window.Store && Store.getSession) ? Store.getSession() : null;
  const sessionUserId = session && (session.userId || session.user_id || session.uid || session.id);
  let me = (window.Auth && Auth.user) ? Auth.user : null;
  // Backfill user profile from Store when Auth.user is not yet hydrated (fixes 'No blocks' on My Schedule).
  try{
    if((!me || !me.id) && sessionUserId && window.Store && Store.getUserById){
      const prof = Store.getUserById(String(sessionUserId));
      if(prof) me = prof;
    }
    if(me && !me.id && sessionUserId) me.id = String(sessionUserId);
  }catch(_){ }
  if(!me) me = { id: String(sessionUserId || ''), role: 'MEMBER' };
  const role = (me && me.role) ? String(me.role) : 'MEMBER';
  const canEditSelf = (role === 'TEAM_LEAD' || role === 'SUPER_ADMIN');

  const tzManila = 'Asia/Manila';
  let localTZ = '';
  try { localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { localTZ = ''; }

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function esc(s) { return (window.UI && UI.esc) ? UI.esc(s) : String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function hm(min) {
    let m = ((min % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${pad2(h)}:${pad2(mm)}`;
  }

  function hmShort(min) {
    let m = ((min % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${pad2(mm)}`;
  }

  function parseHM(s) {
    const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
  }

  function addDaysISO(iso, delta) {
    try {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + Number(delta || 0));
      return d.toISOString().slice(0, 10);
    } catch (_) {
      return iso;
    }
  }

  function weekdayFromISO(iso) {
    try {
      const d = new Date(`${iso}T00:00:00Z`);
      return d.getUTCDay();
    } catch (_) {
      return 0;
    }
  }

  function formatDateLong(iso) {
    try {
      // Use UTC midnight so TZ formatting does not shift the day.
      const d = new Date(`${iso}T00:00:00Z`);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        timeZone: tzManila,
      }).format(d);
    } catch (_) {
      return String(iso || '');
    }
  }

  function nowISOManila() {
    try {
      if (window.UI && UI.manilaNow) {
        const p = UI.manilaNow();
        if (p && p.isoDate) return String(p.isoDate);
      }
    } catch (_) { }
    return new Date().toISOString().slice(0, 10);
  }

  const todayISO = nowISOManila();
  const todayWD = weekdayFromISO(todayISO);
  const weekStartSunISO = addDaysISO(todayISO, -todayWD);

  function isoForDay(dayIdx) {
    return addDaysISO(weekStartSunISO, Number(dayIdx || 0));
  }

  function getTeam() {
    try {
      if (window.Store && Store.getTeamConfig && me.teamId != null) {
        const cfg = Store.getTeamConfig(me.teamId);
        if (cfg) return { id: me.teamId, label: cfg.label || cfg.name || me.teamId, cfg };
      }
    } catch (_) { }
    return { id: me.teamId, label: me.teamId, cfg: null };
  }

  function inferTeamShift(team) {
    // Align with existing conventions used across app:
    // - Team config schedule.start/end or defaults per shift key
    const cfg = (team && team.cfg) ? team.cfg : null;
    const s = (cfg && cfg.schedule && cfg.schedule.start) ? String(cfg.schedule.start) : (me.shift === 'MID' ? '15:00' : (me.shift === 'NIGHT' ? '22:00' : '06:00'));
    const e = (cfg && cfg.schedule && cfg.schedule.end) ? String(cfg.schedule.end) : (me.shift === 'MID' ? '22:00' : (me.shift === 'NIGHT' ? '06:00' : '15:00'));
    const startMin = parseHM(s);
    let endMin = parseHM(e);
    let lenMin = endMin - startMin;
    if (lenMin <= 0) lenMin += (24 * 60);
    return { startHM: s, endHM: e, startMin, endMin, lenMin };
  }

  function shiftKey() {
    try {
      const t = getTeam();
      const cfg = t && t.cfg ? t.cfg : null;
      const sk = (cfg && cfg.shiftKey) ? String(cfg.shiftKey) : ((me && me.shift) ? String(me.shift).toLowerCase() : '');
      return sk || 'shift';
    } catch (_) {
      return 'shift';
    }
  }

  function getTeamTasks() {
    try {
      if (window.Store && Store.getTeamTasks && me.teamId != null) return Store.getTeamTasks(me.teamId) || [];
    } catch (_) { }
    return [];
  }

  function taskLabel(taskId) {
    const id = String(taskId || '');
    const tasks = getTeamTasks();
    const t = tasks.find(x => String(x && (x.id || x.taskId || x.label || x.name)) === id) || null;
    if (t) return String(t.label || t.name || t.id || id);
    // If schedule stores label directly
    if (id && !/^[0-9a-f\-]{6,}$/i.test(id)) return id;
    return id;
  }

  function normalizeTaskColor(labelOrId, rawColor) {
    const lbl = String(labelOrId || '').trim().toLowerCase();
    if (lbl.includes('mailbox')) return '#c4b5fd';
    if (lbl.includes('back office') || lbl.includes('admin')) return '#93c5fd';
    if (lbl.includes('call')) return '#86efac';
    if (lbl.includes('lunch') || lbl.includes('break')) return '#94a3b8';
    return rawColor || '#93c5fd';
  }

  function taskColor(taskId) {
    let c = '';
    try {
      if (window.Store && Store.getTeamTaskColor && me.teamId != null) {
        c = Store.getTeamTaskColor(me.teamId, String(taskId || '')) || '';
      }
    } catch (_) { }
    const lbl = taskLabel(taskId);
    return normalizeTaskColor(lbl, c) || 'rgba(255,255,255,.18)';
  }

  function taskVars(color) {
    const c = String(color || '#4aa3ff');
    // Enterprise pastel surface + bright text to preserve contrast in dark mode.
    const bg = (window.UI && UI.hexToRgba) ? UI.hexToRgba(c, 0.72) : 'rgba(80,160,255,0.72)';
    const border = (window.UI && UI.hexToRgba) ? UI.hexToRgba(c, 0.96) : 'rgba(80,160,255,0.96)';
    const text = '#f8fbff';
    return { color: c, bg, border, text };
  }

  function shiftLabel(sk) {
    const key = String(sk || '').toLowerCase();
    if (key.includes('night')) return 'night';
    if (key.includes('mid')) return 'mid';
    return 'morning';
  }

  function taskIcon(label) {
    const key = String(label || '').trim().toLowerCase();
    if (key.includes('call')) return '📞';
    if (key.includes('mailbox')) return '📥';
    if (key.includes('lunch') || key.includes('break')) return '☕';
    if (key.includes('back office') || key.includes('admin')) return '🗂️';
    return '•';
  }

  function normalizeBlock(b) {
    const o = b || {};
    return {
      start: String(o.start || o.s || '00:00'),
      end: String(o.end || o.e || '00:00'),
      schedule: String(o.schedule || o.task || o.role || o.label || ''),
      notes: String(o.notes || ''),
    };
  }

  function getBlocksForUserDay(userId, dayIdx) {
    try {
      if (window.Store && Store.getUserDayBlocks) {
        const list = Store.getUserDayBlocks(String(userId || ''), Number(dayIdx || 0)) || [];
        return Array.isArray(list) ? list : [];
      }
    } catch (_) { }
    return [];
  }

  function getMyBlocks(dayIdx) {
    return getBlocksForUserDay(me.id, dayIdx);
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

  function localRangeLabel(isoDate, startHM, endHM) {
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

  function clampShiftRange(shift, startOff, endOff) {
    let s = Math.max(0, Math.min(shift.lenMin, startOff));
    let e = endOff;
    if (e <= s) e += (24 * 60);
    e = Math.max(0, Math.min(shift.lenMin, e));
    if (e <= s) e = Math.min(shift.lenMin, s + 15);
    return { s, e, dur: e - s };
  }

  function blockMetrics(shift, b) {
    const startOff = computeOffset(shift, b.start);
    const endOff = computeOffset(shift, b.end);
    const r = clampShiftRange(shift, startOff, endOff);
    const topH = r.s / 60;
    const heightH = Math.max(0.25, r.dur / 60);
    return { topH, heightH, durMin: r.dur, startOff: r.s, endOff: r.e };
  }

  function nowManilaParts() {
    try { return UI.manilaNow ? UI.manilaNow() : null; } catch (_) { return null; }
  }

  function computeCountdown(shift) {
    const parts = nowManilaParts() || { isoDate: todayISO, hh: new Date().getHours(), mm: new Date().getMinutes() };
    const nowMin = (Number(parts.hh) || 0) * 60 + (Number(parts.mm) || 0);
    const wd = weekdayFromISO(parts.isoDate || todayISO);
    const blocks = getMyBlocks(wd).map(normalizeBlock).sort((a, b) => parseHM(a.start) - parseHM(b.start));
    if (!blocks.length) return { label: '—', active: null, next: null, wd, isoDate: parts.isoDate || todayISO, blocks, secLeft: 0, state: 'idle' };

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
    let secLeft = 0;
    let state = 'idle';
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
        secLeft = left;
        state = 'active';
        label = `Ends in ${fmt(left)}`;
      } else if (next && UI.parseManilaDateTimeLocal) {
        const nMin = parseHM(next.start);
        const startISO = (nMin < nowMin) ? addDaysISO(parts.isoDate, 1) : parts.isoDate;
        const startMs = UI.parseManilaDateTimeLocal(`${startISO}T${next.start}`);
        const left = Math.max(0, Math.floor((startMs - nowMs) / 1000));
        secLeft = left;
        state = 'next';
        label = `Starts in ${fmt(left)}`;
      }
    } catch (_) { }

    return { label, active, next, wd, isoDate: parts.isoDate || todayISO, blocks, secLeft, state };
  }

  function computeCountdownTone(countdown) {
    const sec = Number(countdown && countdown.secLeft) || 0;
    if (!countdown || countdown.state === 'idle') return 'muted';
    if (sec <= 3600) return 'warn';
    if (sec <= 3 * 3600) return 'focus';
    return 'ok';
  }

  function currentTimeOffsetMinutes(shift) {
    try {
      const p = nowManilaParts();
      if (!p) return null;
      const nowMin = (Number(p.hh) || 0) * 60 + (Number(p.mm) || 0);
      let off = nowMin - shift.startMin;
      if (off < 0) off += (24 * 60);
      if (off < 0 || off > shift.lenMin) return null;
      return off;
    } catch (_) {
      return null;
    }
  }

  function currentWeekStartMondayISO() {
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

  // Persistent state
  let viewMode = 'week';
  let focusDay = todayWD;
  try {
    const stored = String(localStorage.getItem('mums_sched_view') || '').toLowerCase();
    if (stored === 'day' || stored === 'week' || stored === 'team') viewMode = stored;
  } catch (_) { }
  try {
    const fd = Number(localStorage.getItem('mums_sched_day'));
    if (!Number.isNaN(fd)) focusDay = Math.max(0, Math.min(6, fd));
  } catch (_) { }

  let tickTimer = null;
  let storeListener = null;

  function setViewMode(mode) {
    const m = String(mode || '').toLowerCase();
    viewMode = (m === 'day' || m === 'team') ? m : 'week';
    try { localStorage.setItem('mums_sched_view', viewMode); } catch (_) { }
    render();
  }

  function setFocusDay(d) {
    focusDay = Math.max(0, Math.min(6, Number(d) || 0));
    try { localStorage.setItem('mums_sched_day', String(focusDay)); } catch (_) { }
    render();
  }

  function render() {
    const host = root || document.getElementById('main') || document.body;
    const team = getTeam();
    const teamLabel = (window.Config && Config.teamLabel && me.teamId != null) ? Config.teamLabel(me.teamId) : (team ? (team.label || team.id) : (me.teamId || '—'));
    const shift = inferTeamShift(team);
    const sk = shiftKey();

    const week = Array.from({ length: 7 }, (_, d) => {
      const iso = isoForDay(d);
      const blocks = getMyBlocks(d).map(normalizeBlock).sort((a, b) => parseHM(a.start) - parseHM(b.start));
      return { dayIdx: d, iso, dayLabel: DAYS[d], blocks };
    });

    const mode = viewMode;
    const visibleDays = (mode === 'day') ? [week[focusDay]] : week;
    const countdown = computeCountdown(shift);

    const todayLong = formatDateLong(todayISO);
    const focusISO = isoForDay(focusDay);
    const focusLong = formatDateLong(focusISO);

    const tzLine = (localTZ && localTZ !== tzManila)
      ? `Local: <b>${esc(localTZ)}</b> • Manila: <b>${esc(tzManila)}</b>`
      : `Timezone: <b>${esc(tzManila)}</b>`;

    const totalWeekBlocks = week.reduce((n, d) => n + d.blocks.length, 0);
    const todayBlocks = week[todayWD] ? week[todayWD].blocks : [];

    const hours = Math.max(1, Math.ceil(shift.lenMin / 60));
    const countdownTone = computeCountdownTone(countdown);
    const nowOffset = currentTimeOffsetMinutes(shift);

    host.innerHTML = `
      <div class="schx" data-shift="${esc(sk)}" style="--schx-hours:${hours}">
        <div class="schx-header">
          <div>
            <div class="ux-h1">My Schedule</div>
            <div class="small muted">${esc(todayLong)} • ${tzLine}</div>
          </div>
          <div class="schx-actions">
            <div class="schx-toggle" role="tablist" aria-label="Schedule view">
              <button class="btn ghost small ${mode === 'week' ? 'active' : ''}" type="button" data-view="week" role="tab" aria-selected="${mode === 'week'}">Weekly</button>
              <button class="btn ghost small ${mode === 'day' ? 'active' : ''}" type="button" data-view="day" role="tab" aria-selected="${mode === 'day'}">Daily</button>
              <button class="btn ghost small ${mode === 'team' ? 'active' : ''}" type="button" data-view="team" role="tab" aria-selected="${mode === 'team'}">Team</button>
            </div>
            <span class="ux-chip"><span class="dot"></span>${esc(role || '')}${teamLabel ? ` • ${esc(teamLabel)}` : ''}</span>
            <a class="btn" href="/my_attendance">Attendance</a>
            <a class="btn" href="/mailbox">Mailbox</a>
          </div>
        </div>

        <div class="schx-kpis">
          <div class="schx-kpi">
            <div class="small muted">Shift status</div>
            <div class="big">${esc(shiftLabel(sk))}</div>
            <div class="small muted">${esc(shift.startHM)}–${esc(shift.endHM)}</div>
          </div>
          <div class="schx-kpi">
            <div class="small muted">Today</div>
            <div class="big">${todayBlocks.length} block${todayBlocks.length === 1 ? '' : 's'}</div>
            <div class="small muted">${countdown.active ? `Active: ${esc(taskLabel(countdown.active.schedule))}` : (todayBlocks.length ? 'No active block' : 'No blocks')}</div>
          </div>
          <div class="schx-kpi countdown ${esc(countdownTone)}">
            <div class="small muted">Countdown</div>
            <div class="big" id="schxCountdown">${esc(countdown.label)}</div>
            <div class="small muted">Auto-updates in real time</div>
          </div>
          <div class="schx-kpi">
            <div class="small muted">This week</div>
            <div class="big">${totalWeekBlocks} total</div>
            <div class="small muted">${esc(formatDateLong(weekStartSunISO))} → ${esc(formatDateLong(isoForDay(6)))}</div>
          </div>
        </div>

        <div class="schx-legend" aria-label="Schedule legend">
          <span class="legend-item"><span class="legend-dot mailbox"></span>Mailbox Manager</span>
          <span class="legend-item"><span class="legend-dot call"></span>Call Available</span>
          <span class="legend-item"><span class="legend-dot admin"></span>Back Office</span>
          <span class="legend-item"><span class="legend-dot break"></span>Lunch / Break</span>
        </div>

        ${(mode === 'day' || mode === 'team') ? renderDayTabs(week) : ''}

        <div class="schx-cal" aria-label="Schedule calendar">
          ${mode === 'team'
      ? renderTeamView(shift, hours, focusISO, focusLong)
      : `
            <div class="schx-grid" style="--shift-len:${shift.lenMin}">
              <div class="schedule-ruler schx-ruler" aria-hidden="true">
                <!-- Spacer matches the day header + gap so tick labels align with grid lines -->
                <div class="schx-ruler-spacer" aria-hidden="true"></div>
                <div class="schx-ruler-body schx-ruler-grid" aria-hidden="true">
                  ${renderRuler(shift, hours)}
                </div>
              </div>

              <div class="schx-cols ${mode === 'day' ? 'day' : 'week'}" id="schxCols" aria-label="${mode === 'day' ? 'Daily calendar' : 'Weekly calendar'}">
                ${nowOffset != null ? `<div class="schx-nowline" aria-hidden="true" style="top:calc(var(--schx-head-h) + var(--schx-head-gap) + ${(nowOffset / 60)} * var(--schx-row-h))"><span class="schx-nowline-dot"></span></div>` : ''}
                ${visibleDays.map(d => renderDay(d, shift, hours)).join('')}
              </div>
            </div>

            <div class="schx-foot">
              <div class="small muted">Tip: ${mode === 'day' ? 'Swipe left/right on the day canvas to change day.' : 'On smaller screens, switch to Daily view for maximum readability.'}</div>
              <div class="ux-row" style="justify-content:flex-end">
                <a class="btn" href="/master_schedule">Master Schedule</a>
                ${canEditSelf ? '<a class="btn" href="/members">Edit Team Schedules</a>' : ''}
              </div>
            </div>
          `
    }
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

  function renderDayTabs(week) {
    return `
      <div class="schx-daytabs" role="tablist" aria-label="Focus day">
        ${week.map(d => {
      const active = d.dayIdx === focusDay ? 'active' : '';
      const dot = d.blocks.length ? '<span class="dot" aria-hidden="true"></span>' : '';
      return `<button class="schx-daytab ${active}" type="button" data-day="${d.dayIdx}" role="tab" aria-selected="${d.dayIdx === focusDay}">${esc(d.dayLabel.slice(0, 3))}${dot}</button>`;
    }).join('')}
      </div>
    `;
  }

  // Ruler is rendered as fixed-height rows (shared unit system with the calendar grid)
  // to avoid pixel drift on zoom/resizes and keep labels aligned with grid lines.
  function renderRuler(shift, hours) {
    const rows = [];
    for (let i = 0; i < hours; i++) {
      const label = hm(shift.startMin + (i * 60));
      rows.push(`<div class="schx-ruler-row" aria-hidden="true"><span class="schx-tick-label">${esc(label)}</span></div>`);
    }

    // Add the end boundary label (e.g., 15:00) pinned to the bottom grid line.
    const endLabel = hm(shift.startMin + (hours * 60));
    rows.push(`<div class="schx-ruler-end" aria-hidden="true"><span class="schx-tick-label">${esc(endLabel)}</span></div>`);
    return rows.join('');
  }

  function renderDay(day, shift, hours) {
    const d = day;
    const blocks = (d.blocks || []).map(normalizeBlock);

    const blocksHtml = blocks.map((b) => {
      const label = taskLabel(b.schedule) || 'Block';
      const c = taskColor(b.schedule);
      const vars = taskVars(c);
      const m = blockMetrics(shift, b);
      const localRange = (localTZ && localTZ !== tzManila) ? localRangeLabel(d.iso, b.start, b.end) : '';
      const audit = findAuditForBlock(d.dayIdx, b);
      const auditLine = audit ? `Assigned by ${audit.actorName || '—'} • ${formatTs(audit.ts)}` : '';

      const tooltipLines = [
        `${label}`,
        `${formatDateLong(d.iso)}`,
        `${b.start}–${b.end} (Manila)`,
      ];
      if (localRange) tooltipLines.push(`${localRange} (${localTZ})`);
      if (auditLine) tooltipLines.push(auditLine);
      if (b.notes) tooltipLines.push(`Notes: ${b.notes}`);

      return `
        <div
          class="schedule-block schx-block"
          style="top:calc(${m.topH} * var(--schx-row-h));height:calc(${m.heightH} * var(--schx-row-h));--task-color:${esc(vars.color)};--task-bg:${esc(vars.bg)};--task-border:${esc(vars.border)};--task-text:${esc(vars.text)}"
          role="button"
          tabindex="0"
          data-tooltip="${esc(tooltipLines.join('\n'))}"
          aria-label="${esc(label)}"
        >
          <div class="schx-btop minimal">
            <span class="schx-status-icon" aria-hidden="true">${esc(taskIcon(label))}</span>
            <span class="schx-block-title">${esc(label)}</span>
          </div>
        </div>
      `;
    }).join('');

    const lines = renderGridLines(hours);

    return `
      <section class="schx-day" aria-label="${esc(d.dayLabel)} schedule">
        <header class="schx-dayhead">
          <div class="schx-dayname">${esc(d.dayLabel.slice(0, 3))}</div>
          <div class="schx-daydate">${esc(formatDateLong(d.iso))}</div>
        </header>
        <div class="schx-daybody" data-day="${d.dayIdx}" style="--shift-len:${shift.lenMin}" aria-label="${esc(d.dayLabel)} blocks">
          ${lines}
          <div class="schx-vline" aria-hidden="true"></div>
          ${blocksHtml || `<div class="schx-empty small muted">No blocks</div>`}
        </div>
      </section>
    `;
  }

  function renderGridLines(hours) {
    const lines = [];
    for (let i = 0; i <= hours; i++) {
      lines.push(`<div class="schx-line" style="top:calc(${i} * var(--schx-row-h))" aria-hidden="true"></div>`);
    }
    return `<div class="schx-lines" aria-hidden="true">${lines.join('')}</div>`;
  }

  function getTeamMembers() {
    try {
      if (!window.Store || !Store.getUsers) return [];
      const tid = String(me.teamId || '');
      const users = Store.getUsers() || [];
      const inTeam = users.filter(u => {
        if (!u) return false;
        if (String(u.teamId || '') !== tid) return false;
        if (u.deleted || u.isDeleted) return false;
        return true;
      });
      const nameOf = (u) => String(u.fullName || u.name || u.displayName || u.username || u.email || u.id || '');
      inTeam.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      return inTeam;
    } catch (_) {
      return [];
    }
  }

  function renderTeamView(shift, hours, focusISO, focusLong) {
    const members = getTeamMembers();
    const cols = hours;

    const colLabels = Array.from({ length: cols }, (_, i) => hmShort(shift.startMin + i * 60));

    const gridTemplate = `240px repeat(${cols}, minmax(72px, 1fr))`;

    const header = `
      <div class="team-schedule-head">
        <div>
          <div class="mysx-section-title">Team Schedule</div>
          <div class="small muted">${esc(focusLong)} • ${esc(tzManila)}${(localTZ && localTZ !== tzManila) ? ` • Local: ${esc(localTZ)}` : ''}</div>
        </div>
      </div>

      <div class="team-schedule-wrap" role="table" aria-label="Team schedule table">
        <div class="team-schedule-grid" style="grid-template-columns:${gridTemplate}" role="rowgroup">
          <div class="team-schedule-row team-schedule-header" role="row">
            <div class="tsg-h ts-name" role="columnheader">MEMBER</div>
            ${colLabels.map(t => `<div class="tsg-h" role="columnheader">${esc(t)}</div>`).join('')}
          </div>
          ${members.map(m => renderTeamRow(m, shift, cols, focusDay, focusISO, gridTemplate)).join('') || `<div class="small muted" style="padding:12px">No team members found.</div>`}
        </div>
      </div>
    `;

    return header;
  }

  function renderTeamRow(member, shift, cols, dayIdx, iso, gridTemplate) {
    const nameOf = (u) => String(u.fullName || u.name || u.displayName || u.username || u.email || u.id || '');
    const memberName = nameOf(member);

    const blocks = getBlocksForUserDay(member.id, dayIdx).map(normalizeBlock);

    // Build hour slots
    const slots = Array.from({ length: cols }, () => null);
    blocks.forEach(raw => {
      const b = normalizeBlock(raw);
      const startOff = computeOffset(shift, b.start);
      const endOff = computeOffset(shift, b.end);
      const r = clampShiftRange(shift, startOff, endOff);
      const c0 = Math.max(0, Math.floor(r.s / 60));
      const c1 = Math.min(cols, Math.ceil(r.e / 60));
      for (let i = c0; i < c1; i++) {
        // Prefer earlier block if overlap occurs
        if (!slots[i]) slots[i] = { taskId: b.schedule, b };
      }
    });

    const cells = [];
    for (let i = 0; i < cols; i++) {
      const slot = slots[i];
      if (!slot) {
        cells.push(`<div class="tsg-cell" role="cell" aria-label="${esc(memberName)} empty"></div>`);
        continue;
      }
      const taskId = slot.taskId;
      const label = taskLabel(taskId);
      const color = taskColor(taskId);
      const vars = taskVars(color);

      const prev = i > 0 ? slots[i - 1] : null;
      const showLabel = !prev || !prev.taskId || prev.taskId !== taskId;

      const hourStart = hm(shift.startMin + i * 60);
      const hourEnd = hm(shift.startMin + (i + 1) * 60);

      const tooltip = [
        `${memberName}`,
        `${label}`,
        `${formatDateLong(iso)}`,
        `${slot.b.start}–${slot.b.end} (Manila)`,
        `Hour cell: ${hourStart}–${hourEnd}`,
      ].join('\n');

      cells.push(`
        <div
          class="tsg-cell has-task"
          role="cell"
          tabindex="0"
          style="--task-color:${esc(vars.color)};--task-bg:${esc(vars.bg)};--task-border:${esc(vars.border)};--task-text:${esc(vars.text)};background:${esc(vars.color)}"
          data-tooltip="${esc(tooltip)}"
          aria-label="${esc(memberName)} ${esc(label)} ${esc(hourStart)} to ${esc(hourEnd)}"
        >
          ${showLabel ? `<span class="task-label tsg-badge" style="--task-color:${esc(vars.color)};--task-bg:rgba(0,0,0,.20);--task-border:rgba(255,255,255,.18);--task-text:#fff"><span class="task-color" style="background:${esc(vars.color)}"></span>${esc(label)}</span>` : ''}
        </div>
      `);
    }

    return `
      <div class="team-schedule-row member-row" role="row" style="grid-template-columns:${gridTemplate}">
        <div class="tsg-name" role="rowheader">${esc(memberName)}</div>
        ${cells.join('')}
      </div>
    `;
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

    // Bind to any element with data-tooltip
    host.querySelectorAll('[data-tooltip]').forEach(el => {
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
    if (storeListener && Store.unlisten) {
      try { Store.unlisten(storeListener); } catch (_) { }
      storeListener = null;
    }
    if (!Store.listen) return;
    try {
      storeListener = Store.listen(function (key) {
        const k = String(key || '');
        if (k.includes('schedule') || k.includes('tasks') || k.includes('audit') || k.includes('weekly') || k.includes('users')) {
          render();
        }
      });
    } catch (_) { }
  }

  // Init
  render();
  startRealtimeRefresh();
});
