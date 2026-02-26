(function(){
  const Config = {
    // Single source of truth for build label used by login + app.
    BUILD: (typeof window!=='undefined' && window.MUMS_VERSION && window.MUMS_VERSION.buildLabel) ? window.MUMS_VERSION.buildLabel : 'MUMS Phase 1',
    APP: {
      shortName: 'MUMS',
      fullName: 'MUMS User Management System'
    },
    TZ: 'Asia/Manila',
    USERNAME_EMAIL_DOMAIN: 'mums.local',
    ROLES: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      SUPER_USER: 'SUPER_USER',
      ADMIN: 'ADMIN',
      TEAM_LEAD: 'TEAM_LEAD',
      MEMBER: 'MEMBER',
    },

    // Team schedule times + Mailbox duty times (24h HH:MM)
    TEAMS: [
      { id: 'morning', label: 'Morning Shift', teamStart: '06:00', teamEnd: '15:00', dutyStart: '06:00', dutyEnd: '15:00' },
      { id: 'mid', label: 'Mid Shift', teamStart: '13:00', teamEnd: '22:00', dutyStart: '15:00', dutyEnd: '22:00' },
      { id: 'night', label: 'Night Shift', teamStart: '22:00', teamEnd: '06:00', dutyStart: '22:00', dutyEnd: '06:00' },
    ],

    // Developer Access (unassigned shift). Stored as NULL in DB; represented as empty string in client.
    DEV_TEAM: { id:'', label:'Developer Access', teamStart:'00:00', teamEnd:'23:59', dutyStart:'00:00', dutyEnd:'23:59' },

    SCHEDULES: {
      mailbox_manager: { id: 'mailbox_manager', label: 'Mailbox Manager', icon: '📥' },
      back_office: { id: 'back_office', label: 'Back Office', icon: '🗄️' },
      call_available: { id: 'call_available', label: 'Call Available', icon: '📞' },
      // Renamed per ops terminology: "Call Available" (keep same id/icon for compatibility)
      call_onqueue: { id: 'call_onqueue', label: 'Call Available', icon: '📞' },
      mailbox_call: { id: 'mailbox_call', label: 'Mailbox Manager + Call', icon: '📥📞' },
      block: { id: 'block', label: 'Block', icon: '⛔' },
      lunch: { id: 'lunch', label: 'Lunch', icon: '🍽️' },
    },

    // Theme presets (Enterprise Standard - Aurora Midnight + Monochrome only)
THEMES: [
  {
    id:'aurora_midnight',
    name:'Aurora Midnight',
    mode:'dark',
    bg:'#0f172a',
    panel:'#1a2742',
    panel2:'#22314f',
    text:'#f4f7ff',
    muted:'#c6d2ea',
    border:'rgba(179,199,255,.34)',
    accent:'#7f9bff',
    bgRad1:'#2a3b67',
    bgRad3:'#0c1427',
    font:"'Plus Jakarta Sans', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    radius:'16px',
    shadow:'0 16px 34px rgba(5,10,24,.34)',
    description:'Balanced midnight blue theme with brighter enterprise contrast and reduced eye strain.'
  },
  {
    id:'mono',
    name:'Monochrome',
    mode:'dark',
    bg:'#0b0c10',
    panel:'#13151b',
    panel2:'#0f1116',
    text:'#f3f4f6',
    muted:'#b7bcc6',
    border:'rgba(255,255,255,.10)',
    accent:'#a3a3a3',
    bgRad1:'#1a1d26',
    bgRad3:'#050608',
    font:"'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    radius:'12px',
    shadow:'0 10px 24px rgba(0,0,0,.40)',
    description:'Minimalist grayscale palette for distraction-free focus.'
  }
],


    // Navigation is intentionally user-facing only.
    // Note: GMT Overview remains available via Settings → World Clocks, but is not shown in the main menu.
    NAV: [
      { id: 'dashboard', label: 'Dashboard', icon: '🏠', perm: 'view_dashboard' },
      { id: 'mailbox', label: 'Mailbox', icon: '📨', perm: 'view_mailbox' },
      { id: 'overall_stats', label: 'OVER ALL STATS', icon: '📊', perm: 'view_members' },

      {
        id: 'team',
        label: 'Team',
        icon: '👥',
        perm: 'view_members',
        children: [
          { id: 'members', label: 'Members', icon: '👥', perm: 'view_members' },
          { id: 'master_schedule', label: 'Master Schedule', icon: '📅', perm: 'view_master_schedule' },
          { id: 'team_config', label: 'Team Task Settings', icon: '🛠️', perm: 'manage_team_config' },
          { id: 'distribution_monitoring', label: 'Command Center', icon: '🛰️', perm: 'view_distribution_monitoring', route: '/distribution/monitoring' },
        ]
      },

      {
        id: 'admin',
        label: 'Administration',
        icon: '🧾',
        perm: 'create_users',
        children: [
          { id: 'users', label: 'User Management', icon: '👤', perm: 'create_users' },
          { id: 'announcements', label: 'Announcements', icon: '📣', perm: 'manage_announcements' },
          { id: 'logs', label: 'Activity Logs', icon: '🧾', perm: 'view_logs' },
          { id: 'privileges', label: 'Privileges', icon: '🔐', perm: 'manage_privileges' },
        ]
      },


      {
        id: 'my_record',
        label: 'My Record',
        icon: '🗂️',
        perm: 'view_my_record',
        children: [
          { id: 'my_attendance', label: 'My Attendance', icon: '📝', perm: 'view_my_record' },
          { id: 'my_schedule', label: 'My Schedule', icon: '📅', perm: 'view_my_record' },
          { id: 'my_case', label: 'My Case', icon: '📨', perm: 'view_my_record' },
          { id: 'my_task', label: 'My Task', icon: '✅', perm: 'view_my_record' },
          { id: 'my_quickbase', label: 'My Quickbase', icon: 'database' },
        ]
      },

      { id: 'my_reminders', label: 'My Reminders', icon: '⏰', perm: 'view_my_reminders' },
      { id: 'team_reminders', label: 'Team Reminders', icon: '🚨', perm: 'view_team_reminders' },
    ],

    // Permissions are intentionally flat strings to keep the app usable without a backend.
    // New: manage_release_notes (grants Add/Import/Export/Delete release notes).
	    PERMS: {
	      SUPER_ADMIN: ['*','create_users','view_logs','view_my_record','view_gmt_overview','view_distribution_monitoring'],
	      SUPER_USER: ['view_dashboard','view_mailbox','view_members','manage_release_notes','view_master_schedule','view_my_record','view_my_reminders','view_team_reminders','manage_team_reminders','create_users','view_logs','view_gmt_overview','view_distribution_monitoring'],
	      ADMIN: ['view_dashboard','view_mailbox','view_members','manage_users','manage_announcements','manage_release_notes','manage_members_scheduling','view_master_schedule','view_my_record','view_logs','view_gmt_overview','view_distribution_monitoring'],
	      TEAM_LEAD: ['view_dashboard','view_mailbox','view_members','manage_members_scheduling','manage_announcements','view_master_schedule','view_my_record','view_my_reminders','view_team_reminders','manage_team_reminders','create_users','manage_team_config','view_logs','view_gmt_overview','view_distribution_monitoring'],
	      MEMBER: ['view_dashboard','view_mailbox','view_my_record','view_my_reminders','view_team_reminders','view_gmt_overview'],
	    },

    can(roleOrUser, perm){
      const user = (roleOrUser && typeof roleOrUser === 'object') ? roleOrUser : null;
      const role = (typeof roleOrUser === 'string') ? roleOrUser : (roleOrUser && roleOrUser.role);
      const p = this.PERMS[role] || [];
      let allowed = p.includes('*') || p.includes(perm);

      // Apply role-level overrides (Super Admin configurable).
      try{
        if(window.Store && Store.getRolePermOverrides){
          const ov = Store.getRolePermOverrides();
          if(ov && ov[role] && Object.prototype.hasOwnProperty.call(ov[role], perm)){
            allowed = !!ov[role][perm];
          }
        }
      }catch(_){}

      // User delegated privileges override role restrictions.
      try{
        if(user && window.Store && Store.userHasExtraPerm && Store.userHasExtraPerm(user.id, perm)){
          return true;
        }
      }catch(_){}

      return allowed;
    },

    teamById(id){
      // Developer Access is the default when team_id is NULL.
      if(id===null || id===undefined || String(id).trim()==='') return this.DEV_TEAM;
      return this.TEAMS.find(t => t.id===id) || this.TEAMS[0];
    },

    scheduleById(id){
      return this.SCHEDULES[id] || null;
    },

    // Map a shift/team key to its configured window (used by Members Graph Panel).
    // Accepts keys like: 'morning' | 'mid' | 'night' | 'dev' | 'developer_access'
    shiftByKey(key){
      try{
        const raw = String(key || '').trim();
        const k = raw.toLowerCase().replace(/\s+/g,'_');
        const teams = Config.TEAMS || {};

        // direct id match (morning/mid/night/dev)
        let t = teams[k] || null;

        // common aliases
        if(!t){
          if(k.includes('morning')) t = teams.morning || null;
          else if(k.includes('mid')) t = teams.mid || null;
          else if(k.includes('night')) t = teams.night || null;
          else if(k.includes('dev')) t = teams.dev || null;
        }

        // role/team objects sometimes pass full label
        if(!t && raw){
          const rk = raw.toLowerCase();
          if(rk.includes('morning')) t = teams.morning || null;
          else if(rk.includes('mid')) t = teams.mid || null;
          else if(rk.includes('night')) t = teams.night || null;
          else if(rk.includes('developer')) t = teams.dev || null;
        }

        if(!t) t = teams.morning || { id:'morning', label:'Morning Shift', teamStart:'06:00', teamEnd:'15:00', dutyStart:'06:00', dutyEnd:'15:00' };

        const startHM = t.startHM || t.teamStart || '06:00';
        const endHM = t.endHM || t.teamEnd || '15:00';
        const parseHM = (hm)=>{
          const parts = String(hm||'').split(':');
          const h = parseInt(parts[0], 10);
          const m = parseInt(parts[1] || 0, 10);
          if(Number.isNaN(h) || Number.isNaN(m)) return 0;
          return h*60 + m;
        };
        const sm = parseHM(startHM);
        let em = parseHM(endHM);
        let lenMin = em - sm;
        if(lenMin <= 0) lenMin += 24*60;

        return {
          key: t.id || k,
          label: t.label || raw || k,
          startHM,
          endHM,
          dutyStart: t.dutyStart || startHM,
          dutyEnd: t.dutyEnd || endHM,
          lenMin,
        };
      }catch(_){ return null; }
    },
  };

  window.Config = Config;
})();
