
function canEdit(actor, row) {
  if (!actor || !row) return false;
  const aRole = (actor.role || '').toUpperCase();
  const rRole = (row.role || '').toUpperCase();

  if (aRole === 'SUPER_ADMIN') return true;

  if (aRole === 'TEAM_LEAD') {
    // Team lead can edit members of their own team only.
    if (rRole !== 'MEMBER') return false;
    return (actor.team_id || '') === (row.team_id || '');
  }

  // Regular members can only edit themselves (limited fields enforced server-side/RLS).
  return actor.user_id && row.user_id && actor.user_id === row.user_id;
}

function canSchedule(actor, target){
  // Schedule changes are an additional setting (NOT part of creation)
  // Allowed: SUPER_ADMIN / ADMIN, or TEAM_LEAD for members in their own team.
  if(!actor || !target) return false;
  if(target.role!==Config.ROLES.MEMBER) return false;
  if(actor.role===Config.ROLES.SUPER_ADMIN) return true;
  if(actor.role===Config.ROLES.ADMIN) return true;
  if(actor.role===Config.ROLES.TEAM_LEAD) return target.teamId===actor.teamId;
  return false;
}

function canCreateRole(actor, targetRole) {
  if (!actor) return false;
  const aRole = (actor.role || '').toUpperCase();
  const tRole = (targetRole || '').toUpperCase();

  if (aRole === 'SUPER_ADMIN') {
    // Super admin can create any role except SUPER_ADMIN (reserved).
    return tRole !== 'SUPER_ADMIN';
  }
  if (aRole === 'TEAM_LEAD') {
    // Team lead can only create MEMBER accounts.
    return tRole === 'MEMBER';
  }
  return false;
}

