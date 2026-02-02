(function(){
  'use strict';

  // Graph Panel helpers (no modules; attaches to window)
  // Used by Members page graphical task status panel.

  const GP = (window.GraphPanel = window.GraphPanel || {});

  const VIEWS = [
    { id: 'bar',   label: 'Bar Graph' },
    { id: 'pie',   label: 'Pie Chart' },
    { id: 'stack', label: 'Stacked Column' },
    { id: 'donut', label: 'Donut Chart' },
    { id: 'heat',  label: 'Heatmap' },
    { id: 'radar', label: 'Radar Chart' },
  ];

  GP.VIEWS = VIEWS;

  function clamp(n, a, b){
    n = Number(n);
    if(!Number.isFinite(n)) n = 0;
    return Math.max(a, Math.min(b, n));
  }

  GP.normalizeViewId = function(viewId){
    const id = String(viewId || '').trim().toLowerCase();
    for(const v of VIEWS){
      if(v.id === id) return id;
    }
    return 'bar';
  };

  function svgEscape(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // Per-task layout defaults (Phase 1-504 landscape rebuild)
  // The Members page passes callRole so we can normalize call variants.
  GP.getTaskLayout = function(taskId, ctx){
    const tid = String(taskId || '').trim();
    const callRole = String(ctx && ctx.callRole ? ctx.callRole : '').trim();
    const meta = ctx && ctx.meta ? ctx.meta : null;

    // Known task families
    const isMailbox = (tid === 'mailbox_manager');
    const isCall = (tid === callRole || tid === 'call_available' || tid === 'call_onqueue');
    const isBackOffice = (tid === 'back_office' || tid === 'backoffice');

    if(isMailbox){
      return { key:'mailbox', cls:'gsp-task-mailbox', defaultMax: 20, barColor: '#f59e0b' };
    }
    if(isCall){
      return { key:'call', cls:'gsp-task-call', defaultMax: 25, barColor: '#16a34a' };
    }
    if(isBackOffice){
      return { key:'backoffice', cls:'gsp-task-backoffice', defaultMax: 20, barColor: '#f59e0b' };
    }

    // Fallback: use configured task color when available.
    const c = (meta && meta.color) ? String(meta.color) : '#4f8bff';
    return { key:'generic', cls:'gsp-task-generic', defaultMax: 20, barColor: c };
  };

  GP.defaultMaxHours = function(taskId, ctx){
    try{
      const lay = GP.getTaskLayout(taskId, ctx);
      const n = Number(lay && lay.defaultMax ? lay.defaultMax : 20);
      return (Number.isFinite(n) && n > 0) ? n : 20;
    }catch(_e){
      return 20;
    }
  };

  function radarPolygonPath(vals, maxVal){
    const n = Array.isArray(vals) ? vals.length : 0;
    if(n < 3) return '';
    maxVal = Math.max(1e-6, Number(maxVal || 1));

    const cx = 50, cy = 50;
    const rMax = 38;
    const pts = [];
    for(let i=0;i<n;i++){
      const v = clamp(vals[i], 0, maxVal);
      const f = v / maxVal;
      const ang = (-Math.PI/2) + (i * 2*Math.PI / n);
      const r = rMax * f;
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang);
      pts.push([x,y]);
    }
    let d = '';
    for(let i=0;i<pts.length;i++){
      const p = pts[i];
      d += (i === 0 ? 'M' : 'L') + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ' ';
    }
    d += 'Z';
    return d;
  }

  // Visualization renderer used by Members page.
  // For bar view: render a percent-based progress bar (landscape table cell).
  GP.renderVizHTML = function(viewId, data){
    const id = GP.normalizeViewId(viewId);
    const pct = clamp(data && data.pct, 0, 100);
    const color = String((data && data.color) || '#4f8bff');
    const title = String((data && data.title) || '');
    const pctText = String((data && data.pctText) || (Math.round(pct) + '%'));

    if(id === 'bar'){
      return (
        '<div class="gsp-progress" role="img" aria-label="Progress bar" title="' + svgEscape(title) + '">' +
          '<div class="gsp-progress-track" style="--p:' + pct.toFixed(4) + ';--c:' + svgEscape(color) + '">' +
            '<div class="gsp-progress-fill"></div>' +
            '<div class="gsp-progress-label">' + svgEscape(pctText) + '</div>' +
          '</div>' +
        '</div>'
      );
    }

    if(id === 'pie' || id === 'donut'){
      const innerCls = (id === 'donut') ? 'gsp-pie gsp-donut' : 'gsp-pie';
      return (
        '<div class="gsp-viz gsp-vizwrap" title="' + svgEscape(title) + '" role="img" aria-label="Pie visualization">' +
          '<div class="' + innerCls + '" style="--p:' + pct.toFixed(4) + ';--c:' + svgEscape(color) + '"></div>' +
        '</div>'
      );
    }

    if(id === 'stack'){
      return (
        '<div class="gsp-viz gsp-vizwrap" title="' + svgEscape(title) + '" role="img" aria-label="Stacked column visualization">' +
          '<div class="gsp-stackcol" style="--p:' + pct.toFixed(4) + ';--c:' + svgEscape(color) + '">' +
            '<div class="fill"></div>' +
          '</div>' +
        '</div>'
      );
    }

    if(id === 'heat'){
      const daily = Array.isArray(data && data.dailyHours) ? data.dailyHours : [];
      const dailyMax = Math.max(1e-6, Number((data && data.dailyMax) || 8));
      const labels = Array.isArray(data && data.dayLabels) ? data.dayLabels : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      let cells = '';
      for(let i=0;i<7;i++){
        const v = clamp(daily[i] || 0, 0, dailyMax);
        const a = clamp(v / dailyMax, 0, 1);
        const tip = labels[i] + ': ' + (v || 0).toFixed(1) + 'h';
        cells += '<span class="cell" style="--a:' + a.toFixed(4) + ';--c:' + svgEscape(color) + '" title="' + svgEscape(tip) + '"></span>';
      }
      return (
        '<div class="gsp-viz gsp-heat" role="img" aria-label="Heatmap visualization" title="' + svgEscape(title) + '">' +
          cells +
        '</div>'
      );
    }

    if(id === 'radar'){
      // Expect radarVals (e.g., Mon–Fri) and radarMax.
      const vals = Array.isArray(data && data.radarVals) ? data.radarVals : null;
      const maxVal = Math.max(1e-6, Number((data && data.radarMax) || 8));
      if(!vals || vals.length < 3){
        // Fallback to bar
        return (
          '<div class="gsp-progress" role="img" aria-label="Progress bar" title="' + svgEscape(title) + '">' +
            '<div class="gsp-progress-track" style="--p:' + pct.toFixed(4) + ';--c:' + svgEscape(color) + '">' +
              '<div class="gsp-progress-fill"></div>' +
              '<div class="gsp-progress-label">' + svgEscape(pctText) + '</div>' +
            '</div>' +
          '</div>'
        );
      }
      const d = radarPolygonPath(vals, maxVal);
      return (
        '<div class="gsp-viz gsp-vizwrap" title="' + svgEscape(title) + '" role="img" aria-label="Radar chart visualization">' +
          '<div class="gsp-radar">' +
            '<svg viewBox="0 0 100 100" aria-hidden="true">' +
              '<circle cx="50" cy="50" r="38" class="grid" />' +
              '<circle cx="50" cy="50" r="26" class="grid" />' +
              '<circle cx="50" cy="50" r="14" class="grid" />' +
              '<path d="' + svgEscape(d) + '" class="poly" style="--c:' + svgEscape(color) + '"></path>' +
            '</svg>' +
          '</div>' +
        '</div>'
      );
    }

    // Default
    return (
      '<div class="gsp-progress" role="img" aria-label="Progress bar" title="' + svgEscape(title) + '">' +
        '<div class="gsp-progress-track" style="--p:' + pct.toFixed(4) + ';--c:' + svgEscape(color) + '">' +
          '<div class="gsp-progress-fill"></div>' +
          '<div class="gsp-progress-label">' + svgEscape(pctText) + '</div>' +
        '</div>' +
      '</div>'
    );
  };
})();