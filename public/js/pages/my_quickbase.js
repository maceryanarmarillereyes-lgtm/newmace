/**
 * public/js/pages/my_quickbase.js
 * High Level Enterprise UI - User Configuration Mode
 */
(function(){
  window.Pages = window.Pages || {};
  window.Pages.my_quickbase = async function(root) {
    const me = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    let profile = null;

    if (me && window.Store && Store.getProfile) {
      profile = Store.getProfile(me.id);
    }

    const currentLink = profile?.qb_report_link || '';
    const currentQid = profile?.qb_qid || '';
    root.innerHTML = `
  <div class="dashx">
    <div class="dashx-head">
      <div>
        <h2 class="ux-h1" style="margin:0">My Quickbase Settings</h2>
        <div class="small muted ux-sub">Configure your personal Quickbase report connection</div>
      </div>
    </div>

    <div class="card pad" style="margin-top:20px; max-width: 600px; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.06);">
      <div class="h3" style="margin-top:0; color:#38bdf8;">Report Configuration</div>
      <div class="small muted" style="margin-bottom:16px;">
        Enter your target Quickbase Report Link and Query ID (qID). This will uniquely bind your view to your personal Quickbase filters. Note: Ensure your Quickbase Token is set in your Profile Settings.
      </div>
      <div style="display:grid; gap:14px;">
        <label class="field">
          <div class="label" style="font-weight:700;">Full Report Link</div>
          <input class="input" type="text" id="qbReportLink" placeholder="https://<realm>.quickbase.com/nav/app/.../q?qid=..." value="${window.UI ? window.UI.esc(currentLink) : currentLink}" />
        </label>
        <label class="field">
          <div class="label" style="font-weight:700;">Query ID (qID)</div>
          <input class="input" type="text" id="qbQid" placeholder="e.g. -2021117" value="${window.UI ? window.UI.esc(currentQid) : currentQid}" />
        </label>
        <div class="row" style="justify-content:flex-end; gap:10px; margin-top:10px;">
          <button class="btn primary" id="saveQbSettingsBtn" type="button">Save Settings</button>
        </div>
      </div>
    </div>
  </div>
`;
    const saveBtn = root.querySelector('#saveQbSettingsBtn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!me) {
          if(window.UI) UI.toast('User not found. Please relogin.', 'error');
          return;
        }

        const link = root.querySelector('#qbReportLink').value.trim();
        const qid = root.querySelector('#qbQid').value.trim();

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
          let realm = '';
          let tableId = '';
          try {
            if(link.includes('quickbase.com')) {
              const urlObj = new URL(link);
              realm = urlObj.hostname;
              const match = link.match(/table\/([a-zA-Z0-9]+)/);
              if (match && match[1]) tableId = match[1];
            }
          } catch(e) { console.warn('Could not parse Quickbase URL automatically.'); }

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

          // STRICT OVERRIDE: Use mums_profiles and user_id
          const { error } = await window.__MUMS_SB_CLIENT
            .from('mums_profiles')
            .update({
              qb_report_link: link,
              qb_qid: qid,
              qb_realm: realm,
              qb_table_id: tableId
            })
            .eq('user_id', me.id);
          if (error) throw error;

          // Sync local store
          if (window.Store && Store.setProfile) {
            Store.setProfile(me.id, {
              qb_report_link: link,
              qb_qid: qid,
              qb_realm: realm,
              qb_table_id: tableId,
              updatedAt: Date.now()
            });
          }
          if(window.UI) UI.toast('Quickbase settings saved successfully!');
        } catch (err) {
          console.error('Quickbase Settings Save Error:', err);
          if(window.UI) UI.toast('Failed to save settings: ' + err.message, 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Settings';
        }
      };
    }
  };
})();
