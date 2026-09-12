(() => {
  function isPathSelected() {
    const selected = Array.isArray(state.graphSeries) ? state.graphSeries : [state.graph];
    return selected.includes('s') || state.graph === 's';
  }

  function selectedPathPoint() {
    if (!Number.isFinite(state.graphCursor?.frame)) return null;
    return kinematicsPoints().find((point) => point.frame === state.graphCursor.frame) || null;
  }

  function updatePathPointInfo() {
    const info = $('#graphPointInfo');
    if (!info) return;
    info.querySelector('[data-path-distance-cell]')?.remove();
    if (!isPathSelected()) return;

    const point = selectedPathPoint();
    const grid = info.querySelector('.graph-point-grid');
    if (!point || !grid || !Number.isFinite(point.s)) return;

    const cell = document.createElement('div');
    cell.className = 'graph-point-value';
    cell.dataset.pathDistanceCell = '1';
    cell.innerHTML = `<span>|s|</span><strong>${formatNumber(point.s, 3)} m</strong>`;
    grid.append(cell);
    grid.dataset.count = String(grid.children.length);
  }

  function updatePathStats() {
    const stats = $('#graphStats');
    if (!stats) return;
    stats.querySelector('[data-path-distance-stat]')?.remove();
    if (!isPathSelected()) return;

    const points = kinematicsPoints().filter((point) => Number.isFinite(point.dt) && Number.isFinite(point.s));
    if (!points.length) return;

    const minTime = Math.min(...points.map((point) => point.dt));
    const maxTime = Math.max(...points.map((point) => point.dt));
    const start = clamp(Number.isFinite(state.graphView?.rangeStart) ? state.graphView.rangeStart : minTime, minTime, maxTime);
    const end = clamp(Number.isFinite(state.graphView?.rangeEnd) ? state.graphView.rangeEnd : maxTime, start, maxTime);
    const values = points
      .filter((point) => point.dt >= start - 1e-9 && point.dt <= end + 1e-9)
      .map((point) => point.s);
    if (!values.length) return;

    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);

    const card = document.createElement('div');
    card.className = 'stat range-variable-stat';
    card.dataset.pathDistanceStat = '1';
    card.innerHTML = `
      <span class="range-stat-title"><i class="range-stat-dot" style="background:#b54708"></i>|s| [m]</span>
      <div class="range-stat-values">
        <div><small>Průměr</small><b>${formatNumber(average, 3)} m</b></div>
        <div><small>Minimum</small><b>${formatNumber(minimum, 3)} m</b></div>
        <div><small>Maximum</small><b>${formatNumber(maximum, 3)} m</b></div>
      </div>`;
    stats.append(card);
  }

  const drawChartBeforePathUi = drawChart;
  drawChart = function drawChartWithPathUi() {
    drawChartBeforePathUi();
    updatePathPointInfo();
    updatePathStats();
  };
})();