(() => {
  state.graphCursor = { frame: null };
  let graphPointerId = null;

  function signedGraphValue(value, digits = 3) {
    if (!Number.isFinite(value)) return '–';
    const abs = formatNumber(Math.abs(value), digits);
    if (value > 1e-10) return `+${abs}`;
    if (value < -1e-10) return `−${abs}`;
    return '0';
  }

  function graphDataGeometry() {
    if (state.stage !== 'graphs') return null;
    const config = graphConfigs[state.graph] || graphConfigs.x;
    const points = kinematicsPoints();
    const data = points
      .map((point) => ({
        point,
        x: point[config.xKey],
        y: point[config.yKey]
      }))
      .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));

    if (data.length < 2) return null;
    const width = chart.parentElement?.clientWidth || 0;
    const height = chart.parentElement?.clientHeight || 0;
    if (!width || !height) return null;

    const plot = state.graphPlotGeometry;
    if (
      plot &&
      plot.xKey === config.xKey &&
      Array.isArray(plot.seriesKeys) &&
      plot.seriesKeys.includes(state.graph) &&
      plot.scaleRanges?.[config.unit]
    ) {
      const range = plot.scaleRanges[config.unit];
      const margin = plot.margin;
      const plotW = plot.plotW;
      const plotH = plot.plotH;
      const px = (value) => margin.l + ((value - plot.xmin) / (plot.xmax - plot.xmin)) * plotW;
      const py = (value) => margin.t + plotH - ((value - range.min) / (range.max - range.min)) * plotH;
      return { config, data, width, height, margin, plotW, plotH, px, py };
    }

    let seriesKeys = Array.isArray(state.graphSeries) && state.graphSeries.length ? state.graphSeries : [state.graph];
    const compatibleConfigs = seriesKeys
      .map((key) => graphConfigs[key])
      .filter((seriesConfig) => seriesConfig && seriesConfig.xKey === config.xKey);
    if (!compatibleConfigs.length) compatibleConfigs.push(config);

    const xs = [];
    const ys = [];
    points.forEach((point) => {
      const x = point[config.xKey];
      if (!Number.isFinite(x)) return;
      let hasSeriesValue = false;
      compatibleConfigs.forEach((seriesConfig) => {
        const y = point[seriesConfig.yKey];
        if (Number.isFinite(y)) {
          ys.push(y);
          hasSeriesValue = true;
        }
      });
      if (hasSeriesValue) xs.push(x);
    });

    if (xs.length < 2 || ys.length < 2) return null;
    const [xmin, xmax] = extent(xs);
    const [ymin, ymax] = extent(ys);
    const margin = { l: 56, r: 18, t: 18, b: 46 };
    const plotW = Math.max(1, width - margin.l - margin.r);
    const plotH = Math.max(1, height - margin.t - margin.b);
    const px = (value) => margin.l + ((value - xmin) / (xmax - xmin)) * plotW;
    const py = (value) => margin.t + plotH - ((value - ymin) / (ymax - ymin)) * plotH;

    return { config, data, width, height, margin, plotW, plotH, px, py };
  }

  function selectedGraphItem(geometry = graphDataGeometry()) {
    if (!geometry || !Number.isFinite(state.graphCursor.frame)) return null;
    return geometry.data.find((item) => item.point.frame === state.graphCursor.frame) || null;
  }

  function nearestByCanvasX(clientX) {
    const geometry = graphDataGeometry();
    if (!geometry) return null;
    const rect = chart.getBoundingClientRect();
    const x = clamp(clientX - rect.left, geometry.margin.l, geometry.margin.l + geometry.plotW);
    let best = null;
    let bestDistance = Infinity;
    geometry.data.forEach((item) => {
      const distance = Math.abs(geometry.px(item.x) - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    });
    return best;
  }

  function valueCell(label, value, unit = '', signed = false) {
    const text = Number.isFinite(value)
      ? `${signed ? signedGraphValue(value) : formatNumber(value, 3)}${unit ? ` ${unit}` : ''}`
      : '–';
    const cls = signed && Number.isFinite(value)
      ? value < -1e-10 ? 'negative' : value > 1e-10 ? 'positive' : ''
      : '';
    return `<div class="graph-point-value"><span>${label}</span><strong class="${cls}">${text}</strong></div>`;
  }

  function updateGraphPointInfo() {
    const info = $('#graphPointInfo');
    if (!info) return;
    const geometry = graphDataGeometry();
    const item = selectedGraphItem(geometry);

    if (!item) {
      info.innerHTML = '<span class="graph-point-hint">Klepni na bod nebo táhni prstem vodorovně po grafu.</span>';
      return;
    }

    const p = item.point;
    info.innerHTML = `
      <div class="graph-point-head">
        <strong>Snímek ${p.frame}</strong>
        <span>t = ${formatNumber(p.dt, 3)} s</span>
      </div>
      <div class="graph-point-grid">
        ${valueCell('x', p.xm, 'm', true)}
        ${valueCell('y', p.ym, 'm', true)}
        ${valueCell('vₓ', p.vx, 'm/s', true)}
        ${valueCell('vᵧ', p.vy, 'm/s', true)}
        ${valueCell('|v|', p.v, 'm/s')}
        ${valueCell('aₓ', p.ax, 'm/s²', true)}
        ${valueCell('aᵧ', p.ay, 'm/s²', true)}
        ${valueCell('|a|', p.a, 'm/s²')}
      </div>
    `;
  }

  function syncGraphSelection(item, seekVideo = false) {
    if (!item?.point) return;
    const point = item.point;
    state.graphCursor.frame = point.frame;

    const trackIndex = state.trackPoints.findIndex((trackPoint) => trackPoint.frame === point.frame);
    if (trackIndex >= 0) {
      state.selected = { kind: 'track', index: trackIndex };
      if (state.review) state.review.frame = point.frame;
    }

    if (seekVideo && Number.isFinite(point.t)) {
      video.pause();
      if (Math.abs(video.currentTime - point.t) > 0.35 / fps()) video.currentTime = point.t;
    }

    updateGraphPointInfo();
    drawChart();
    drawOverlay();
  }

  function drawGraphCursor() {
    const geometry = graphDataGeometry();
    const item = selectedGraphItem(geometry);
    if (!geometry || !item) return;

    const x = geometry.px(item.x);
    const y = geometry.py(item.y);
    const top = geometry.margin.t;
    const bottom = geometry.margin.t + geometry.plotH;

    chartCtx.save();
    chartCtx.strokeStyle = '#667085';
    chartCtx.lineWidth = 1.5;
    chartCtx.setLineDash([6, 5]);
    chartCtx.beginPath();
    chartCtx.moveTo(x, top);
    chartCtx.lineTo(x, bottom);
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    chartCtx.fillStyle = '#ffffff';
    chartCtx.strokeStyle = '#101828';
    chartCtx.lineWidth = 3;
    chartCtx.beginPath();
    chartCtx.arc(x, y, 7, 0, Math.PI * 2);
    chartCtx.fill();
    chartCtx.stroke();

    chartCtx.fillStyle = '#101828';
    chartCtx.beginPath();
    chartCtx.arc(x, y, 3.2, 0, Math.PI * 2);
    chartCtx.fill();
    chartCtx.restore();
  }

  function installGraphInteractionUi() {
    const wrap = chart.parentElement;
    if (!wrap || $('#graphPointInfo')) return;

    const info = document.createElement('div');
    info.id = 'graphPointInfo';
    info.className = 'graph-point-info';
    info.setAttribute('aria-live', 'polite');
    wrap.insertAdjacentElement('afterend', info);

    if (!$('#graphInteractionStyles')) {
      const style = document.createElement('style');
      style.id = 'graphInteractionStyles';
      style.textContent = `
        #chart{touch-action:pan-y;cursor:crosshair}
        .graph-point-info{margin:10px 0 12px;padding:11px;border:1px solid #e4e7ec;border-radius:12px;background:#f9fafb;min-height:44px}
        .graph-point-hint{display:block;color:#667085;font-size:.78rem;line-height:1.45}
        .graph-point-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;font-size:.8rem;color:#475467}
        .graph-point-head strong{color:#101828;font-size:.9rem}
        .graph-point-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
        .graph-point-value{padding:8px;border:1px solid #e4e7ec;border-radius:9px;background:#fff;min-width:0}
        .graph-point-value span{display:block;color:#667085;font-size:.67rem;margin-bottom:2px}
        .graph-point-value strong{display:block;color:#101828;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .graph-point-value strong.negative{color:#b42318}.graph-point-value strong.positive{color:#067647}
        @media(max-width:520px){.graph-point-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `;
      document.head.append(style);
    }

    chart.tabIndex = 0;
    chart.setAttribute('aria-label', 'Interaktivní graf. Klepni nebo táhni vodorovně pro výběr bodu. Šipkami vlevo a vpravo lze procházet body.');

    updateGraphPointInfo();
  }

  function selectFromPointer(event, seekVideo = false) {
    const item = nearestByCanvasX(event.clientX);
    if (!item) return;
    syncGraphSelection(item, seekVideo);
  }

  chart.addEventListener('pointerdown', (event) => {
    if (state.stage !== 'graphs') return;
    graphPointerId = event.pointerId;
    chart.setPointerCapture?.(event.pointerId);
    selectFromPointer(event, false);
  });

  chart.addEventListener('pointermove', (event) => {
    if (graphPointerId !== event.pointerId) return;
    selectFromPointer(event, false);
  });

  chart.addEventListener('pointerup', (event) => {
    if (graphPointerId !== event.pointerId) return;
    selectFromPointer(event, true);
    graphPointerId = null;
  });

  chart.addEventListener('pointercancel', (event) => {
    if (graphPointerId === event.pointerId) graphPointerId = null;
  });

  chart.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const geometry = graphDataGeometry();
    if (!geometry?.data.length) return;
    event.preventDefault();

    let index = geometry.data.findIndex((item) => item.point.frame === state.graphCursor.frame);
    if (index < 0) index = 0;
    index = clamp(index + (event.key === 'ArrowRight' ? 1 : -1), 0, geometry.data.length - 1);
    syncGraphSelection(geometry.data[index], true);
  });

  const drawChartBeforeInteraction = drawChart;
  drawChart = function drawInteractiveChart() {
    drawChartBeforeInteraction();
    drawGraphCursor();
    updateGraphPointInfo();
  };

  $$('.graph-tab').forEach((button) => {
    button.addEventListener('click', () => {
      const geometry = graphDataGeometry();
      if (state.graphCursor.frame != null && !selectedGraphItem(geometry)) state.graphCursor.frame = null;
      requestAnimationFrame(() => {
        drawChart();
        updateGraphPointInfo();
      });
    });
  });

  const resetGraphCursor = () => {
    state.graphCursor.frame = null;
    updateGraphPointInfo();
  };
  $('#cameraInput')?.addEventListener('change', resetGraphCursor);
  $('#fileInput')?.addEventListener('change', resetGraphCursor);
  $('#resetBtn')?.addEventListener('click', resetGraphCursor);
  $('#segmentEnabled')?.addEventListener('change', resetGraphCursor);

  installGraphInteractionUi();
})();