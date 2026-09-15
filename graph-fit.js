(() => {
  const fitColors = {
    x: '#155eef', y: '#7f56d9', s: '#b54708',
    vx: '#f79009', vy: '#d444f1', v: '#12b76a',
    ax: '#039855', ay: '#06aed4', a: '#d92d20', xy: '#155eef'
  };

  state.graphFit = state.graphFit || { mode: 'none' };

  // The old x(t)/y(t) straight-line fit used the whole graph. The new fit
  // deliberately works only with the interval selected by the two sliders.
  Object.values(graphConfigs || {}).forEach((config) => {
    if (config && 'fit' in config) config.fit = false;
  });

  function selectedSeries() {
    return window.TrackerGraphExport?.getSeries?.() || [];
  }

  function linearRegression(pairs) {
    if (pairs.length < 2) return null;
    const n = pairs.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pairs.forEach(({ x, y }) => {
      sx += x; sy += y; sxx += x * x; sxy += x * y;
    });
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-14) return null;
    const a = (n * sxy - sx * sy) / den;
    const b = (sy - a * sx) / n;
    return finishFit(pairs, [b, a]);
  }

  function solve3(matrix, vector) {
    const a = matrix.map((row, i) => [...row, vector[i]]);
    for (let col = 0; col < 3; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < 3; row += 1) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }
      if (Math.abs(a[pivot][col]) < 1e-14) return null;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      const div = a[col][col];
      for (let j = col; j < 4; j += 1) a[col][j] /= div;
      for (let row = 0; row < 3; row += 1) {
        if (row === col) continue;
        const factor = a[row][col];
        for (let j = col; j < 4; j += 1) a[row][j] -= factor * a[col][j];
      }
    }
    return [a[0][3], a[1][3], a[2][3]];
  }

  function quadraticRegression(pairs) {
    if (pairs.length < 3) return null;
    const n = pairs.length;
    let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0;
    let sy = 0, sxy = 0, sx2y = 0;
    pairs.forEach(({ x, y }) => {
      const x2 = x * x;
      sx += x;
      sx2 += x2;
      sx3 += x2 * x;
      sx4 += x2 * x2;
      sy += y;
      sxy += x * y;
      sx2y += x2 * y;
    });
    const coeff = solve3(
      [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]],
      [sy, sxy, sx2y]
    );
    return coeff ? finishFit(pairs, coeff) : null;
  }

  function finishFit(pairs, coeff) {
    const predict = (x) => coeff.reduce((sum, c, power) => sum + c * x ** power, 0);
    const mean = pairs.reduce((sum, point) => sum + point.y, 0) / pairs.length;
    let ssRes = 0;
    let ssTot = 0;
    pairs.forEach((point) => {
      const residual = point.y - predict(point.x);
      ssRes += residual * residual;
      const centered = point.y - mean;
      ssTot += centered * centered;
    });
    const r2 = ssTot < 1e-18 ? (ssRes < 1e-18 ? 1 : 0) : 1 - ssRes / ssTot;
    return { coeff, predict, r2, count: pairs.length };
  }

  function currentFits() {
    if (state.graphFit.mode === 'none') return [];
    const fitFn = state.graphFit.mode === 'quadratic' ? quadraticRegression : linearRegression;
    return selectedSeries().map((series) => ({ series, fit: fitFn(series.pairs) })).filter((item) => item.fit);
  }

  function formatCoeff(value, digits = 4) {
    if (!Number.isFinite(value)) return '0';
    const normalized = Math.abs(value) < 1e-12 ? 0 : value;
    return formatNumber(normalized, digits);
  }

  function term(value, variable, first = false) {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return '';
    const sign = value < 0 ? '−' : first ? '' : '+';
    const magnitude = Math.abs(value);
    const coeff = variable && Math.abs(magnitude - 1) < 1e-12 ? '' : formatCoeff(magnitude);
    return `${sign}${coeff}${variable}`;
  }

  function equationText(series, fit) {
    const [c0 = 0, c1 = 0, c2 = 0] = fit.coeff;
    const xVar = series.key === 'xy' ? 'x' : 't';
    const lhs = series.key === 'xy' ? 'y(x)' : `${series.yLabel}(t)`;
    const parts = [];
    if (state.graphFit.mode === 'quadratic') {
      const q = term(c2, `${xVar}²`, true);
      if (q) parts.push(q);
      const l = term(c1, xVar, parts.length === 0);
      if (l) parts.push(l);
      const k = term(c0, '', parts.length === 0);
      if (k) parts.push(k);
    } else {
      const l = term(c1, xVar, true);
      if (l) parts.push(l);
      const k = term(c0, '', parts.length === 0);
      if (k) parts.push(k);
    }
    return `${lhs} = ${parts.join(' ') || '0'}`;
  }

  function installUi() {
    const anchor = $('#graphViewControls') || $('#graphDataExport') || $('#graphStats');
    if (!anchor || $('#graphFitControls')) return;

    const block = document.createElement('div');
    block.id = 'graphFitControls';
    block.className = 'graph-fit-controls';
    block.innerHTML = `
      <div class="graph-fit-buttons" role="group" aria-label="Proložení vybraného úseku">
        <button type="button" data-fit="none" class="secondary-btn active">Bez proložení</button>
        <button type="button" data-fit="linear" class="secondary-btn">Přímka</button>
        <button type="button" data-fit="quadratic" class="secondary-btn">Parabola</button>
      </div>
      <div id="graphFitEquations" class="graph-fit-equations hidden"></div>
    `;
    anchor.insertAdjacentElement('afterend', block);

    if (!$('#graphFitStyles')) {
      const style = document.createElement('style');
      style.id = 'graphFitStyles';
      style.textContent = `
        .graph-fit-controls{margin:7px 0 9px}
        .graph-fit-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
        .graph-fit-buttons button{min-height:38px;padding:7px 6px;font-size:.74rem}
        .graph-fit-buttons button.active{background:#101828;color:#fff;border-color:#101828}
        .graph-fit-equations{margin-top:7px;display:grid;gap:6px}
        .graph-fit-equation{padding:8px 10px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;font-size:.78rem;color:#344054;line-height:1.45}
        .graph-fit-equation strong{display:block;color:#101828;font-size:.84rem;overflow-wrap:anywhere}
        .graph-fit-equation span{font-size:.69rem;color:#667085}
        @media(max-width:430px){.graph-fit-buttons button{font-size:.69rem;padding:6px 4px}.graph-fit-equation{font-size:.74rem}}
      `;
      document.head.append(style);
    }

    block.querySelectorAll('[data-fit]').forEach((button) => {
      button.addEventListener('click', () => {
        state.graphFit.mode = button.dataset.fit;
        renderUi();
        drawChart();
      });
    });
    renderUi();
  }

  function renderUi() {
    const block = $('#graphFitControls');
    if (!block) return;
    block.querySelectorAll('[data-fit]').forEach((button) => {
      button.classList.toggle('active', button.dataset.fit === state.graphFit.mode);
    });

    const output = $('#graphFitEquations');
    if (!output) return;
    if (state.graphFit.mode === 'none') {
      output.classList.add('hidden');
      output.innerHTML = '';
      return;
    }

    const fits = currentFits();
    const minNeeded = state.graphFit.mode === 'quadratic' ? 3 : 2;
    if (!fits.length) {
      output.classList.remove('hidden');
      output.innerHTML = `<div class="graph-fit-equation">Pro toto proložení jsou potřeba alespoň ${minNeeded} body ve vybraném úseku.</div>`;
      return;
    }

    output.classList.remove('hidden');
    output.innerHTML = fits.map(({ series, fit }) => `
      <div class="graph-fit-equation">
        <strong>${equationText(series, fit)}</strong>
        <span>${series.label} • ${fit.count} bodů • R² = ${formatNumber(fit.r2, 4)}</span>
      </div>
    `).join('');
  }

  function drawFits() {
    if (state.graphFit.mode === 'none') return;
    const geometry = state.graphPlotGeometry;
    if (!geometry || !(geometry.xmax > geometry.xmin)) return;

    const fits = currentFits();
    if (!fits.length) return;

    const { margin, plotW, plotH, xmin, xmax, scaleRanges } = geometry;
    const px = (x) => margin.l + ((x - xmin) / (xmax - xmin)) * plotW;

    fits.forEach(({ series, fit }) => {
      const range = scaleRanges?.[series.yUnit];
      if (!range || !(range.max > range.min)) return;
      const py = (y) => margin.t + plotH - ((y - range.min) / (range.max - range.min)) * plotH;
      const xs = series.pairs.map((point) => point.x).filter(Number.isFinite);
      if (xs.length < 2) return;
      const lo = Math.max(xmin, Math.min(...xs));
      const hi = Math.min(xmax, Math.max(...xs));
      if (!(hi > lo)) return;

      chartCtx.save();
      chartCtx.beginPath();
      chartCtx.rect(margin.l, margin.t, plotW, plotH);
      chartCtx.clip();
      chartCtx.strokeStyle = fitColors[series.key] || '#101828';
      chartCtx.lineWidth = 3;
      chartCtx.setLineDash([9, 5]);
      chartCtx.globalAlpha = 0.95;
      chartCtx.beginPath();
      const samples = state.graphFit.mode === 'quadratic' ? 100 : 2;
      for (let i = 0; i < samples; i += 1) {
        const x = samples === 1 ? lo : lo + (hi - lo) * i / (samples - 1);
        const y = fit.predict(x);
        const cx = px(x);
        const cy = py(y);
        if (i === 0) chartCtx.moveTo(cx, cy);
        else chartCtx.lineTo(cx, cy);
      }
      chartCtx.stroke();
      chartCtx.restore();
    });
  }

  installUi();

  const drawChartBeforeFit = drawChart;
  drawChart = function drawChartWithFit() {
    drawChartBeforeFit();
    drawFits();
    renderUi();
  };
})();
