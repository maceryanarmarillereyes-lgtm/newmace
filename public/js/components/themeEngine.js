// Theme Engine Controller
// Enterprise-grade theme management with Super Admin global controls
// Author: MUMS Architecture Team
// Date: 2026-02-23
// Updated: 2026-02-23 18:19 - Fixed Super Admin panel visibility

(function(){
  'use strict';

  const ThemeEngine = {
    currentTheme: null,
    globalDefault: null,
    userRole: null,

    async init(){
      try {
        // ✅ FIXED: Use Auth.getUser() instead of Store.getProfile()
        const user = (window.Auth && Auth.getUser) ? Auth.getUser() : {};
        const rawRole = String(user?.role || '').trim().toUpperCase();
        
        // Normalize role (handle "Super Admin" vs "SUPER_ADMIN")
        this.userRole = rawRole.replace(/\s+/g, '_');
        
        console.log('[ThemeEngine] User role:', this.userRole);

        // Load global default theme (if Super Admin)
        if (this.userRole === 'SUPER_ADMIN') {
          console.log('[ThemeEngine] Super Admin detected - loading global default...');
          await this.loadGlobalDefault();
        }

        // Load user theme preference (overrides global)
        this.currentTheme = this.getUserTheme();

        // Apply theme immediately
        this.applyTheme(this.currentTheme);

        // Setup UI
        this.renderThemeGrid();
        this.setupEventListeners();

        console.log('[ThemeEngine] Initialized. Current theme:', this.currentTheme);
      } catch(err){
        console.error('[ThemeEngine] Init error:', err);
      }
    },

    async loadGlobalDefault(){
      try {
        const token = window.CloudAuth?.getAccessToken?.();
        if (!token) {
          console.warn('[ThemeEngine] No auth token available');
          return;
        }

        const res = await fetch('/api/settings/global-theme', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json();
          this.globalDefault = data.defaultTheme || 'aurora_midnight';
          console.log('[ThemeEngine] Global default loaded:', this.globalDefault);
        } else {
          console.warn('[ThemeEngine] Failed to load global default:', res.status);
        }
      } catch(err){
        console.warn('[ThemeEngine] Failed to load global default:', err);
        this.globalDefault = 'aurora_midnight'; // fallback
      }
    },

    getUserTheme(){
      // Check localStorage for user override
      const stored = localStorage.getItem('mums_theme_preference');
      if (stored && this.isValidTheme(stored)) {
        return stored;
      }

      // Fall back to global default or system default
      return this.globalDefault || 'aurora_midnight';
    },

    isValidTheme(id){
      const validThemes = ['aurora_midnight', 'mono'];
      return validThemes.includes(id);
    },

    applyTheme(themeId){
      const theme = window.Config?.THEMES?.find(t => t.id === themeId);
      if (!theme) {
        console.warn('[ThemeEngine] Theme not found:', themeId);
        return;
      }

      const root = document.documentElement;
      
      // Apply CSS variables
      root.style.setProperty('--bg', theme.bg);
      root.style.setProperty('--panel', theme.panel);
      root.style.setProperty('--panel2', theme.panel2);
      root.style.setProperty('--text', theme.text);
      root.style.setProperty('--muted', theme.muted);
      root.style.setProperty('--border', theme.border);
      root.style.setProperty('--accent', theme.accent);
      root.style.setProperty('--bg-rad1', theme.bgRad1);
      root.style.setProperty('--bg-rad3', theme.bgRad3);
      
      if (theme.font) root.style.setProperty('--font', theme.font);
      if (theme.radius) root.style.setProperty('--radius', theme.radius);
      if (theme.shadow) root.style.setProperty('--shadow', theme.shadow);

      // Store user preference
      localStorage.setItem('mums_theme_preference', themeId);
      this.currentTheme = themeId;

      console.log('[ThemeEngine] Applied theme:', themeId);
    },

    renderThemeGrid(){
      const grid = document.getElementById('themeGrid');
      if (!grid) return;

      const themes = window.Config?.THEMES || [];
      
      grid.innerHTML = themes.map(theme => {
        const isActive = this.currentTheme === theme.id;
        
        return `
          <div class="glass-theme-tile ${isActive ? 'active' : ''}" 
               data-theme="${theme.id}"
               style="--t-bg:${theme.bg}; --t-panel:${theme.panel}; --t-acc:${theme.accent};">
            
            <div class="theme-swatch-box">
              <div class="theme-swatch-p1"></div>
              <div class="theme-swatch-p2">
                <div class="theme-swatch-acc"></div>
              </div>
            </div>

            <div style="flex:1;">
              <div style="font-size:16px; font-weight:900; color:#f8fafc; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
                ${theme.name}
                ${isActive ? '<span style="font-size:12px; background:rgba(34,197,94,0.2); color:#22c55e; padding:2px 8px; border-radius:6px; font-weight:800;">ACTIVE</span>' : ''}
              </div>
              <div class="small muted" style="line-height:1.5;">
                ${theme.description || 'Premium enterprise theme.'}
              </div>
            </div>

            <button class="btn-glass-ghost apply-theme-btn" 
                    data-theme="${theme.id}"
                    style="width:100%; margin-top:12px; ${isActive ? 'opacity:0.5; pointer-events:none;' : ''}">
              ${isActive ? '✓ Applied' : 'Apply Theme'}
            </button>
          </div>
        `;
      }).join('');

      // Show Super Admin panel if eligible
      if (this.userRole === 'SUPER_ADMIN') {
        console.log('[ThemeEngine] Showing Super Admin panel...');
        const adminPanel = document.getElementById('themeAdminPanel');
        if (adminPanel) {
          adminPanel.style.display = 'block';
          
          // Set current global default in dropdown
          const select = document.getElementById('globalThemeSelect');
          if (select && this.globalDefault) {
            select.value = this.globalDefault;
            console.log('[ThemeEngine] Set dropdown to:', this.globalDefault);
          }
        } else {
          console.warn('[ThemeEngine] themeAdminPanel element not found in DOM');
        }
      } else {
        console.log('[ThemeEngine] User is not SUPER_ADMIN, panel hidden');
      }
    },

    setupEventListeners(){
      // Apply theme button clicks
      document.getElementById('themeGrid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.apply-theme-btn');
        if (btn) {
          const themeId = btn.dataset.theme;
          this.applyTheme(themeId);
          this.renderThemeGrid(); // Re-render to update active state
        }
      });

      // Super Admin: Save global default
      document.getElementById('saveGlobalThemeBtn')?.addEventListener('click', async () => {
        await this.saveGlobalDefault();
      });
    },

    async saveGlobalDefault(){
      const select = document.getElementById('globalThemeSelect');
      const statusEl = document.getElementById('globalThemeStatus');
      const btn = document.getElementById('saveGlobalThemeBtn');
      
      if (!select || !statusEl || !btn) {
        console.error('[ThemeEngine] Missing UI elements for saveGlobalDefault');
        return;
      }

      const themeId = select.value;
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const token = window.CloudAuth?.getAccessToken?.();
        if (!token) throw new Error('Not authenticated');

        const res = await fetch('/api/settings/global-theme', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ themeId })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to save');
        }

        // Update local state
        this.globalDefault = themeId;

        // Show success message
        const themeName = themeId === 'aurora_midnight' ? 'Aurora Midnight' : 'Monochrome';
        statusEl.textContent = `✓ Global default set to ${themeName}`;
        statusEl.style.display = 'block';
        statusEl.style.color = '#34d399';

        setTimeout(() => {
          statusEl.style.display = 'none';
        }, 3000);

        console.log('[ThemeEngine] Global default saved:', themeId);

      } catch(err){
        console.error('[ThemeEngine] Save error:', err);
        statusEl.textContent = `✗ Error: ${err.message}`;
        statusEl.style.display = 'block';
        statusEl.style.color = '#fb7185';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save Default';
      }
    }
  };

  // Expose globally
  window.ThemeEngine = ThemeEngine;

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeEngine.init());
  } else {
    ThemeEngine.init();
  }
})();
/* ==========================================================================
   ENTERPRISE TACTILE MICRO-INTERACTIONS (Appended via Architect)
   ========================================================================== */
