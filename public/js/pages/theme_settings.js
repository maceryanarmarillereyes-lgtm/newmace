/**
 * THEME SETTINGS PAGE
 * Integrates with app.js renderThemeGrid() for enterprise theme management
 */
(function(){
  'use strict';

  if(!window.Pages) window.Pages = {};

  Pages.theme_settings = function(root){
    const user = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
    
    if (!user) {
      root.innerHTML = '<div class="card pad muted">Please log in to access theme settings.</div>';
      return;
    }

    const isSuperAdmin = Config.can(user, 'manage_release_notes'); // Using existing SA permission
    
    root.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">🎨 Theme Settings</h1>
        <div class="page-subtitle">
          ${isSuperAdmin 
            ? 'Customize themes and manage global theme visibility for all users.' 
            : 'Select your preferred theme from the available options below.'
          }
        </div>
      </div>

      <div class="card pad" style="margin-bottom:20px">
        <div id="themeGrid" aria-label="Theme selection grid">
          <div class="muted" style="padding:40px; text-align:center;">
            <div class="mbx-spinner" style="margin:0 auto 12px;"></div>
            Loading themes...
          </div>
        </div>

        <!-- Theme Accessibility Audit (Super Admin only) -->
        <div id="themeAudit" style="display:none; margin-top:30px; padding-top:30px; border-top:1px solid var(--border);">
          <div style="margin-bottom:16px">
            <div class="h3" style="margin:0 0 6px">🔍 Theme Accessibility Audit</div>
            <div class="small muted">WCAG 2.1 AA compliance check for the active theme</div>
          </div>
          <div id="themeAuditInner"></div>
        </div>
      </div>

      ${isSuperAdmin ? `
        <div class="card pad" style="margin-bottom:20px; background:rgba(79,70,229,0.05); border:1px solid rgba(79,70,229,0.15);">
          <div style="display:flex; align-items:start; gap:12px;">
            <div style="font-size:24px; line-height:1;">🛡️</div>
            <div style="flex:1;">
              <div class="small" style="font-weight:900; margin-bottom:6px; color:rgba(79,70,229,1);">Super Admin Controls</div>
              <div class="small muted" style="line-height:1.5;">
                • <b>Manage Themes:</b> Click the button above to hide/unhide themes globally or delete themes<br>
                • <b>Get Clean Code:</b> Export sanitized config.js code to permanently remove deleted themes<br>
                • <b>Theme Audit:</b> View WCAG accessibility compliance for the currently active theme
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="small muted" style="padding:0 4px; opacity:.8">
        💡 <b>Tip:</b> Themes are applied instantly when selected. 
        ${isSuperAdmin ? 'Hidden themes are only visible to you when in edit mode.' : 'Your selection is saved automatically.'}
      </div>
    `;

    // Trigger the existing renderThemeGrid function from app.js
    try {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (typeof renderThemeGrid === 'function') {
          renderThemeGrid();
        } else {
          console.error('renderThemeGrid function not found. Ensure app.js is loaded.');
          const grid = root.querySelector('#themeGrid');
          if (grid) {
            grid.innerHTML = '<div class="muted" style="padding:40px; text-align:center; color:var(--danger);">Theme manager not available. Please ensure app.js is loaded first.</div>';
          }
        }
      }, 50);
    } catch(e) {
      console.error('Theme grid render error:', e);
      const grid = root.querySelector('#themeGrid');
      if (grid) {
        grid.innerHTML = `<div class="muted" style="padding:40px; text-align:center; color:var(--danger);">Error loading themes: ${e.message}</div>`;
      }
    }

    // Cleanup function
    return () => {
      // Clean up any event listeners if needed
      try {
        const grid = document.getElementById('themeGrid');
        if (grid) {
          // Remove any lingering event listeners
          const clone = grid.cloneNode(false);
          if (grid.parentNode) {
            grid.parentNode.replaceChild(clone, grid);
          }
        }
      } catch(e) {
        console.warn('Cleanup warning:', e);
      }
    };
  };
})();
