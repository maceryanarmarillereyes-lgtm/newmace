# QA_REPORT — Enterprise Fullscreen Members (Option A, Dark Glass)

**Phase bundle:** Phase-1-601.zip  
**Branch:** feature/members-enterprise-fullscreen  
**Date:** 2026-02-07 (Asia/Manila)  
**Theme:** Force dark glass mode with dim glass background (Option 1)  
**Scope:** Members page fullscreen overlay + enterprise 3-column layout

## What changed (high level)

- Members page can enter a **fixed fullscreen overlay** via **#membersFullscreenBtn** using the Fullscreen API.
- Overlay locks body scroll, hides global nav/topbars, and enables **focus trap**.
- Enterprise layout: **Section 1 Team Roster**, **Section 2 Timeline Tasks**, **Section 3 Analytics + Controls** with resizable splitters.
- Defensive DOM bindings for analytics/report controls (guarded so missing elements don't throw).
- Fixed bug: removed duplicate `root.replaceChildren(wrap);`.

## Static checks completed in this environment

- `node --check public/js/pages/members.js` → ✅ **No syntax errors**
- Verified required IDs exist in Members markup:
  - ✅ `#membersFullscreenBtn`, `#membersRosterList`, `#membersSplitLeft`, `#membersSplitRight`
  - ✅ Reports IDs: `#exportSchedule`, `#exportWorkload`, `#viewAudit`, `#viewAcks`, `#viewHealthTrend` (fallback to `#viewTrend` supported)

> Note: True browser interaction testing (Chrome/Edge/Firefox) must be run on a workstation. The checklists below are the **manual smoke tests to execute** plus the **expected results**.

---

## Manual smoke tests (acceptance checklist)

### Fullscreen overlay behavior
1. Navigate to **Members** page.
2. Click **Fullscreen** button (⛶ Fullscreen).

**Expected**
- Overlay covers entire viewport (100vw × 100vh).
- Global nav/topbar/right panels are hidden while overlay is active.
- Body scroll is locked while overlay is active.

3. Press **ESC**.

**Expected**
- Exits fullscreen/overlay mode reliably.
- Body scroll restores.
- Keyboard focus returns to **#membersFullscreenBtn**.

### Roster → timeline behavior
1. In **Team Roster**, click a member.

**Expected**
- Roster item highlights.
- Corresponding timeline row highlights (`.members-row.m-selected`).
- Timeline scrolls the selected row into view (smooth scroll when supported).

2. Use roster search input.

**Expected**
- List filters by name/username/email without throwing.
- Active/Inactive chips filter roster correctly.

### Splitters (draggable + keyboard)
1. Drag the left splitter to resize roster panel.
2. Drag the right splitter to resize analytics panel.

**Expected**
- Panels resize smoothly.
- Widths persist after refresh via localStorage.

3. Focus a splitter (Tab) and press ArrowLeft/ArrowRight (Shift for larger step).

**Expected**
- Width changes by step size and persists.

### Reports / analytics controls (guarded)
Click each of the following (when visible/permitted):
- Export Schedule
- Export Workload
- View Audit
- View Acks
- View Health Trend

**Expected**
- No uncaught exceptions if any control is missing.
- Actions execute for permitted roles; restricted roles show the app’s existing guard behavior.

### Coverage meter + heatmap readiness
- Confirm Coverage Meter is visible and remains readable at 100% viewport.
- Confirm timeline overlays remain aligned and usable at full width.

---

## Cross-browser smoke checklist (to run)

Run the **Fullscreen overlay behavior** and **Roster → timeline** tests on:
- Chrome (latest stable)
- Edge (latest stable)
- Firefox (latest stable)

**Notes to watch**
- Fullscreen API permission prompts (some browsers require user gesture — already satisfied by click handler).
- `scrollIntoView({behavior:'smooth'})` fallback (code falls back to non-smooth on older engines).

---

## Accessibility checks (to run)

### Keyboard navigation
- Tab order reaches:
  - Fullscreen button → day tabs → roster search → roster filters → roster items → splitters → analytics controls
- Splitters are keyboard-resizable (role="separator", tabindex=0).

### Focus management
- When overlay is active:
  - Focus trap keeps tab focus inside `.members-page.members-fullscreen`
  - ESC exits and returns focus to fullscreen toggle

### ARIA/labels
- `#membersFullscreenBtn` has `aria-label` and `aria-pressed`
- Splitters have `role="separator"` + `aria-label` + `aria-orientation`
- Roster list has `role="listbox"` and items have `role="option"` + `aria-selected`

---

## Post-deploy verification checklist (after Cloudflare/Vercel deploy)

- Members page loads with no console errors.
- Fullscreen overlay works (toggle + ESC).
- Body scroll lock + restore behaves correctly.
- Roster select → scroll works.
- Splitter widths persist after refresh.
- Reports/exports work for permitted roles.