(function applyEnterpriseTactileFeedback() {
  // Fault-tolerant DOM event delegation
  document.addEventListener('mousedown', (e) => {
    const card = e.target.closest('.th-card');
    if (card) {
      // Wag mag-trigger kung admin button (delete/edit) ang pinindot
      if (e.target.closest('.th-admin-btn')) return; 
      
      // Hardware-accelerated press effect
      card.style.transition = 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)';
      card.style.transform = 'scale(0.97) translateZ(0)';
      card.style.filter = 'brightness(1.3) contrast(1.1)';
      
      // Enterprise Haptic Audio Cue (Subtle High-End Tick)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if(ctx.state === 'running') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(900, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);
          gain.gain.setValueAtTime(0.03, ctx.currentTime); // Very quiet tick
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
          osc.start();
          osc.stop(ctx.currentTime + 0.04);
        }
      } catch(err) { /* Silent fail kung strict ang browser policies sa audio */ }
    }
  });

  // Bounce back on release
  document.addEventListener('mouseup', (e) => {
    const card = e.target.closest('.th-card');
    if (card) {
      card.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
      card.style.transform = '';
      card.style.filter = '';
    }
  });

  // Bounce back if cursor leaves while pressing
  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.th-card');
    if (card) {
      card.style.transition = 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
      card.style.transform = '';
      card.style.filter = '';
    }
  });
})();