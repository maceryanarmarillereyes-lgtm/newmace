/**
 * public/js/pages/my_quickbase.js
 * High Level Enterprise UI - User Configuration Mode
 */
(function(){
  window.Pages = window.Pages || {};

  function getSafeValue(v, fallback) {
    const raw = String(v == null ? '' : v).trim();
    return raw || String(fallback || '');
  }

  function esc(v) {
    if (window.UI && typeof window.UI.esc === 'function') return window.UI.esc(v);
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseQuickbaseLink(link) {
    const out = { realm: '', tableId: '' };
    const value = String(link || '').trim();
    if (!value) return out;

    try {
      const urlObj = new URL(value);
      out.realm = String(urlObj.hostname || '').trim();
    } catch (_) {}

    const dbMatch = value.match(/\/db\/([a-zA-Z0-9]+)/i);
    if (dbMatch && dbMatch[1]) out.tableId = String(dbMatch[1]).trim();

    if (!out.tableId) {
      const tableMatch = value.match(/\/table\/([a-zA-Z0-9]+)/i);
      if (tableMatch && tableMatch[1]) out.tableId = String(tableMatch[1]).trim();
    }

    return out;
  }

  function renderRecords(root, payload) {
    const host = root.querySelector('#qbDataBody');
    const meta = root.querySelector('#qbDataMeta');
    if (!host || !meta) return;

    const columns = Array.isArray(payload && payload.columns) ? payload.columns : [];
    const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];

    if (!columns.length || !rows.length) {
      meta.textContent = 'No Quickbase Records Found';
      host.innerHTML = `
        <div style="padding:28px; border-radius:14px; background: linear-gradient(135deg, rgba(30,41,59,.45), rgba(2,6,23,.72)); border:1px solid rgba(148,163,184,.25); box-shadow:0 10px 35px rgba(0,0,0,.35); color:#cbd5e1;">
          <div style="font-size:15px; font-weight:700; color:#e2e8f0;">No Quickbase Records Found</div>
          <div style="margin-top:8px; font-size:12px; color:#94a3b8;">Check Connection: verify Token, Realm Link, Table in report URL, and Query ID.</div>
        </div>
      `;
      return;
    }

    meta.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} loaded`;

    const headers = columns.map((c) => `<th style="text-align:left; padding:10px 8px; font-size:11px; color:#93c5fd; border-bottom:1px solid rgba(255,255,255,.08);">${esc(c.label || c.id || 'Field')}</th>`).join('');
    const body = rows.map((r) => {
      const cells = columns.map((c) => {
        const field = r && r.fields ? r.fields[String(c.id)] : null;
        const value = getSafeValue(field && field.value, 'N/A');
        return `<td style="padding:9px 8px; border-bottom:1px solid rgba(255,255,255,.05); color:#e2e8f0; font-size:12px;">${esc(value)}</td>`;
      }).join('');
      return `<tr><td style="padding:9px 8px; border-bottom:1px solid rgba(255,255,255,.05); color:#bae6fd; font-size:12px; font-weight:700;">${esc(getSafeValue(r && r.qbRecordId, 'N/A'))}</td>${cells}</tr>`;
    }).join('');

    host.innerHTML = `
      <div style="overflow:auto; border:1px solid rgba(255,255,255,.08); border-radius:12px; background: rgba(15,23,42,.55);">
        <table style="width:100%; border-collapse:collapse; min-width:760px;">
          <thead><tr><th style="text-align:left; padding:10px 8px; font-size:11px; color:#93c5fd; border-bottom:1px solid rgba(255,255,255,.08);">Case #</th>${headers}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  window.Pages.my_quickbase = async function(root) {
    const me = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    let profile = null;

    if (me && window.Store && Store.getProfile) {
      profile = Store.getProfile(me.id);
    }

    const currentLink = profile?.qb_report_link || profile?.quickbase_url || '';
    const currentQid = profile?.qb_qid || profile?.quickbase_qid || '';
    root.innerHTML = `
  <div class="dashx">
    <div class="dashx-head">
      <div>
        <h2 class="ux-h1" style="margin:0">My Quickbase Settings</h2>
        <div class="small muted ux-sub">Configure your personal Quickbase report connection</div>
      </div>
    </div>

    <div class="card pad" style="margin-top:20px; max-width: 760px; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.06);">
      <div class="h3" style="margin-top:0; color:#38bdf8;">Report Configuration</div>
      <div class="small muted" style="margin-bottom:16px;">
        Enter your target Quickbase Report Link and Query ID (qID). This will uniquely bind your view to your personal Quickbase filters. Note: Ensure your Quickbase Token is set in your Profile Settings.
      </div>
      <div style="display:grid; gap:14px;">
        <label class="field">
          <div class="label" style="font-weight:700;">Full Report Link</div>
          <input class="input" type="text" id="qbReportLink" placeholder="https://&lt;realm&gt;.quickbase.com/db/&lt;tableid&gt;?a=q&amp;qid=..." value="${esc(currentLink)}" />
        </label>
        <label class="field">
          <div class="label" style="font-weight:700;">Query ID (qID)</div>
          <input class="input" type="text" id="qbQid" placeholder="e.g. -2021117" value="${esc(currentQid)}" />
        </label>
        <div class="row" style="justify-content:flex-end; gap:10px; margin-top:10px;">
          <button class="btn primary" id="saveQbSettingsBtn" type="button">Save Settings</button>
          <button class="btn" id="reloadQbDataBtn" type="button">Reload Data</button>
        </div>
      </div>
    </div>

    <div class="card pad" style="margin-top:18px; background: rgba(2,6,23,.55); border:1px solid rgba(148,163,184,.2); backdrop-filter: blur(10px);">
      <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div class="h3" style="margin:0; color:#7dd3fc;">Quickbase Records</div>
        <div id="qbDataMeta" class="small muted">Loading...</div>
      </div>
      <div id="qbDataBody"></div>
    </div>
  </div>
`;

    async function loadQuickbaseData() {
      const host = root.querySelector('#qbDataBody');
      const meta = root.querySelector('#qbDataMeta');
      if (host) {
        host.innerHTML = '<div style="padding:18px; border-radius:12px; background:rgba(15,23,42,.5); border:1px solid rgba(255,255,255,.08); color:#cbd5e1;">Loading Quickbase data...</div>';
      }
      if (meta) meta.textContent = 'Loading...';

      try {
        if (!window.QuickbaseAdapter || typeof window.QuickbaseAdapter.fetchMonitoringData !== 'function') {
          throw new Error('Quickbase adapter unavailable');
        }
        const data = await window.QuickbaseAdapter.fetchMonitoringData();
        renderRecords(root, data || {});
      } catch (err) {
        if (meta) meta.textContent = 'Check Connection';
        if (host) {
          host.innerHTML = `
            <div style="padding:24px; border-radius:14px; background: linear-gradient(135deg, rgba(30,41,59,.5), rgba(15,23,42,.72)); border:1px solid rgba(248,113,113,.25); box-shadow:0 10px 35px rgba(0,0,0,.35); color:#fecaca;">
              <div style="font-size:15px; font-weight:700; color:#fca5a5;">Check Connection</div>
              <div style="margin-top:8px; font-size:12px; color:#fecdd3;">${esc(String(err && err.message ? err.message : 'Unable to load Quickbase records.'))}</div>
            </div>
          `;
        }
      }
    }

    const saveBtn = root.querySelector('#saveQbSettingsBtn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!me) {
          if(window.UI) UI.toast('User not found. Please relogin.', 'error');
          return;
        }

        const link = String((root.querySelector('#qbReportLink') || {}).value || '').trim();
        const qid = String((root.querySelector('#qbQid') || {}).value || '').trim();

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          const parsed = parseQuickbaseLink(link);

          if(!window.__MUMS_SB_CLIENT){
            const env = (window.EnvRuntime && EnvRuntime.env && EnvRuntime.env()) || (window.MUMS_ENV || {});
            const token = (window.CloudAuth && CloudAuth.accessToken) ? String(CloudAuth.accessToken() || '').trim() : '';
            if(window.supabase && typeof window.supabase.createClient === 'function' && env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY && token){
              window.__MUMS_SB_CLIENT = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
                auth: {
                  persistSession: false,
                  autoRefreshToken: false,
                  detectSessionInUrl: false,
                  storage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
                  storageKey: 'mums_shared'
                },
                realtime: { params: { eventsPerSecond: 10 } },
                global: { headers: { Authorization: 'Bearer ' + token } }
              });
            }
          }
          if(!window.__MUMS_SB_CLIENT){
            throw new Error('Supabase client is not ready. Please relogin and try again.');
          }

          const { error } = await window.__MUMS_SB_CLIENT
            .from('mums_profiles')
            .update({
              qb_report_link: link,
              qb_qid: qid,
              qb_realm: parsed.realm,
              qb_table_id: parsed.tableId
            })
            .eq('user_id', me.id);
          if (error) throw error;

          if (window.Store && Store.setProfile) {
            Store.setProfile(me.id, {
              qb_report_link: link,
              qb_qid: qid,
              qb_realm: parsed.realm,
              qb_table_id: parsed.tableId,
              updatedAt: Date.now()
            });
          }
          if(window.UI) UI.toast('Quickbase settings saved successfully!');
          await loadQuickbaseData();
        } catch (err) {
          console.error('Quickbase Settings Save Error:', err);
          if(window.UI) UI.toast('Failed to save settings: ' + err.message, 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Settings';
        }
      };
    }

    const reloadBtn = root.querySelector('#reloadQbDataBtn');
    if (reloadBtn) {
      reloadBtn.onclick = () => loadQuickbaseData();
    }

    await loadQuickbaseData();
  };
})();
