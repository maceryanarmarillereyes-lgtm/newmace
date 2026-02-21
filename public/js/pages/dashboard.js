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
    let watchTimer = null; // BOSS THUNTER FIX: The Watcher Reference

    const renderWidget = () => {
      // BOSS THUNTER FIX: Automatically recreate the mount point if the UI refresh destroys it!
      let mount = root.querySelector('#teamWorkloadPulseMount');
      if (!mount) {
          const host = root.querySelector('.dashx');
          if (host) {
              mount = document.createElement('div');
              mount.id = 'teamWorkloadPulseMount';
              host.appendChild(mount);
          } else {
              return; // Can't render if the parent is completely gone
          }
      }

      const grouped = groupRows(state.rows);
      const titles = Array.from(new Set((state.rows || []).map((r) => String(r.distribution_title || '').trim()).filter(Boolean))).sort();
      const byDist = grouped.reduce((acc, row) => {
        const key = row.distribution_title;
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});

      mount.innerHTML = `
        <div class="ux-card dashx-panel" style="margin-top:12px; background:#FFFFFF; border:1px solid #E6E9EF; border-radius:16px; box-shadow:0 4px 14px rgba(0,0,0,0.03);">
          <div class="row" style="justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap; padding:16px;">
            <div>
              <div class="dashx-title" style="color:#1F2A44; font-weight:800; font-size:16px;">Team Workload Pulse</div>
              <div class="small muted" style="color:#676879;">Leadership view across distribution groups.</div>
            </div>
            <div>
              <select id="twpFilter" class="ux-focusable" style="background:#F5F6F8; border:1px solid #C3C6D4; border-radius:8px; color:#323338; padding:6px 12px; font-weight:600;">
                <option value="">All Active Tasks</option>
                ${titles.map((t) => `<option value="${UI.esc(t)}" ${state.filter === t ? 'selected' : ''}>${UI.esc(t)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="padding:0 16px 16px 16px;">
            ${Object.keys(byDist).map((dist) => `
              <div class="card pad" style="margin-bottom:10px; border:1px solid #E6E9EF; background:#FFFFFF; border-radius:12px; box-shadow:0 2px 6px rgba(0,0,0,0.01);">
                <div class="small" style="margin-bottom:12px; color:#323338;"><b>${UI.esc(dist)}</b> <span style="color:#676879;">• ${UI.esc(byDist[dist].length)} members helping</span></div>
                <table class="table" style="width:100%; border-collapse:collapse;">
                  <thead>
                    <tr style="border-bottom:2px solid #E6E9EF;">
                        <th style="text-align:left; padding:8px; color:#676879; font-size:11px; text-transform:uppercase;">Member</th>
                        <th style="text-align:left; padding:8px; color:#676879; font-size:11px; text-transform:uppercase;">Workload</th>
                        <th style="text-align:left; padding:8px; color:#676879; font-size:11px; text-transform:uppercase;">Distribution Source</th>
                        <th style="text-align:left; padding:8px; color:#676879; font-size:11px; text-transform:uppercase;">Progress Bar</th>
                        <th style="text-align:left; padding:8px; color:#676879; font-size:11px; text-transform:uppercase;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${byDist[dist].map((row) => {
                      const progress = row.total ? Math.round((row.done / row.total) * 100) : 0;
                      const active = isShiftActive(row.member_shift);
                      let label = 'In Progress';
                      let badgeBg = '#E6E9EF';
                      let badgeCol = '#676879';
                      
                      if (row.pending > 0 && !active) { 
                          label = 'Waiting for Shift'; 
                          badgeBg = '#F5F6F8'; badgeCol = '#676879';
                      }
                      else if (row.pending > 0 && active) { 
                          label = 'Overdue/Pending'; 
                          badgeBg = '#FDAB3D'; badgeCol = '#FFFFFF'; 
                      }
                      else if (progress >= 100) { 
                          label = 'Completed'; 
                          badgeBg = '#00C875'; badgeCol = '#FFFFFF'; 
                      }
                      
                      return `
                        <tr style="border-bottom:1px solid #E6E9EF; transition:background 0.2s;">
                          <td style="padding:12px 8px; color:#323338; font-weight:600;">${UI.esc(row.member_name)} <span style="font-size:10px; font-weight:normal; color:#676879; border:1px solid #E6E9EF; padding:2px 6px; border-radius:4px; margin-left:6px;">${UI.esc(shiftIcon(row.member_shift))} ${UI.esc(row.member_shift || 'N/A')}</span></td>
                          <td style="padding:12px 8px; color:#323338; font-weight:500;">${UI.esc(row.total)} items</td>
                          <td style="padding:12px 8px; color:#676879;">${UI.esc(row.distribution_title)}</td>
                          <td style="padding:12px 8px;">
                            <div style="height:10px; background:#E6E9EF; border-radius:999px; overflow:hidden; min-width:140px;">
                              <div style="height:100%; width:${Math.max(0, Math.min(100, progress))}%; background:#0073EA;"></div>
                            </div>
                            <div class="small muted" style="margin-top:4px; color:#676879; font-weight:600;">${UI.esc(progress)}%</div>
                          </td>
                          <td style="padding:12px 8px;"><span style="background:${badgeBg}; color:${badgeCol}; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:800; letter-spacing:0.5px;">${UI.esc(label)}</span></td>
                        </tr>
                      `;
                    }).join('') || '<tr><td colspan="5" class="muted" style="padding:12px 8px;">No workload rows for this distribution.</td></tr>'}
                  </tbody>
                </table>
              </div>
            `).join('') || '<div class="small muted" style="padding:16px; text-align:center; color:#676879;">No workload matrix data found.</div>'}
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
        if (!token) return;

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
          try { if (watchTimer) clearInterval(watchTimer); } catch (_) { } // CLEAR THE WATCHER ON EXIT
          state.subscription = null;
        };
      } catch (_) { }
    };

    // BOSS THUNTER FIX: THE WATCHER! 
    // This checks every 1 second if the UI Auto-Refresh killed the component. 
    // If it did, it instantly re-injects the HTML.
    watchTimer = setInterval(() => {
        const host = root.querySelector('.dashx');
        if (host && !root.querySelector('#teamWorkloadPulseMount')) {
            renderWidget(); // Bring it back to life!
        }
    }, 1000);

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