(window.Pages=window.Pages||{}, window.Pages.users = function(root){
  const actor = Auth.getUser();
  let users = Store.getUsers();

  const isCloudMode = !!(window.CloudAuth && CloudAuth.isEnabled && CloudAuth.isEnabled() && window.CloudUsers && typeof CloudUsers.refreshIntoLocalStore === 'function');

  function renderRows(){
    const tbody = root.querySelector('tbody[data-users-tbody]');
    if(!tbody) return;
    // Always re-read to reflect realtime changes.
    users = Store.getUsers();

    // Requirement: Team Leads should only see users belonging to their own shift/team.
    // (Admins/Super Admins retain full visibility.)
    let visible = users;
    try{
      if(actor && actor.role===Config.ROLES.TEAM_LEAD){
        visible = (users||[]).filter(u => (u && (u.teamId===actor.teamId || u.id===actor.id)));
      }
    }catch(_){ visible = users; }

    tbody.innerHTML = visible.map(u=>{
      const isSuper = String(u.role||'')===String(Config.ROLES.SUPER_ADMIN);
      const team = Config.teamById(u.teamId);
      const sched = isSuper ? null : Config.scheduleById(u.schedule);
      const can = canEdit(actor,u);
      return `
            <tr>
              <td>${UI.esc(u.name||u.username)}</td>
              <td><div class=\"small\">${UI.esc(u.username)}</div><div class=\"small\">${UI.esc(u.email||'')}</div></td>
              <td>${UI.esc(u.role)}</td>
              <td>${UI.esc(team ? team.label : '—')}</td>
              <td>${sched ? UI.schedulePill(sched.id) : '<span class="small">—</span>'}</td>
              <td>
                <div class=\"row\" style=\"gap:8px\">
                  <button class=\"btn\" data-act=\"profileUser\" data-id=\"${u.id}\">Profile</button>
                  <button class=\"btn\" data-act=\"editUser\" data-id=\"${u.id}\" ${can?'':'disabled'}>Edit</button>
                  <button class=\"btn danger\" data-act=\"delUser\" data-id=\"${u.id}\" ${can && u.username!=='MUMS'?'':'disabled'}>Delete</button>
                </div>
              </td>
            </tr>
          `;
    }).join('');
  }

  root.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0 0 6px">User Management</h2>
        <div class="small">Create users and assign roles, teams, and schedules. Super User (MUMS) controls everything.</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn" id="btnExportUsers">Export Users</button>
        <button class="btn" id="btnImportUsers">Import Users</button>
        <button class="btn primary" id="btnAddUser">Add User</button>
      </div>
    </div>

    <table class="table" style="margin-top:10px">
      <thead>
        <tr><th>Name</th><th>Login</th><th>Role</th><th>Team</th><th>Schedule</th><th>Actions</th></tr>
      </thead>
      <tbody data-users-tbody></tbody>
    </table>

    <div class="modal" id="profileModal" aria-hidden="true">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="p_title">User Profile</div>
            <div class="small" id="p_sub">Manage account and scheduling.</div>
          </div>
          <button class="btn ghost" data-close="profileModal">✕</button>
        </div>
        <div class="body">
          <div class="tabs">
            <button class="tab active" id="tabAccount" type="button">Account</button>
            <button class="tab" id="tabScheduling" type="button">Scheduling</button>
          </div>

          <div id="panelAccount"></div>
          <div id="panelScheduling" style="display:none"></div>
        </div>
      </div>
    </div>

    <div class="modal" id="userModal" aria-hidden="true">
      <div class="panel">
        <div class="head">
          <div>
            <div class="announce-title" id="userModalTitle">Add User</div>
            <div class="small">Create credentials so members can log in.</div>
          </div>
          <button class="btn ghost" data-close="userModal">✕</button>
        </div>
        <div class="body">
          <div class="grid2">
            <div>
              <label class="small">Full name</label>
              <input class="input" id="u_name" placeholder="Juan Dela Cruz" />
            </div>
            <div>
              <label class="small">Username</label>
              <input class="input" id="u_username" placeholder="jdelacruz" />
            </div>
            <div>
              <label class="small">Email (generated)</label>
              <input class="input" id="u_email" placeholder="username@mums.local" readonly />
            </div>
            <div>
              <label class="small">Password</label>
              <input class="input" id="u_password" type="password" placeholder="••••••••" />
            </div>
            <div>
              <label class="small">Role</label>
              <select class="select" id="u_role"></select>
            </div>
            <div>
              <label class="small">Team</label>
              <select class="select" id="u_team"></select>
            </div>
            <!-- Schedule and Status removed from creation (managed in Profile > Scheduling) -->
          </div>
          <div class="err" id="u_err"></div>
          <div class="row" style="justify-content:flex-end;margin-top:12px">
            <button class="btn" data-close="userModal">Cancel</button>
            <button class="btn primary" id="btnSaveUser">Save</button>
          </div>
        </div>
      </div>
    </div>
  `;

  if(isCloudMode){
    const tbody = root.querySelector('tbody[data-users-tbody]');
    if(tbody){ tbody.innerHTML = '<tr><td colspan="6"><span class="small">Loading cloud roster…</span></td></tr>'; }
    (async()=>{
      try{ await CloudUsers.refreshIntoLocalStore(); }catch(_){ }
      renderRows();
    })();
  } else {
    renderRows();
  }

// UI permission hardening: only SUPER_ADMIN and TEAM_LEAD can create/import/export users.
const createAllowed = !!actor && ['SUPER_ADMIN', 'TEAM_LEAD'].includes((actor.role || '').toUpperCase());
if (!createAllowed) {
  const hide = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  };
  hide('btnAddUser');
  hide('btnImportUsers');
  hide('btnExportUsers');
}

  if(isCloudMode){
    // Cloud mode: roster is authoritative from Supabase; importing/exporting local rosters can reintroduce duplicates.
    const hide2 = (id)=>{ const el=document.getElementById(id); if(el) el.style.display='none'; };
    hide2('btnImportUsers');
    hide2('btnExportUsers');
  }


  // fill selects
  const roleSel = UI.el('#u_role');
  const teamSel = UI.el('#u_team');
  // schedule assignment is handled in the Profile modal

  roleSel.innerHTML = Object.values(Config.ROLES)
    .filter(r=>canCreateRole(actor,r))
    .map(r=>`<option value="${r}">${r}</option>`).join('');

  teamSel.innerHTML = `<option value="">Developer Access</option>` + Config.TEAMS.map(t=>`<option value="${t.id}">${t.label}</option>`).join('');
  // (no schedule select in Add User)

  // events
  const btnAddUser = document.getElementById('btnAddUser');
  if (btnAddUser) btnAddUser.onclick = ()=>openUserModal(actor, null);
  const btnExportUsers = document.getElementById('btnExportUsers');
  if (btnExportUsers) btnExportUsers.onclick = ()=>UI.downloadJSON('users.json', Store.getUsers());
  const btnImportUsers = document.getElementById('btnImportUsers');
  if (btnImportUsers) btnImportUsers.onclick = async()=>{
    const data = await UI.pickJSON();
    if(!Array.isArray(data)) return alert('Invalid JSON. Expected an array of users.');
    // apply restrictions
    const incoming = data.filter(u=>u && u.username);
    const cleaned = incoming.map(u=>({
      id: u.id || crypto.randomUUID(),
      username: String(u.username),
      email: u.email||'',
      name: u.name||u.username,
      role: u.role||Config.ROLES.MEMBER,
      teamId: u.teamId||Config.TEAMS[0].id,
      schedule: u.schedule||'back_office',
      status: u.status||'active',
      passwordHash: u.passwordHash || '',
      createdAt: u.createdAt || Date.now(),
    }));

    const existing = Store.getUsers();
    const meys = existing.find(u=>u.username==='MUMS');

    let finalUsers = cleaned;
    // Enforce: only SUPER_ADMIN can import SUPER_ADMIN
    if(actor.role!==Config.ROLES.SUPER_ADMIN){
      finalUsers = finalUsers.map(u=> (u.role===Config.ROLES.SUPER_ADMIN ? { ...u, role: Config.ROLES.MEMBER } : u));
    }
    // Team lead imports only their team
    if(actor.role===Config.ROLES.TEAM_LEAD){
      finalUsers = finalUsers.map(u=>({ ...u, role: Config.ROLES.MEMBER, teamId: actor.teamId }));
    }

    // keep MUMS always
    finalUsers = [meys, ...finalUsers.filter(u=>u.username!=='MUMS')];
    Store.saveUsers(finalUsers);
    window.location.hash = '#users';
  };

  
  // Event delegation (scoped to this page) — important: remove on route change to avoid cross-page collisions.
  const onClick = async (e)=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if(!act || !id) return;

    if(act==='editUser'){
      const u = Store.getUsers().find(x=>x.id===id);
      // Team Lead visibility guard (defense-in-depth; list is filtered but we guard actions too).
      if(actor && actor.role===Config.ROLES.TEAM_LEAD && u && u.id!==actor.id && u.teamId!==actor.teamId) return;
      if(u) openUserModal(actor, u);
      return;
    }
    if(act==='profileUser'){
      const u = Store.getUsers().find(x=>x.id===id);
      // Team Lead visibility guard (defense-in-depth; list is filtered but we guard actions too).
      if(actor && actor.role===Config.ROLES.TEAM_LEAD && u && u.id!==actor.id && u.teamId!==actor.teamId) return;
      if(u) openProfileModal(actor, u);
      return;
    }
    if(act==='delUser'){
      const u = Store.getUsers().find(x=>x.id===id);
      // Team Lead visibility guard (defense-in-depth; list is filtered but we guard actions too).
      if(actor && actor.role===Config.ROLES.TEAM_LEAD && u && u.id!==actor.id && u.teamId!==actor.teamId) return;
      if(!u) return;
      if(u.username==='MUMS') return;

      const ok = await UI.confirm({ title:'Delete User', message:`Delete ${u.username}?`, okText:'Delete', danger:true });
      if(!ok) return;

      // Delete + immediate UI refresh (no hash reload).
      Store.deleteUser(id);
      try{
        Store.addLog({
          ts: Date.now(),
          teamId: u.teamId || (actor && actor.teamId) || 'system',
          actorId: (actor && actor.id) || 'system',
          actorName: (actor && (actor.name||actor.username)) || 'SYSTEM',
          action: 'USER_DELETE',
          targetId: u.id,
          targetName: u.name || u.username,
          msg: `${(actor && (actor.name||actor.username)) || 'SYSTEM'} deleted user ${u.name||u.username}`,
          detail: `Username=${u.username}, Role=${u.role}, Team=${Config.teamById(u.teamId).label}`
        });
      }catch(_){}

      // If the current user deleted themselves, force logout to avoid inconsistent state.
      try{
        const cur = Auth.getUser();
        if(cur && cur.id===id){
          Auth.logout();
          window.location.href = 'login.html';
          return;
        }
      }catch(_){}

      renderRows();
      return;
    }
  };
  root.addEventListener('click', onClick);

  // ensure cleanup runs on route change
  root._cleanup = ()=>{
    try{ root.removeEventListener('click', onClick); }catch(_){}
  };
// modal close
  root.querySelectorAll('[data-close="userModal"]').forEach(b=>b.onclick=()=>UI.closeModal('userModal'));
  root.querySelectorAll('[data-close="profileModal"]').forEach(b=>b.onclick=()=>UI.closeModal('profileModal'));


function getUsernameDomain(){
  let domain = 'mums.local';
  try {
    const env = (window.EnvRuntime && typeof EnvRuntime.env === 'function') ? EnvRuntime.env() : (window.MUMS_ENV || {});
    domain = String(env.USERNAME_EMAIL_DOMAIN || domain).trim() || domain;
  } catch (_) {}
  try {
    if (window.Config && Config.USERNAME_EMAIL_DOMAIN) domain = String(Config.USERNAME_EMAIL_DOMAIN).trim() || domain;
  } catch (_) {}
  return domain;
}

function canonicalEmail(username){
  const u = String(username || '').trim();
  if (!u) return '';
  return `${u}@${getUsernameDomain()}`.toLowerCase();
}

function applyDevOptionForRole(role){
  const isSuper = String(role || '').toUpperCase() === String(Config.ROLES.SUPER_ADMIN);
  const sel = UI.el('#u_team');
  const devOpt = sel ? sel.querySelector('option[value=""]') : null;
  if (devOpt) devOpt.disabled = !isSuper;
  if (!isSuper && sel && sel.value === '') {
    sel.value = (Config.TEAMS[0] && Config.TEAMS[0].id) || 'morning';
  }
}

function openUserModal(actor, user){
  UI.el('#u_err').style.display='none';
  UI.el('#userModalTitle').textContent = user ? 'Edit User' : 'Add User';

  const isEdit = !!user;
  const isCloud = !!(window.CloudAuth && CloudAuth.isEnabled && CloudAuth.isEnabled() && window.CloudUsers);

  UI.el('#u_name').value = user?.name || '';
  UI.el('#u_username').value = user?.username || '';
  UI.el('#u_password').value = '';
  UI.el('#u_role').value = user?.role || roleSel.value;

  // Team: SUPER_ADMIN may be Developer Access (empty string); others must be shift team.
  UI.el('#u_team').value = (user && (user.teamId !== undefined && user.teamId !== null)) ? user.teamId : ((Config.TEAMS[0] && Config.TEAMS[0].id) || 'morning');

  // Email is read-only: generated for new users; preserved for existing users.
  const setEmail = () => {
    const uname = UI.el('#u_username').value.trim();
    const gen = canonicalEmail(uname);
    const cur = (user && user.email) ? String(user.email).trim() : '';
    UI.el('#u_email').value = isEdit ? (cur || gen) : gen;
  };
  setEmail();
  UI.el('#u_email').readOnly = true;

  // Cloud mode: prevent editing username/email for existing users to avoid breaking auth mapping.
  UI.el('#u_username').readOnly = (isCloud && isEdit);

  // Lock TL create/edit constraints
  const isTL = actor && actor.role===Config.ROLES.TEAM_LEAD;
  if(isTL){
    UI.el('#u_team').value = actor.teamId;
    UI.el('#u_team').disabled = true;
    UI.el('#u_role').value = Config.ROLES.MEMBER;
    UI.el('#u_role').disabled = true;
  }else{
    UI.el('#u_team').disabled = false;
    UI.el('#u_role').disabled = false;
  }

  // Lock editing SUPER_ADMIN role (bootstrap-only); SUPER_ADMIN team remains editable for SUPER_ADMIN actor.
  if(isEdit && user?.role===Config.ROLES.SUPER_ADMIN){
    UI.el('#u_role').disabled = true;
  }

  applyDevOptionForRole(UI.el('#u_role').value);
  UI.el('#u_role').onchange = ()=>applyDevOptionForRole(UI.el('#u_role').value);

  // Username -> email live generation (only for new users)
  UI.el('#u_username').oninput = ()=>{ if(!isEdit){ setEmail(); } };

  // Cloud mode: password changes are not supported from this UI (use Supabase admin).
  if(isCloud && isEdit){
    UI.el('#u_password').disabled = true;
    UI.el('#u_password').placeholder = 'Password changes via Supabase Admin';
  } else {
    UI.el('#u_password').disabled = false;
    UI.el('#u_password').placeholder = '••••••••';
  }

  // Permission hardening: only SUPER_ADMIN can edit SUPER_ADMIN
  if(isEdit && user?.role===Config.ROLES.SUPER_ADMIN && actor.role!==Config.ROLES.SUPER_ADMIN){
    UI.el('#btnSaveUser').disabled=true;
  } else {
    UI.el('#btnSaveUser').disabled=false;
  }

  UI.el('#btnSaveUser').onclick = async ()=>{
    const name = UI.el('#u_name').value.trim();
    const username = UI.el('#u_username').value.trim();
    const password = UI.el('#u_password').value;
    const role = UI.el('#u_role').value;
    const teamId = UI.el('#u_team').value;

    const err = (msg)=>{ const el=UI.el('#u_err'); el.textContent=msg; el.style.display='block'; };

    if(!name) return err('Name is required.');
    if(!username) return err('Username is required.');
    if(!/^[a-zA-Z0-9._-]{3,}$/.test(username)) return err('Username must be at least 3 characters and use letters/numbers/._-');

    // Role restrictions
    if(!canCreateRole(actor, role) && (user?.role!==role)) return err('You do not have permission to set that role.');
    if(actor.role===Config.ROLES.TEAM_LEAD && teamId!==actor.teamId) return err('Team Lead can only manage users in their team.');

    // Developer Access restriction
    if(String(role||'').toUpperCase() !== String(Config.ROLES.SUPER_ADMIN) && String(teamId||'')===''){
      return err('Developer Access is reserved for Super Admin. Choose Morning/Mid/Night shift.');
    }

    if(!isEdit && !password) return err('Password is required for new users.');

    if(isCloud){
      if(isEdit){
        // Self edits use update_me (supports SUPER_ADMIN team override)
        if(actor && user && actor.id===user.id && window.CloudUsers && typeof CloudUsers.updateMe === 'function'){
          const patch = { name };
          if(String(user.role||'').toUpperCase()===String(Config.ROLES.SUPER_ADMIN)){
            if(String(teamId)===''){
              patch.team_override = false;
              patch.team_id = null;
            } else {
              patch.team_override = true;
              patch.team_id = teamId;
            }
          }
          const out = await CloudUsers.updateMe(patch);
          if(!out.ok) return err(out.message || 'Update failed.');
        } else if(window.CloudUsers && typeof CloudUsers.updateUser === 'function'){
          const payload = { user_id: user.id, name };
          if(actor && actor.role===Config.ROLES.SUPER_ADMIN){
            payload.role = role;
            if(String(user.role||'').toUpperCase()===String(Config.ROLES.SUPER_ADMIN)){
              if(String(teamId)===''){
                payload.team_override = false;
                payload.team_id = null;
              } else {
                payload.team_override = true;
                payload.team_id = teamId;
              }
            } else {
              payload.team_id = teamId;
            }
          }
          const out = await CloudUsers.updateUser(payload);
          if(!out.ok) return err(out.message || 'Update failed.');
        }
      } else {
        const out = await CloudUsers.create({ username, name, password, role, team_id: teamId });
        if(!out.ok) return err(out.message || 'Create failed.');
      }

      try { await CloudUsers.refreshIntoLocalStore(); } catch(_) {}
      UI.closeModal('userModal');
      renderRows();
      return;
    }

    // Local/offline persistence
    const email = canonicalEmail(username);

    if(isEdit){
      const patch = { name, username, email: (user?.email || email), role, teamId };
      if(password) patch.passwordHash = Auth.hash(password);
      Store.updateUser(user.id, patch);
    } else {
      const newUser = {
        id: crypto.randomUUID(),
        name, username, email,
        role, teamId,
        schedule: null,
        status: 'active',
        passwordHash: Auth.hash(password),
        createdAt: Date.now(),
      };
      Store.addUser(newUser);
    }

    UI.closeModal('userModal');
    try { renderRows(); } catch (_) {}
  };

  UI.openModal('userModal');
}

  function openProfileModal(actor, user){
    const isSuper = String(user?.role||'')===String(Config.ROLES.SUPER_ADMIN);
    const team = Config.teamById(user.teamId);
    const sched = isSuper ? null : Config.scheduleById(user.schedule);
    const canSched = canSchedule(actor, user);

    UI.el('#p_title').textContent = `${user.name||user.username}`;
    UI.el('#p_sub').textContent = `Role: ${user.role} • Team: ${team ? team.label : '—'}`;

    const account = UI.el('#panelAccount');
    const scheduling = UI.el('#panelScheduling');

    account.innerHTML = `
      <div class="kv"><div class="small">Username</div><div>${UI.esc(user.username)}</div></div>
      <div class="kv"><div class="small">Email</div><div>${UI.esc(user.email||'—')}</div></div>
      <div class="kv"><div class="small">Role</div><div>${UI.esc(user.role)}</div></div>
      <div class="kv"><div class="small">Team</div><div>${UI.esc(team ? team.label : '—')}</div></div>
      <div class="kv"><div class="small">Status</div><div>${UI.esc(user.status||'active')}</div></div>
    `;

    scheduling.innerHTML = `
      <div class="small" style="margin-bottom:10px">Scheduling is a separate admin setting (not part of user creation).</div>
      <div class="grid2">
        <div>
          <label class="small">Current Schedule</label>
          <div>${sched ? UI.schedulePill(sched.id) : '<span class="small">—</span>'}</div>
        </div>
        <div>
          <label class="small">Assign Schedule</label>
          <select class="select" id="p_schedule" ${canSched ? '' : 'disabled'}>
            <option value="">— None —</option>
            ${Object.values(Config.SCHEDULES).map(s=>`<option value="${s.id}">${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:12px">
        <button class="btn primary" id="btnApplySchedule" ${canSched ? '' : 'disabled'}>Apply</button>
      </div>
      ${canSched?'' : '<div class="err" style="display:block;margin-top:10px">You do not have permission to change scheduling for this user.</div>'}
    `;

    // Super Admin accounts intentionally have no team/shift scheduling assignment.
    if(isSuper){
      scheduling.innerHTML = `
        <div class="card pad" style="border-style:dashed">
          <div style="font-weight:800">Scheduling</div>
          <div class="small muted" style="margin-top:6px">
            Super Admin accounts are not assigned to a specific team/shift or schedule.
          </div>
        </div>
      `;
    }


    // tabs
    const tabAccount = UI.el('#tabAccount');
    const tabScheduling = UI.el('#tabScheduling');
    tabAccount.onclick = ()=>{ tabAccount.classList.add('active'); tabScheduling.classList.remove('active'); account.style.display='block'; scheduling.style.display='none'; };
    tabScheduling.onclick = ()=>{ tabScheduling.classList.add('active'); tabAccount.classList.remove('active'); account.style.display='none'; scheduling.style.display='block'; };

    // default select
    const sel = scheduling.querySelector('#p_schedule');
    if(sel) sel.value = user.schedule || '';

    const applyBtn = scheduling.querySelector('#btnApplySchedule');
    if(applyBtn) applyBtn.onclick = ()=>{
      if(!canSched) return;
      const newSched = sel.value || null;
      Store.updateUser(user.id, { schedule: newSched });
      UI.closeModal('profileModal');
      window.location.reload();
    };

    // open modal
    UI.openModal('profileModal');
    // default to Account tab
    tabAccount.onclick();
  }
}
);
