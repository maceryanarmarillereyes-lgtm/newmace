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
    let watchTimer = null; // THE IMMORTAL WATCHER

    const renderWidget = () => {
      // Re-attach mount if UI.renderDashboard wipes it out!
      let mount = root.querySelector('#teamWorkloadPulseMount');
      if (!mount) {
          const host = root.querySelector('.dashx');
          if (host) {
              mount = document.createElement('div');
              mount.id = 'teamWorkloadPulseMount';
              host.appendChild(mount);
          } else {
              return; 
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
      const isMonday = document.body.dataset.theme === 'monday_workspace';

      if (isMonday) {
        mount.innerHTML = `
        <div class="ux-card dashx-panel" style="margin-top:20px; background:#FFFFFF; border:1px solid var(--monday-border); border-radius:8px; box-shadow:var(--monday-shadow); border-top: 6px solid var(--monday-accent) !important;">
          <div class="row between" style="padding:16px 24px; border-bottom:1px solid var(--monday-border-subtle);">
            <div>
              <div class="dashx-title" style="color:var(--monday-text-main); font-weight:900; font-size:20px; letter-spacing:-0.5px;">Team Workload Pulse</div>
              <div class="small muted" style="color:var(--monday-text-sub);">Enterprise Leadership View • Performance Matrix</div>
            </div>
            <select id="twpFilter" class="input" style="width:260px; font-weight:700; border: 1px solid var(--monday-border);">
              <option value="">All Active Distributions</option>
              ${titles.map((t) => `<option value="${UI.esc(t)}" ${state.filter === t ? 'selected' : ''}>${UI.esc(t)}</option>`).join('')}
            </select>
          </div>
          <div style="padding:24px;">
            ${Object.keys(byDist).map((dist) => `
              <div style="margin-bottom:20px; border:1px solid var(--monday-border); border-radius:8px; overflow:hidden;">
                <div style="background:var(--monday-bg); padding:12px 16px; font-weight:900; color:var(--monday-text-main); border-bottom:1px solid var(--monday-border); font-size:14px;">📁 ${UI.esc(dist)}</div>
                <table class="table" style="width:100%; border-collapse:collapse;">
                  <thead>
                    <tr style="background:#fff;">
                      <th style="text-align:left; padding:12px 16px; color:var(--monday-text-sub); border-bottom:1px solid var(--monday-border);">Member</th>
                      <th style="text-align:left; padding:12px 16px; color:var(--monday-text-sub); border-bottom:1px solid var(--monday-border);">Progress</th>
                      <th style="text-align:center; padding:12px 16px; color:var(--monday-text-sub); border-bottom:1px solid var(--monday-border);">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${byDist[dist].map((row) => {
                      const progress = row.total ? Math.round((row.done / row.total) * 100) : 0;
                      return `
                        <tr style="border-bottom:1px solid var(--monday-border-subtle);">
                          <td style="padding:12px 16px; font-weight:700; color:var(--monday-text-main);">${UI.esc(row.member_name || 'N/A')}</td>
                          <td style="padding:12px 16px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                              <div style="flex:1; height:8px; background:var(--monday-border-subtle); border-radius:4px; overflow:hidden;">
                                <div style="height:100%; width:${Math.max(0, Math.min(100, progress))}%; background:var(--monday-accent);"></div>
                              </div>
                              <span style="font-weight:900; font-size:12px; color:var(--monday-text-main); width:35px;">${progress}%</span>
                            </div>
                          </td>
                          <td style="padding:0; width:120px;">
                            <div class="status-pill ${progress >= 100 ? 'status-done' : 'status-working'}" style="height:44px; font-weight:800;">${progress >= 100 ? 'DONE' : 'WORKING'}</div>
                          </td>
                        </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `).join('')}
          </div>
        </div>`;
      } else {
        mount.innerHTML = `
          <div class="ux-card dashx-panel" style="margin-top:20px; background:#FFFFFF; border:1px solid #d0d4e4; border-radius:8px; box-shadow:0 4px 8px rgba(0,0,0,0.02);">
            <div class="row" style="justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap; padding:16px 24px; border-bottom:1px solid #e6e9ef;">
              <div>
                <div class="dashx-title" style="color:#323338; font-weight:700; font-size:18px;">Team Workload Pulse</div>
                <div class="small muted" style="color:#676879;">Leadership view across distribution groups.</div>
              </div>
              <div>
                <select id="twpFilter" class="ux-focusable" style="background:#FFFFFF; border:1px solid #c3c6d4; border-radius:4px; color:#323338; padding:6px 12px; font-size:13px;">
                  <option value="">All Active Tasks</option>
                  ${titles.map((t) => `<option value="${UI.esc(t)}" ${state.filter === t ? 'selected' : ''}>${UI.esc(t)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div style="padding:24px;">
              ${Object.keys(byDist).map((dist) => `
                <div class="card pad" style="margin-bottom:16px; border:1px solid #d0d4e4; background:#FFFFFF; border-radius:8px; overflow:hidden;">
                  <div class="small" style="margin-bottom:12px; color:#323338; padding:16px 16px 0 16px;"><b>${UI.esc(dist)}</b> <span style="color:#676879; margin-left:6px;">• ${UI.esc(byDist[dist].length)} members helping</span></div>
                  <table class="table" style="width:100%; border-collapse:collapse; margin-top:10px;">
                    <thead>
                      <tr>
                          <th style="text-align:left; padding:8px 16px; color:#676879; font-weight:400; font-size:13px; border-bottom:1px solid #d0d4e4; border-right:1px solid #e6e9ef;">Member</th>
                          <th style="text-align:left; padding:8px 16px; color:#676879; font-weight:400; font-size:13px; border-bottom:1px solid #d0d4e4; border-right:1px solid #e6e9ef;">Workload</th>
                          <th style="text-align:left; padding:8px 16px; color:#676879; font-weight:400; font-size:13px; border-bottom:1px solid #d0d4e4; border-right:1px solid #e6e9ef;">Distribution Source</th>
                          <th style="text-align:left; padding:8px 16px; color:#676879; font-weight:400; font-size:13px; border-bottom:1px solid #d0d4e4; border-right:1px solid #e6e9ef;">Progress Bar</th>
                          <th style="text-align:left; padding:8px 16px; color:#676879; font-weight:400; font-size:13px; border-bottom:1px solid #d0d4e4;">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${byDist[dist].map((row) => {
                        const progress = row.total ? Math.round((row.done / row.total) * 100) : 0;
                        const active = isShiftActive(row.member_shift);
                        let label = 'In Progress';
                        let badgeBg = '#f5f6f8';
                        let badgeCol = '#676879';

                        if (row.pending > 0 && !active) {
                            label = 'Waiting for Shift';
                            badgeBg = '#e6e9ef'; badgeCol = '#323338';
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
                          <tr style="border-bottom:1px solid #e6e9ef; transition:background 0.2s;">
                            <td style="padding:10px 16px; color:#323338; font-size:13px; border-right:1px solid #e6e9ef;">${UI.esc(row.member_name)} <span style="font-size:11px; color:#676879; margin-left:6px;">${UI.esc(shiftIcon(row.member_shift))} ${UI.esc(row.member_shift || 'N/A')}</span></td>
                            <td style="padding:10px 16px; color:#323338; font-size:13px; border-right:1px solid #e6e9ef;">${UI.esc(row.total)} items</td>
                            <td style="padding:10px 16px; color:#323338; font-size:13px; border-right:1px solid #e6e9ef;">${UI.esc(row.distribution_title)}</td>
                            <td style="padding:10px 16px; border-right:1px solid #e6e9ef;">
                              <div style="display:flex; align-items:center; gap:10px;">
                                  <div style="flex:1; height:8px; background:#e6e9ef; border-radius:4px; overflow:hidden;">
                                    <div style="height:100%; width:${Math.max(0, Math.min(100, progress))}%; background:#0073EA;"></div>
                                  </div>
                                  <div style="font-size:12px; color:#676879; width:35px; text-align:right;">${UI.esc(progress)}%</div>
                              </div>
                            </td>
                            <td style="padding:0;">
                              <div style="background:${badgeBg}; color:${badgeCol}; height:100%; min-height:40px; display:flex; align-items:center; justify-content:center; font-size:13px; text-transform:none;">${UI.esc(label)}</div>
                            </td>
                          </tr>
                        `;
                      }).join('') || '<tr><td colspan="5" class="muted" style="padding:16px;">No workload rows for this distribution.</td></tr>'}
                    </tbody>
                  </table>
                </div>
              `).join('') || '<div class="small muted" style="padding:16px; text-align:center; color:#676879;">No workload matrix data found.</div>'}
            </div>
          </div>
        `;
      }

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
          try { if (watchTimer) clearInterval(watchTimer); } catch (_) { }
          state.subscription = null;
        };
      } catch (_) { }
    };

    // BOSS THUNTER FIX: THE WATCHER!
    watchTimer = setInterval(() => {
        const host = root.querySelector('.dashx');
        if (host && !root.querySelector('#teamWorkloadPulseMount')) {
            renderWidget(); 
        }
    }, 1000);

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
