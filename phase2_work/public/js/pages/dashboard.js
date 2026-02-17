(window.Pages = window.Pages || {}, window.Pages.dashboard = function (root) {
  const me = (window.Auth && Auth.getUser) ? (Auth.getUser() || {}) : {};
  const role = String(me.role || '').toUpperCase();
  const isLeadView = role === 'TEAM_LEAD' || role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER_USER';

  function shiftIcon(shift) {
    const s = String(shift || '').toLowerCase();
    if (s.includes('morning')) return '☀️';
    if (s.includes('night')) return '🌙';
    if (s.includes('mid')) return '⛅';
    return '🕘';
  }

  function isShiftActive(shift) {
    const now = new Date();
    const hour = Number(now.getHours());
    const s = String(shift || '').toLowerCase();
    if (s.includes('morning')) return hour >= 6 && hour < 14;
    if (s.includes('mid')) return hour >= 14 && hour < 22;
    if (s.includes('night')) return hour >= 22 || hour < 6;
    return true;
  }

  function groupRows(rows) {
    const by = {};
    (rows || []).forEach((row) => {
      const dist = String(row.distribution_title || 'Untitled Distribution');
      const member = String(row.member_name || 'Unknown Member');
      const key = `${dist}__${member}`;
      if (!by[key]) by[key] = {
        distribution_title: dist,
        member_name: member,
        member_shift: row.member_shift || 'N/A',
        total: 0,
        done: 0,
        pending: 0,
        last_update: row.last_update || null
      };
      by[key].total += 1;
      if (String(row.task_status || '').toUpperCase() === 'DONE') by[key].done += 1;
      if (String(row.task_status || '').toUpperCase() === 'PENDING') by[key].pending += 1;
      if (row.last_update && (!by[key].last_update || new Date(row.last_update).getTime() > new Date(by[key].last_update).getTime())) {
        by[key].last_update = row.last_update;
      }
    });
    return Object.values(by).sort((a, b) => String(a.distribution_title).localeCompare(String(b.distribution_title)) || String(a.member_name).localeCompare(String(b.member_name)));
  }

  async function mountTeamWorkloadPulse() {
    if (!isLeadView) return;
    let state = { rows: [], filter: '', subscription: null, refreshLock: false };

    const renderWidget = () => {
      const mount = root.querySelector('#teamWorkloadPulseMount');
      if (!mount) return;

      const grouped = groupRows(state.rows);
      const titles = Array.from(new Set((state.rows || []).map((r) => String(r.distribution_title || '').trim()).filter(Boolean))).sort();
      const byDist = grouped.reduce((acc, row) => {
        const key = row.distribution_title;
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});

      mount.innerHTML = `
        <div class="ux-card dashx-panel" style="margin-top:12px">
          <div class="row" style="justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
            <div>
              <div class="dashx-title">Team Workload Pulse</div>
              <div class="small muted">Leadership view across distribution groups.</div>
            </div>
            <div>
              <select id="twpFilter" class="ux-focusable">
                <option value="">All Active Tasks</option>
                ${titles.map((t) => `<option value="${UI.esc(t)}" ${state.filter === t ? 'selected' : ''}>${UI.esc(t)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="margin-top:10px">
            ${Object.keys(byDist).map((dist) => `
              <div class="card pad" style="margin-bottom:10px;border:1px solid rgba(255,255,255,.08)">
                <div class="small" style="margin-bottom:8px"><b>${UI.esc(dist)}</b> • ${UI.esc(byDist[dist].length)} members helping</div>
                <table class="table">
                  <thead>
                    <tr><th>Member</th><th>Workload</th><th>Distribution Source</th><th>Progress Bar</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    ${byDist[dist].map((row) => {
                      const progress = row.total ? Math.round((row.done / row.total) * 100) : 0;
                      const active = isShiftActive(row.member_shift);
                      let label = 'In Progress';
                      let cls = 'badge';
                      if (row.pending > 0 && !active) { label = 'Waiting for Shift'; cls = 'badge'; }
                      else if (row.pending > 0 && active) { label = 'Overdue/Pending'; cls = 'badge warn'; }
                      else if (progress >= 100) { label = 'Completed'; cls = 'badge ok'; }
                      return `
                        <tr>
                          <td>${UI.esc(row.member_name)} <span class="badge">${UI.esc(shiftIcon(row.member_shift))} ${UI.esc(row.member_shift || 'N/A')}</span></td>
                          <td>${UI.esc(row.total)} items</td>
                          <td>${UI.esc(row.distribution_title)}</td>
                          <td>
                            <div style="height:10px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;min-width:140px">
                              <div style="height:100%;width:${Math.max(0, Math.min(100, progress))}%;background:linear-gradient(90deg,#22c55e,#14b8a6)"></div>
                            </div>
                            <div class="small muted" style="margin-top:4px">${UI.esc(progress)}%</div>
                          </td>
                          <td><span class="${cls}">${UI.esc(label)}</span></td>
                        </tr>
                      `;
                    }).join('') || '<tr><td colspan="5" class="muted">No workload rows for this distribution.</td></tr>'}
                  </tbody>
                </table>
              </div>
            `).join('') || '<div class="small muted">No workload matrix data found.</div>'}
          </div>
        </div>
      `;

      const filterEl = root.querySelector('#twpFilter');
      if (filterEl) {
        filterEl.onchange = () => {
          state.filter = String(filterEl.value || '').trim();
          refreshData();
        };
      }
    };

    const refreshData = async () => {
      if (state.refreshLock) return;
      state.refreshLock = true;
      const out = await CloudTasks.workloadMatrix(state.filter);
      state.refreshLock = false;
      state.rows = out.ok ? (out.data.rows || []) : [];
      renderWidget();
    };

    const ensureRealtime = async () => {
      try {
        const env = (window.EnvRuntime && EnvRuntime.env) ? EnvRuntime.env() : (window.MUMS_ENV || {});
        const sbUrl = String(env.SUPABASE_URL || '');
        const sbAnon = String(env.SUPABASE_ANON_KEY || '');
        if (!window.supabase || !sbUrl || !sbAnon) return;
        if (state.subscription) return;

        const token = (window.CloudAuth && CloudAuth.accessToken) ? CloudAuth.accessToken() : '';
        // Don't create a client without a token; it can cause RLS issues for any REST usage.
        if (!token) return;

        // Reuse the shared Supabase client to avoid multiple GoTrueClient instances.
        // If it doesn't exist yet, create it once and store it globally.
        if (!window.__MUMS_SB_CLIENT) {
          const dummyStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
          window.__MUMS_SB_CLIENT = window.supabase.createClient(sbUrl, sbAnon, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: dummyStorage, storageKey: 'mums_shared' },
            realtime: { params: { eventsPerSecond: 10 } },
            global: { headers: { Authorization: 'Bearer ' + token } }
          });
        }

        const client = window.__MUMS_SB_CLIENT;
        if (token && client && client.realtime && typeof client.realtime.setAuth === 'function') client.realtime.setAuth(token);

        state.subscription = client
          .channel('team-workload-pulse')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'task_items' }, () => refreshData())
          .subscribe();

        const prevCleanup = root._cleanup;
        root._cleanup = () => {
          try { if (prevCleanup) prevCleanup(); } catch (_) { }
          try { if (state.subscription) client.removeChannel(state.subscription); } catch (_) { }
          state.subscription = null;
        };
      } catch (_) { }
    };

    const host = root.querySelector('.dashx');
    if (host && !root.querySelector('#teamWorkloadPulseMount')) {
      const mount = document.createElement('div');
      mount.id = 'teamWorkloadPulseMount';
      host.appendChild(mount);
    }

    await refreshData();
    await ensureRealtime();
  }

  try {
    if (window.UI && typeof UI.renderDashboard === 'function') {
      UI.renderDashboard(root);
      mountTeamWorkloadPulse().catch(() => { });
      return;
    }
  } catch (e) { try { console.error(e); } catch (_) { } }

  const team = (window.Config && Config.teamById && me.teamId) ? Config.teamById(me.teamId) : null;
  root.innerHTML = `
    <h2 style="margin:0 0 10px">Dashboard</h2>
    <div class="card pad">
      <div class="small muted">Fallback dashboard renderer used. UI.renderDashboard() was not available.</div>
      <div style="margin-top:8px">User: <b>${UI.esc(me.fullName || me.name || me.username || 'User')}</b></div>
      <div class="small muted" style="margin-top:2px">Role: ${UI.esc(me.role || '')}</div>
      <div class="small muted">Team: ${UI.esc(team ? (team.label || team.id) : (me.teamId || ''))}</div>
    </div>
  `;
});
