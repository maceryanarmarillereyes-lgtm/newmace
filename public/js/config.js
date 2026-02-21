/* File: public/js/config.js */

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

    // Developer Access
    TEAM_DEV: { id: '', label: 'Developer Access' },

    // Role-based capabilities
    PERMS: {
      SUPER_ADMIN: ['*'], // Full access
      SUPER_USER: [
        'view_dashboard',
        'view_mailbox',
        'view_members',
        'manage_master_schedule',
        'view_master_schedule',
        'view_admin',
        'manage_team_config',
        'manage_announcements',
        'manage_release_notes',
        'view_logs',
        'assign_tasks',
        'create_users'
      ],
      ADMIN: [
        'view_dashboard',
        'view_mailbox',
        'view_members',
        'manage_master_schedule',
        'view_master_schedule',
        'view_admin',
        'manage_team_config',
        'manage_announcements',
        'manage_release_notes',
        'view_logs',
        'assign_tasks',
        'create_users'
      ],
      TEAM_LEAD: [
        'view_dashboard',
        'view_mailbox',
        'view_members',
        'assign_tasks',
        'manage_team_config',
        'view_logs'
      ],
      MEMBER: [
        'view_dashboard',
        'view_mailbox',
        'view_my_schedule'
      ]
    },

    can(user, perm){
      if(!user || !user.role) return false;
      const r = String(user.role).trim().toUpperCase();

      try{
        if(window.Store && Store.getUserExtraPrivs){
          const extras = Store.getUserExtraPrivs(user.id);
          if(Array.isArray(extras) && extras.includes(perm)) return true;
        }
      }catch(_){ }

      if(r === this.ROLES.SUPER_ADMIN) return true;
      const list = this.PERMS[r] || [];
      return list.includes('*') || list.includes(perm);
    },

    DEFAULT_TASKS: [
      { id: 'mailbox_manager', label: 'Mailbox Manager', desc: 'Manage incoming emails', color: '#38bdf8' },
      { id: 'mailbox_call', label: 'Mailbox Call', desc: 'Handle phone calls', color: '#10b981' },
      { id: 'break', label: 'Break', desc: 'Standard rest break', color: '#64748b' },
      { id: 'lunch', label: 'Lunch', desc: 'Meal break', color: '#f59e0b' },
      { id: 'training', label: 'Training', desc: 'Training session', color: '#a855f7' }
    ],

    THEMES: [
        {
            "id": "monday_workspace",
            "name": "Monday OS (Light)",
            "mode": "light",
            "bg": "#F5F6F8",
            "panel": "#FFFFFF",
            "panel2": "#F0F2F5",
            "border": "#E6E9EF",
            "text": "#323338",
            "muted": "#676879",
            "accent": "#0073EA",
            "bgRad1": "rgba(0,115,234,0.05)",
            "bgRad3": "rgba(0,115,234,0.02)",
            "font": "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            "radius": "12px",
            "shadow": "0 4px 14px rgba(0,0,0,0.04)"
        },
        {
            "id": "dark",
            "name": "Midnight Dark",
            "bg": "#09090b",
            "panel": "#171717",
            "panel2": "#262626",
            "border": "#262626",
            "text": "#fafafa",
            "muted": "#a1a1aa",
            "accent": "#60a5fa",
            "bgRad1": "#171717",
            "bgRad3": "#262626"
        },
        {
            "id": "dracula",
            "name": "Dracula",
            "bg": "#282a36",
            "panel": "#44475a",
            "panel2": "#6272a4",
            "border": "#6272a4",
            "text": "#f8f8f2",
            "muted": "#bfbfbf",
            "accent": "#bd93f9",
            "bgRad1": "#44475a",
            "bgRad3": "#6272a4"
        },
        {
            "id": "synthwave",
            "name": "Neon Synthwave",
            "bg": "#1a1a2e",
            "panel": "#16213e",
            "panel2": "#0f3460",
            "border": "#0f3460",
            "text": "#e94560",
            "muted": "#a5a5b0",
            "accent": "#e94560",
            "bgRad1": "#16213e",
            "bgRad3": "#0f3460"
        },
        {
            "id": "solarized",
            "name": "Solarized Dark",
            "bg": "#002b36",
            "panel": "#073642",
            "panel2": "#586e75",
            "border": "#586e75",
            "text": "#839496",
            "muted": "#586e75",
            "accent": "#2aa198",
            "bgRad1": "#073642",
            "bgRad3": "#586e75"
        },
        {
            "id": "monokai",
            "name": "Monokai",
            "bg": "#272822",
            "panel": "#3e3d32",
            "panel2": "#75715e",
            "border": "#75715e",
            "text": "#f8f8f2",
            "muted": "#75715e",
            "accent": "#f92672",
            "bgRad1": "#3e3d32",
            "bgRad3": "#75715e"
        },
        {
            "id": "nord",
            "name": "Nord",
            "bg": "#2e3440",
            "panel": "#3b4252",
            "panel2": "#434c5e",
            "border": "#434c5e",
            "text": "#d8dee9",
            "muted": "#e5e9f0",
            "accent": "#88c0d0",
            "bgRad1": "#3b4252",
            "bgRad3": "#434c5e"
        },
        {
            "id": "gruvbox",
            "name": "Gruvbox",
            "bg": "#282828",
            "panel": "#3c3836",
            "panel2": "#504945",
            "border": "#504945",
            "text": "#ebdbb2",
            "muted": "#a89984",
            "accent": "#b8bb26",
            "bgRad1": "#3c3836",
            "bgRad3": "#504945"
        },
        {
            "id": "github",
            "name": "GitHub Dark",
            "bg": "#0d1117",
            "panel": "#161b22",
            "panel2": "#21262d",
            "border": "#30363d",
            "text": "#c9d1d9",
            "muted": "#8b949e",
            "accent": "#58a6ff",
            "bgRad1": "#161b22",
            "bgRad3": "#21262d"
        },
        {
            "id": "material",
            "name": "Material Ocean",
            "bg": "#0f111a",
            "panel": "#1a1c29",
            "panel2": "#292d3e",
            "border": "#292d3e",
            "text": "#a6accd",
            "muted": "#717cb4",
            "accent": "#82aaff",
            "bgRad1": "#1a1c29",
            "bgRad3": "#292d3e"
        },
        {
            "id": "light",
            "name": "Clean Light",
            "bg": "#f8fafc",
            "panel": "#ffffff",
            "panel2": "#f1f5f9",
            "border": "#e2e8f0",
            "text": "#0f172a",
            "muted": "#64748b",
            "accent": "#0ea5e9",
            "bgRad1": "#ffffff",
            "bgRad3": "#e2e8f0"
        },
        {
            "id": "aurora_ecommerce_light",
            "name": "Aurora Ecommerce",
            "mode": "light",
            "bg": "#fafafa",
            "panel": "#ffffff",
            "panel2": "#f4f4f5",
            "border": "rgba(0,0,0,.06)",
            "text": "#171717",
            "muted": "#737373",
            "accent": "#f97316",
            "bgRad1": "rgba(249,115,22,.03)",
            "bgRad3": "rgba(249,115,22,.01)",
            "font": "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            "radius": "12px",
            "shadow": "0 4px 14px rgba(0,0,0,.04)"
        },
        {
            "id": "aurora_midnight",
            "name": "Aurora Midnight",
            "bg": "#0b1220",
            "panel": "#121c2f",
            "panel2": "#1b263b",
            "border": "rgba(255,255,255,.08)",
            "text": "#eaf2ff",
            "muted": "#a8b6d6",
            "accent": "#4aa3ff",
            "bgRad1": "rgba(74,163,255,.06)",
            "bgRad3": "rgba(74,163,255,.02)",
            "font": "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            "radius": "14px",
            "shadow": "0 10px 40px rgba(0,0,0,.4)"
        }
    ],

    teamById(id){
      if(id === this.TEAM_DEV.id) return this.TEAM_DEV;
      return (this.TEAMS||[]).find(t=>t.id===id) || null;
    },

    resolveTeam(raw){
      try{
        if(!raw) return null;
        let k = String(raw).trim().toLowerCase();
        
        let t = this.teamById(k);
        if(t) return t;

        const teams = {};
        (this.TEAMS||[]).forEach(tt => { teams[tt.id] = tt; });
        teams.dev = this.TEAM_DEV;

        if(!t){
          if(k.includes('morning')) t = teams.morning || null;
          else if(k.includes('mid')) t = teams.mid || null;
          else if(k.includes('night')) t = teams.night || null;
          else if(k.includes('dev')) t = teams.dev || null;
        }

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
          id: t.id,
          label: t.label || t.id,
          startHM, endHM, lenMin,
          dutyStart: t.dutyStart || startHM,
          dutyEnd: t.dutyEnd || endHM
        };
      }catch(_){
        return { id:'morning', label:'Morning Shift', startHM:'06:00', endHM:'15:00', lenMin:9*60, dutyStart:'06:00', dutyEnd:'15:00' };
      }
    },

    NAV: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: 'view_dashboard' },
      { id: 'mailbox', label: 'Mailbox', icon: 'mailbox', perm: 'view_mailbox' },
      { id: 'members', label: 'Assign Tasks', icon: 'members', perm: 'view_members' },
      { id: 'overall_stats', label: 'Overall Stats', icon: 'chart', perm: 'view_members' },
      {
        id: 'my_record',
        label: 'My Record',
        icon: 'schedule',
        perm: 'view_my_schedule',
        children: [
          { id: 'my_schedule', label: 'My Schedule', perm: 'view_my_schedule' },
          { id: 'my_attendance', label: 'My Attendance', perm: 'view_my_schedule' },
          { id: 'my_case', label: 'My Case History', perm: 'view_my_schedule' },
          { id: 'my_task', label: 'My Task History', perm: 'view_my_schedule' }
        ]
      }
    ]
  };

  window.Config = Config;
})();