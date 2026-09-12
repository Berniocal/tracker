(() => {
  const graphSeriesMeta = {
    x:  { label: 'x',   key: 'xm', unit: 'm', color: '#155eef' },
    y:  { label: 'y',   key: 'ym', unit: 'm', color: '#7f56d9' },
    vx: { label: 'vₓ',  key: 'vx', unit: 'm/s', color: '#f79009' },
    vy: { label: 'vᵧ',  key: 'vy', unit: 'm/s', color: '#d444f1' },
    v:  { label: '|v|', key: 'v', unit: 'm/s', color: '#12b76a' },
    ax: { label: 'aₓ',  key: 'ax', unit: 'm/s²', color: '#039855' },
    ay: { label: 'aᵧ',  key: 'ay', unit: 'm/s²', color: '#06aed4' },
    a:  { label: '|a|', key: 'a', unit: 'm/s²', color: '#d92d20' },
    xy: { label: 'y',   key: 'ym', unit: 'm', color: '#155eef' }
  };

  state.graphView = state.graphView || {
    widthFactor: 1,
    rangeStart: null,
    rangeEnd: null
  };

  function fmtTime(value) {
    return `${formatNumber(Math.max(0, Number(value) || 0), 3)} s`;
  }

  function durationValue() {
    return Number.isFinite(video.duration) ? video.duration : 0;
  }

  function snap(value, step) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value / step) * step;
  }

  function setTrackFill(root, start, end, min, max) {
    if (!root || !(max > min)) return;
    const lo = clamp((start - min) / (max - min) * 100, 0, 100);
    const hi = clamp((end - min) / (max - min) * 100, 0, 100);
    root.style.setProperty('--range-lo', `${lo}%`);
    root.style.setProperty('--range-hi', `${hi}%`);
  }

  function installStyles() {
    if ($('#rangeControlStyles')) return;
    const style = document.createElement('style');
    style.id = 'rangeControlStyles';
    style.textContent = `
      #segmentControls{display:none!important}
      .compact-range-control{padding:5px 14px 8px}
      .compact-range-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px;color:#475467;font-size:.72rem}
      .compact-range-head strong{color:#344054;font-size:.76rem}
      .dual-range{--range-lo:0%;--range-hi:100%;position:relative;height:34px;margin:0 3px}
      .dual-range::before{content:"";position:absolute;left:0;right:0;top:15px;height:5px;border-radius:999px;background:linear-gradient(to right,#d0d5dd 0 var(--range-lo),#155eef var(--range-lo) var(--range-hi),#d0d5dd var(--range-hi) 100%)}
      .dual-range input[type=range]{position:absolute;inset:0;width:100%;height:34px;margin:0;padding:0;background:transparent;appearance:none;-webkit-appearance:none;pointer-events:none}
      .dual-range input[type=range]::-webkit-slider-runnable-track{height:5px;background:transparent;border:none}
      .dual-range input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;margin-top:-8.5px;border:3px solid #fff;border-radius:50%;background:#155eef;box-shadow:0 1px 4px rgba(16,24,40,.28);pointer-events:auto}
      .dual-range input[type=range]::-moz-range-track{height:5px;background:transparent;border:none}
      .dual-range input[type=range]::-moz-range-thumb{width:18px;height:18px;border:3px solid #fff;border-radius:50%;background:#155eef;box-shadow:0 1px 4px rgba(16,24,40,.28);pointer-events:auto}
      .graph-scroll-shell{width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;border-radius:10px}
      .graph-scroll-shell .chart-wrap{aspect-ratio:auto!important;height:clamp(260px,82vw,340px);min-height:260px;flex:0 0 auto}
      .graph-scroll-shell.expanded #chart{touch-action:pan-x pan-y}
      .graph-range-control{margin:7px 0 3px;padding:4px 10px 5px;border:1px solid #e4e7ec;border-radius:11px;background:#f9fafb}
      .graph-range-control .dual-range{margin-top:0}
      .graph-range-label{text-align:center;color:#667085;font-size:.7rem;line-height:1.2;margin-top:-1px}
      .graph-view-controls{display:grid;grid-template-columns:1fr auto 1fr;gap:7px;align-items:center;margin:5px 0 2px}
      .graph-view-controls button{min-height:40px;padding:7px 9px}
      .graph-width-label{text-align:center;font-size:.75rem;font-weight:800;color:#475467;white-space:nowrap}
      .range-variable-stat{grid-column:1/-1}
      .range-stat-title{display:flex!important;align-items:center;gap:6px;color:#344054!important;font-size:.78rem!important;font-weight:800}
      .range-stat-dot{display:inline-block;width:9px;height:9px;border-radius:50%}
      .range-stat-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:7px}
      .range-stat-values div{min-width:0;padding:6px 7px;border-radius:8px;background:#fff;border:1px solid #e4e7ec}
      .range-stat-values small{display:block;color:#667085;font-size:.65rem;margin-bottom:2px}
      .range-stat-values b{display:block;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:600px){
        .compact-range-control{padding:2px 10px 6px}.compact-range-head{font-size:.68rem}.compact-range-head strong{font-size:.72rem}
        .dual-range{height:31px}.dual-range::before{top:13px}.dual-range input[type=range]{height:31px}
        .graph-range-control{padding:3px 8px 4px}.graph-range-label{font-size:.66rem}
        .graph-view-controls{gap:5px}.graph-view-controls button{min-height:36px;padding:6px 7px;font-size:.71rem}.graph-width-label{font-size:.68rem}
        .range-stat-values{gap:5px}.range-stat-values div{padding:5px 6px}.range-stat-values b{font-size:.72rem}
      }
    `;
    document.head.append(style);
  }

  function installVideoRange() {
    const scrubberWrap = document.querySelector('.video-scrubber-wrap');
    if (!scrubberWrap || $('#videoMeasurementRange')) return;

    const control = document.createElement('div');
    control.id = 'videoMeasurementRange';
    control.className = 'compact-range-control';
    control.innerHTML = `
      <div class="compact-range-head">
        <strong>Měřený úsek</strong>
        <span id="videoRangeLabel">0,000 s – konec</span>
      </div>
      <div id="videoDualRange" class="dual-range">
        <input id="videoRangeStart" type="range" min="0" max="1" step="0.001" value="0" aria-label="Začátek měřeného úseku">
        <input id="videoRangeEnd" type="range" min="0" max="1" step="0.001" value="1" aria-label="Konec měřeného úseku">
      </div>
    `;
    scrubberWrap.insertAdjacentElement('afterend', control);

    const startInput = $('#videoRangeStart');
    const endInput = $('#videoRangeEnd');

    const apply = (changed) => {
      const duration = durationValue();
      if (!(duration > 0)) return;
      const step = Math.max(1 / fps(), 0.001);
      let start = snap(Number(startInput.value), step);
      let end = snap(Number(endInput.value), step);

      if (changed === 'start') start = Math.min(start, end - step);
      else end = Math.max(end, start + step);

      start = clamp(start, 0, Math.max(0, duration - step));
      end = clamp(end, Math.min(duration, start + step), duration);
      startInput.value = String(start);
      endInput.value = String(end);

      state.segment.start = start;
      state.segment.end = end;
      const fullRange = start <= step * 0.51 && end >= duration - step * 0.51;
      state.segment.enabled = !fullRange;

      const legacyToggle = $('#segmentEnabled');
      if (legacyToggle) {
        legacyToggle.checked = state.segment.enabled;
        legacyToggle.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        updateTrackingUi();
        if (state.stage === 'graphs') drawChart();
      }

      video.pause();
      video.currentTime = changed === 'start' ? start : end;
      renderVideoRange();
    };

    startInput.addEventListener('input', () => apply('start'));
    endInput.addEventListener('input', () => apply('end'));
  }

  function renderVideoRange(resetToFull = false) {
    const startInput = $('#videoRangeStart');
    const endInput = $('#videoRangeEnd');
    const label = $('#videoRangeLabel');
    const root = $('#videoDualRange');
    const duration = durationValue();
    if (!startInput || !endInput || !label || !root || !(duration > 0)) return;

    const step = Math.max(1 / fps(), 0.001);
    startInput.max = String(duration);
    endInput.max = String(duration);
    startInput.step = String(step);
    endInput.step = String(step);

    if (resetToFull) {
      state.segment.start = 0;
      state.segment.end = duration;
      state.segment.enabled = false;
    }

    const start = clamp(Number.isFinite(state.segment.start) ? state.segment.start : 0, 0, duration);
    const end = clamp(Number.isFinite(state.segment.end) ? state.segment.end : duration, start, duration);
    startInput.value = String(start);
    endInput.value = String(end);
    label.textContent = `${fmtTime(start)} – ${fmtTime(end)}`;
    setTrackFill(root, start, end, 0, duration);
  }

  function seekVideoTo(time) {
    const duration = durationValue();
    const target = clamp(Number(time) || 0, 0, duration || 0);
    return new Promise((resolve) => {
      video.pause();
      if (Math.abs(video.currentTime - target) <= 0.25 / fps()) {
        video.currentTime = target;
        requestAnimationFrame(() => requestAnimationFrame(resolve));
        return;
      }
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        video.removeEventListener('seeked', finish);
        resolve();
      };
      video.addEventListener('seeked', finish, { once: true });
      video.currentTime = target;
      setTimeout(finish, 800);
    });
  }

  function installAutoSelectionStartGuard() {
    const button = $('#selectAutoObjectBtn');
    if (!button || button.dataset.segmentStartGuard === '1') return;
    button.dataset.segmentStartGuard = '1';

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.auto.status === 'running') return;

      const start = clamp(Number(state.segment?.start) || 0, 0, durationValue() || 0);
      await seekVideoTo(start);
      updateTimeUi();
      drawOverlay();
      beginAutoSelection();
    }, true);
  }

  function graphTimeBounds() {
    const points = kinematicsPoints().filter((point) => Number.isFinite(point.dt));
    if (!points.length) return null;
    return {
      min: Math.min(...points.map((point) => point.dt)),
      max: Math.max(...points.map((point) => point.dt)),
      points
    };
  }

  function selectedGraphSeries() {
    const series = Array.isArray(state.graphSeries) && state.graphSeries.length
      ? state.graphSeries
      : [state.graph || 'x'];
    return [...new Set(series)].filter((key) => graphSeriesMeta[key]);
  }

  function installGraphControls() {
    const chartWrap = chart.parentElement;
    if (!chartWrap || $('#graphRangeControls')) return;

    const shell = document.createElement('div');
    shell.id = 'graphScrollShell';
    shell.className = 'graph-scroll-shell';
    chartWrap.insertAdjacentElement('beforebegin', shell);
    shell.append(chartWrap);

    const controls = document.createElement('div');
    controls.id = 'graphViewControls';
    controls.innerHTML = `
      <div id="graphRangeControls" class="graph-range-control">
        <div id="graphDualRange" class="dual-range">
          <input id="graphRangeStart" type="range" min="0" max="1" step="0.001" value="0" aria-label="Začátek statistického úseku">
          <input id="graphRangeEnd" type="range" min="0" max="1" step="0.001" value="1" aria-label="Konec statistického úseku">
        </div>
        <div id="graphRangeLabel" class="graph-range-label">celý graf</div>
      </div>
      <div class="graph-view-controls">
        <button id="graphNarrowBtn" class="secondary-btn" type="button" aria-label="Zúžit graf">→ ← Zúžit</button>
        <span id="graphWidthLabel" class="graph-width-label">1×</span>
        <button id="graphWidenBtn" class="secondary-btn" type="button" aria-label="Roztáhnout graf">← → Roztáhnout</button>
      </div>
    `;
    shell.insertAdjacentElement('afterend', controls);

    $('#graphWidenBtn').addEventListener('click', () => setGraphWidth(state.graphView.widthFactor + 0.25));
    $('#graphNarrowBtn').addEventListener('click', () => setGraphWidth(state.graphView.widthFactor - 0.25));

    const startInput = $('#graphRangeStart');
    const endInput = $('#graphRangeEnd');
    startInput.addEventListener('input', () => setGraphAnalysisRange('start'));
    endInput.addEventListener('input', () => setGraphAnalysisRange('end'));

    setGraphWidth(state.graphView.widthFactor, false);
    renderGraphRange();
  }

  function setGraphWidth(value, keepCenter = true) {
    const shell = $('#graphScrollShell');
    const wrap = chart.parentElement;
    if (!shell || !wrap) return;

    const oldWidth = Math.max(1, wrap.clientWidth || shell.clientWidth);
    const centerRatio = keepCenter
      ? clamp((shell.scrollLeft + shell.clientWidth / 2) / oldWidth, 0, 1)
      : 0.5;

    const factor = clamp(Math.round(value * 4) / 4, 1, 4);
    state.graphView.widthFactor = factor;
    wrap.style.width = `${factor * 100}%`;
    shell.classList.toggle('expanded', factor > 1.001);

    const label = $('#graphWidthLabel');
    if (label) label.textContent = `${formatNumber(factor, 2)}×`;
    const narrow = $('#graphNarrowBtn');
    const widen = $('#graphWidenBtn');
    if (narrow) narrow.disabled = factor <= 1.001;
    if (widen) widen.disabled = factor >= 3.999;

    requestAnimationFrame(() => {
      resizeChart();
      if (keepCenter) {
        const newWidth = Math.max(1, wrap.clientWidth);
        shell.scrollLeft = clamp(centerRatio * newWidth - shell.clientWidth / 2, 0, Math.max(0, newWidth - shell.clientWidth));
      }
    });
  }

  function renderGraphRange() {
    const bounds = graphTimeBounds();
    const startInput = $('#graphRangeStart');
    const endInput = $('#graphRangeEnd');
    const root = $('#graphDualRange');
    const label = $('#graphRangeLabel');
    if (!bounds || !startInput || !endInput || !root || !label) return;

    const { min, max } = bounds;
    const span = Math.max(0, max - min);
    const step = Math.max(0.001, Math.min(1 / fps(), span || 1 / fps()));
    startInput.min = String(min);
    startInput.max = String(max);
    endInput.min = String(min);
    endInput.max = String(max);
    startInput.step = String(step);
    endInput.step = String(step);

    const start = clamp(Number.isFinite(state.graphView.rangeStart) ? state.graphView.rangeStart : min, min, max);
    const end = clamp(Number.isFinite(state.graphView.rangeEnd) ? state.graphView.rangeEnd : max, start, max);
    startInput.value = String(start);
    endInput.value = String(end);
    label.textContent = `${fmtTime(start)} – ${fmtTime(end)}`;
    setTrackFill(root, start, end, min, max);
  }

  function setGraphAnalysisRange(changed) {
    const bounds = graphTimeBounds();
    const startInput = $('#graphRangeStart');
    const endInput = $('#graphRangeEnd');
    if (!bounds || !startInput || !endInput) return;

    const { min, max } = bounds;
    const step = Math.max(0.001, Math.min(1 / fps(), Math.max(0.001, max - min)));
    let start = Number(startInput.value);
    let end = Number(endInput.value);
    if (changed === 'start') start = Math.min(start, end - step);
    else end = Math.max(end, start + step);
    start = clamp(start, min, Math.max(min, max - step));
    end = clamp(end, Math.min(max, start + step), max);

    state.graphView.rangeStart = start;
    state.graphView.rangeEnd = end;
    startInput.value = String(start);
    endInput.value = String(end);
    drawChart();
  }

  function rangeMarkerPositions() {
    const bounds = graphTimeBounds();
    const geometry = state.graphPlotGeometry;
    if (!bounds || !geometry || !(geometry.xmax > geometry.xmin)) return null;

    const start = clamp(Number.isFinite(state.graphView.rangeStart) ? state.graphView.rangeStart : bounds.min, bounds.min, bounds.max);
    const end = clamp(Number.isFinite(state.graphView.rangeEnd) ? state.graphView.rangeEnd : bounds.max, start, bounds.max);

    if (geometry.xKey === 'dt') return { startValue: start, endValue: end };

    if (geometry.xKey === 'xm') {
      const nearest = (time) => bounds.points.reduce((best, point) => {
        if (!best || Math.abs(point.dt - time) < Math.abs(best.dt - time)) return point;
        return best;
      }, null);
      const first = nearest(start);
      const last = nearest(end);
      if (!first || !last || !Number.isFinite(first.xm) || !Number.isFinite(last.xm)) return null;
      return { startValue: first.xm, endValue: last.xm };
    }

    return null;
  }

  function drawGraphRangeMarkers() {
    const geometry = state.graphPlotGeometry;
    const positions = rangeMarkerPositions();
    if (!geometry || !positions) return;

    const { margin, plotW, plotH, xmin, xmax } = geometry;
    if (!margin || !(plotW > 0) || !(plotH > 0) || !(xmax > xmin)) return;

    const px = (value) => margin.l + ((value - xmin) / (xmax - xmin)) * plotW;
    const top = margin.t;
    const bottom = margin.t + plotH;
    const markers = [
      { x: px(positions.startValue), color: '#155eef', label: 'od' },
      { x: px(positions.endValue), color: '#7f56d9', label: 'do' }
    ];

    chartCtx.save();
    chartCtx.font = '700 10px system-ui,sans-serif';
    chartCtx.textAlign = 'center';
    chartCtx.textBaseline = 'top';
    markers.forEach((marker) => {
      if (!Number.isFinite(marker.x)) return;
      chartCtx.strokeStyle = marker.color;
      chartCtx.globalAlpha = 0.78;
      chartCtx.lineWidth = 1.8;
      chartCtx.setLineDash([5, 4]);
      chartCtx.beginPath();
      chartCtx.moveTo(marker.x, top);
      chartCtx.lineTo(marker.x, bottom);
      chartCtx.stroke();
      chartCtx.setLineDash([]);
      chartCtx.globalAlpha = 0.92;
      chartCtx.fillStyle = marker.color;
      chartCtx.fillText(marker.label, marker.x, top + 3);
    });
    chartCtx.restore();
  }

  function statisticCard(meta, values) {
    if (!values.length) {
      return `<div class="stat range-variable-stat"><span class="range-stat-title"><i class="range-stat-dot" style="background:${meta.color}"></i>${meta.label} [${meta.unit}]</span><strong>V úseku nejsou data.</strong></div>`;
    }
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const withUnit = (value) => `${formatNumber(value, 3)} ${meta.unit}`;
    return `
      <div class="stat range-variable-stat">
        <span class="range-stat-title"><i class="range-stat-dot" style="background:${meta.color}"></i>${meta.label} [${meta.unit}]</span>
        <div class="range-stat-values">
          <div><small>Průměr</small><b>${withUnit(average)}</b></div>
          <div><small>Minimum</small><b>${withUnit(min)}</b></div>
          <div><small>Maximum</small><b>${withUnit(max)}</b></div>
        </div>
      </div>`;
  }

  function updateGraphRangeStats() {
    const stats = $('#graphStats');
    const bounds = graphTimeBounds();
    if (!stats || !bounds) return;

    const start = clamp(Number.isFinite(state.graphView.rangeStart) ? state.graphView.rangeStart : bounds.min, bounds.min, bounds.max);
    const end = clamp(Number.isFinite(state.graphView.rangeEnd) ? state.graphView.rangeEnd : bounds.max, start, bounds.max);
    const points = bounds.points.filter((point) => point.dt >= start - 1e-9 && point.dt <= end + 1e-9);
    const series = selectedGraphSeries();

    const common =
      statCard('Čas úseku', `${formatNumber(Math.max(0, end - start), 3)} s`) +
      statCard('Počet bodů', `${points.length}`);

    const variableStats = series.map((key) => {
      const meta = graphSeriesMeta[key];
      const values = points.map((point) => point[meta.key]).filter(Number.isFinite);
      return statisticCard(meta, values);
    }).join('');

    stats.innerHTML = common + variableStats;
  }

  function resetGraphAnalysisRange() {
    state.graphView.rangeStart = null;
    state.graphView.rangeEnd = null;
    state.graphView.widthFactor = 1;
    renderGraphRange();
    setGraphWidth(1, false);
    updateGraphRangeStats();
  }

  installStyles();
  installVideoRange();
  installGraphControls();
  installAutoSelectionStartGuard();

  const drawChartBeforeRanges = drawChart;
  drawChart = function drawChartWithRanges() {
    drawChartBeforeRanges();
    renderGraphRange();
    drawGraphRangeMarkers();
    updateGraphRangeStats();
  };

  video.addEventListener('loadedmetadata', () => requestAnimationFrame(() => renderVideoRange(true)));
  $('#fpsInput')?.addEventListener('input', () => {
    renderVideoRange();
    renderGraphRange();
  });
  $('#cameraInput')?.addEventListener('change', () => {
    state.graphView.rangeStart = null;
    state.graphView.rangeEnd = null;
  });
  $('#fileInput')?.addEventListener('change', () => {
    state.graphView.rangeStart = null;
    state.graphView.rangeEnd = null;
  });
  $('#resetBtn')?.addEventListener('click', resetGraphAnalysisRange);

  renderVideoRange();
  renderGraphRange();
})();