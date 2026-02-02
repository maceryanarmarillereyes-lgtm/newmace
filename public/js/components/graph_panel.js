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

  GP.renderVizHTML = function(viewId, data){
    const id = GP.normalizeViewId(viewId);
    const pct = clamp(data && data.pct, 0, 100);
    const color = String((data && data.color) || '#4f8bff');
    const title = String((data && data.title) || '');

    if(id === 'bar'){
      return (
        '<div class="gsp-bar" role="img" aria-label="Hours bar">' +
          '<div class="task-bar" style="width:' + pct.toFixed(4) + '%;--c:' + svgEscape(color) + '" title="' + svgEscape(title) + '"></div>' +
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
      // Expect dailyHours for Mon–Fri (5 axes). If not provided, fall back to bar.
      const vals = Array.isArray(data && data.radarVals) ? data.radarVals : null;
      const maxVal = Math.max(1e-6, Number((data && data.radarMax) || 8));
      if(!vals || vals.length < 3){
        return (
          '<div class="gsp-bar" role="img" aria-label="Hours bar">' +
            '<div class="task-bar" style="width:' + pct.toFixed(4) + '%;--c:' + svgEscape(color) + '" title="' + svgEscape(title) + '"></div>' +
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
      '<div class="gsp-bar" role="img" aria-label="Hours bar">' +
        '<div class="task-bar" style="width:' + pct.toFixed(4) + '%;--c:' + svgEscape(color) + '" title="' + svgEscape(title) + '"></div>' +
      '</div>'
    );
  };
})();
