(() => {
  const seriesMeta = {
    x:  { label: 'x',   unit: 'm',     color: '#155eef' },
    y:  { label: 'y',   unit: 'm',     color: '#7f56d9' },
    vx: { label: 'vₓ',  unit: 'm/s',   color: '#f79009' },
    vy: { label: 'vᵧ',  unit: 'm/s',   color: '#d444f1' },
    v:  { label: '|v|', unit: 'm/s',   color: '#12b76a' },
    ax: { label: 'aₓ',  unit: 'm/s²',  color: '#039855' },
    ay: { label: 'aᵧ',  unit: 'm/s²',  color: '#06aed4' },
    a:  { label: '|a|', unit: 'm/s²',  color: '#d92d20' },
    xy: { label: 'y(x)', unit: 'm',    color: '#155eef' }
  };

  const timeSeries = ['x', 'y', 'vx', 'vy', 'v', 'ax', 'ay', 'a'];
  const presets = {
    motionX: ['x', 'vx', 'ax'],
    motionY: ['y', 'vy', 'ay']
  };

  state.graphSeries = [state.graph || 'x'];
  state.graphPlotGeometry = null;

  function normalizeGraphSeries() {
    if (state.graph === 'xy') {
      state.graphSeries = ['xy'];
      return state.graphSeries;
    }

    let series = Array.isArray(state.graphSeries)
      ? state.graphSeries.filter((key) => timeSeries.includes(key))
      : [];

    if (!series.includes(state.graph) && timeSeries.includes(state.graph)) series.unshift(state.graph);
    if (!series.length) series = [timeSeries.includes(state.graph) ? state.graph : 'x'];
    state.graphSeries = [...new Set(series)].slice(0, 3);
    return state.graphSeries;
  }

  function setPrimaryGraph(key) {
    if (!graphConfigs[key]) return;
    state.graph = key;
    $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.graph === key));
  }

  function syncGraphTabs() {
    const selected = normalizeGraphSeries();
    $$('.graph-tab').forEach((button) => {
      const key = button.dataset.graph;
      button.classList.toggle('multi-active', selected.includes(key) && key !== state.graph);
    });
  }

  function seriesData(points, key, xKey = 'dt') {
    const config = graphConfigs[key];
    if (!config) return [];
    return points
      .map((point) => ({ point, x: point[xKey], y: point[config.yKey] }))
      .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
  }

  function buildScaleGroups(seriesKeys, dataByKey) {
    const groups = new Map();
    seriesKeys.forEach((key) => {
      const unit = seriesMeta[key]?.unit || graphConfigs[key]?.unit || '';
      if (!groups.has(unit)) groups.set(unit, []);
      (dataByKey[key] || []).forEach((item) => groups.get(unit).push(item.y));
    });

    const ranges = {};
    groups.forEach((values, unit) => {
      if (!values.length) return;
      const [min, max] = extent(values);
      ranges[unit] = { min, max };
    });
    return ranges;
  }

  function rangeForKey(key, ranges) {
    const unit = seriesMeta[key]?.unit || graphConfigs[key]?.unit || '';
    return ranges[unit] || { min: -1, max: 1 };
  }

  function legendHtml(seriesKeys, ranges = null) {
    return seriesKeys.map((key) => {
      const meta = seriesMeta[key];
      const range = ranges ? rangeForKey(key, ranges) : null;
      const rangeText = range
        ? `<small>${formatNumber(range.min, 2)} až ${formatNumber(range.max, 2)} ${meta.unit}</small>`
        : `<small>${meta.unit}</small>`;
      return `<span class="multi-legend-item"><i class="series-dot" style="background:${meta.color}"></i><b>${meta.label}</b>${rangeText}</span>`;
    }).join('');
  }

  function installMultiGraphUi() {
    const tabs = document.querySelector('.graph-tabs');
    if (!tabs || $('#multiGraphControls')) return;

    const controls = document.createElement('div');
    controls.id = 'multiGraphControls';
    controls.className = 'multi-graph-controls';
    controls.innerHTML = `
      <div class="tool-head">
        <strong>Křivky v grafu</strong>
        <span id="multiGraphCount" class="tool-status">1 / 3</span>
      </div>
      <div id="motionGraphPresets" class="motion-graph-presets">
        <button type="button" class="secondary-btn small" data-preset="motionX">x + vₓ + aₓ</button>
        <button type="button" class="secondary-btn small" data-preset="motionY">y + vᵧ + aᵧ</button>
      </div>
      <div id="multiGraphChoices" class="multi-graph-choices"></div>
      <div id="multiGraphLegend" class="multi-graph-legend"></div>
      <p id="multiGraphHelp" class="micro-help">Až tři křivky mohou mít různé jednotky. Každá jednotka pak používá vlastní barevné svislé měřítko.</p>
    `;
    tabs.insertAdjacentElement('afterend', controls);

    if (!$('#multiGraphStyles')) {
      const style = document.createElement('style');
      style.id = 'multiGraphStyles';
      style.textContent = `
        .multi-graph-controls{margin:8px 0 10px;padding:11px;border:1px solid #e4e7ec;border-radius:12px;background:#f9fafb}
        .motion-graph-presets{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}
        .motion-graph-presets .secondary-btn{min-height:38px;padding:7px 9px;font-size:.78rem}
        .motion-graph-presets .active{background:#eff4ff;border-color:#84adff;color:#155eef}
        .multi-graph-choices{display:flex;flex-wrap:wrap;gap:7px}
        .multi-series-choice{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:7px 10px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;font-size:.78rem;font-weight:800;color:#344054}
        .multi-series-choice input{width:17px;height:17px;min-height:0;margin:0;padding:0}
        .series-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}
        .multi-graph-legend{display:flex;flex-wrap:wrap;gap:7px 10px;margin-top:9px;font-size:.74rem;color:#475467}
        .multi-legend-item{display:inline-grid!important;grid-template-columns:auto auto;align-items:center;column-gap:5px;row-gap:0;padding:5px 7px;border:1px solid #e4e7ec;border-radius:8px;background:#fff}
        .multi-legend-item small{grid-column:2;color:#667085;font-size:.66rem;font-weight:650;white-space:nowrap}
        .graph-tab.multi-active{box-shadow:inset 0 0 0 2px #d0d5dd;background:#fff}
        @media(max-width:430px){.motion-graph-presets{gap:5px}.motion-graph-presets .secondary-btn{font-size:.73rem}.multi-legend-item{padding:4px 6px}}
      `;
      document.head.append(style);
    }

    controls.querySelectorAll('[data-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const keys = presets[button.dataset.preset];
        if (!keys) return;
        state.graphSeries = [...keys];
        setPrimaryGraph(keys[0]);
        renderMultiGraphUi();
        drawChart();
      });
    });

    renderMultiGraphUi();
  }

  function renderMultiGraphUi(ranges = null) {
    const choices = $('#multiGraphChoices');
    const legend = $('#multiGraphLegend');
    const count = $('#multiGraphCount');
    const help = $('#multiGraphHelp');
    const presetWrap = $('#motionGraphPresets');
    if (!choices || !legend || !count || !help) return;

    const selected = normalizeGraphSeries();

    if (state.graph === 'xy') {
      choices.innerHTML = '<span class="graph-point-hint">Graf y(x) se zobrazuje samostatně.</span>';
      if (presetWrap) presetWrap.style.display = 'none';
      help.textContent = 'Více křivek je dostupných pro grafy závislé na čase.';
    } else {
      if (presetWrap) presetWrap.style.display = '';
      choices.innerHTML = timeSeries.map((key) => {
        const meta = seriesMeta[key];
        const checked = selected.includes(key) ? 'checked' : '';
        return `<label class="multi-series-choice"><input type="checkbox" data-series="${key}" ${checked}><span class="series-dot" style="background:${meta.color}"></span>${meta.label}(t)</label>`;
      }).join('');

      help.textContent = 'Vyber 1–3 křivky. Při různých jednotkách má každá jednotka vlastní svislé měřítko; přesné hodnoty ukáže kurzor.';

      choices.querySelectorAll('input[data-series]').forEach((input) => {
        input.addEventListener('change', () => {
          const key = input.dataset.series;
          let next = [...normalizeGraphSeries()];

          if (input.checked) {
            if (!next.includes(key)) next.push(key);
            if (next.length > 3) {
              input.checked = false;
              toast('V jednom grafu mohou být nejvýše tři křivky.');
              return;
            }
          } else {
            next = next.filter((item) => item !== key);
            if (!next.length) {
              input.checked = true;
              toast('V grafu musí zůstat alespoň jedna křivka.');
              return;
            }
          }

          state.graphSeries = next;
          if (!next.includes(state.graph)) setPrimaryGraph(next[0]);
          renderMultiGraphUi();
          drawChart();
        });
      });
    }

    count.textContent = `${selected.length} / 3`;
    legend.innerHTML = legendHtml(selected, ranges);

    if (presetWrap) {
      presetWrap.querySelectorAll('[data-preset]').forEach((button) => {
        const keys = presets[button.dataset.preset] || [];
        const active = keys.length === selected.length && keys.every((key, index) => selected[index] === key);
        button.classList.toggle('active', active);
      });
    }
    syncGraphTabs();
  }

  function drawSeriesStats(seriesKeys, dataByKey) {
    const stats = $('#graphStats');
    if (!stats) return;

    if (seriesKeys.length === 1) {
      const key = seriesKeys[0];
      const config = graphConfigs[key];
      const data = dataByKey[key] || [];
      if (!data.length) return;
      const ys = data.map((item) => item.y);
      const average = ys.reduce((sum, value) => sum + value, 0) / ys.length;
      let html = statCard('Průměr', `${formatNumber(average)} ${config.unit}`) +
        statCard('Minimum', `${formatNumber(Math.min(...ys))} ${config.unit}`) +
        statCard('Maximum', `${formatNumber(Math.max(...ys))} ${config.unit}`) +
        statCard('Počet bodů', `${data.length}`);

      if (config.fit) {
        const xs = data.map((item) => item.x);
        const fit = linearFit(xs, ys);
        if (fit) {
          const slopeUnit = key === 'x' || key === 'y' ? 'm/s' : '';
          html += statCard('Směrnice přímky', `${formatNumber(fit.slope)} ${slopeUnit}`.trim()) +
            statCard('Průsečík', `${formatNumber(fit.intercept)} ${config.unit}`);
        }
      }
      stats.innerHTML = html;
      return;
    }

    stats.innerHTML = seriesKeys.map((key) => {
      const data = dataByKey[key] || [];
      const meta = seriesMeta[key];
      if (!data.length) return statCard(meta.label, '–');
      const ys = data.map((item) => item.y);
      const average = ys.reduce((sum, value) => sum + value, 0) / ys.length;
      return statCard(meta.label, `průměr ${formatNumber(average)} ${meta.unit}`);
    }).join('') + statCard('Počet bodů', `${Math.max(...seriesKeys.map((key) => dataByKey[key]?.length || 0))}`);
  }

  drawChart = function drawMultiSeriesChart() {
    if (state.stage !== 'graphs') return;

    const seriesKeys = normalizeGraphSeries();
    const primaryKey = seriesKeys[0] || state.graph || 'x';
    if (state.graph !== primaryKey) setPrimaryGraph(primaryKey);

    const primaryConfig = graphConfigs[primaryKey] || graphConfigs.x;
    const xKey = primaryKey === 'xy' ? primaryConfig.xKey : 'dt';
    const points = kinematicsPoints();
    const dataByKey = Object.fromEntries(seriesKeys.map((key) => [key, seriesData(points, key, xKey)]));
    const allData = seriesKeys.flatMap((key) => dataByKey[key]);

    if (allData.length < 2) {
      state.graphPlotGeometry = null;
      const message = seriesKeys.some((key) => key === 'ax' || key === 'ay' || key === 'a')
        ? 'Pro zrychlení označ alespoň 3 body.'
        : 'Pro tento graf není dost dat.';
      drawEmptyChart(message);
      $('#graphStats').innerHTML = statCard('Data', message);
      renderMultiGraphUi();
      return;
    }

    const width = chart.parentElement.clientWidth;
    const height = chart.parentElement.clientHeight;
    if (!width || !height) return;

    const xs = allData.map((item) => item.x);
    const [xmin, xmax] = extent(xs);
    const scaleRanges = buildScaleGroups(seriesKeys, dataByKey);
    const unitCount = Object.keys(scaleRanges).length;
    const m = { l: unitCount === 1 ? 56 : 42, r: 18, t: 18, b: 46 };
    const plotW = Math.max(1, width - m.l - m.r);
    const plotH = Math.max(1, height - m.t - m.b);
    const px = (value) => m.l + ((value - xmin) / (xmax - xmin)) * plotW;
    const pyForKey = (key, value) => {
      const range = rangeForKey(key, scaleRanges);
      return m.t + plotH - ((value - range.min) / (range.max - range.min)) * plotH;
    };

    state.graphPlotGeometry = {
      xKey,
      xmin,
      xmax,
      margin: m,
      plotW,
      plotH,
      width,
      height,
      scaleRanges,
      seriesKeys: [...seriesKeys]
    };

    chartCtx.clearRect(0, 0, width, height);
    chartCtx.fillStyle = '#fff';
    chartCtx.fillRect(0, 0, width, height);
    chartCtx.strokeStyle = '#e4e7ec';
    chartCtx.lineWidth = 1;
    chartCtx.fillStyle = '#667085';
    chartCtx.font = '11px system-ui,sans-serif';

    for (let i = 0; i <= 4; i += 1) {
      const gx = m.l + plotW * i / 4;
      const gy = m.t + plotH * i / 4;
      chartCtx.beginPath(); chartCtx.moveTo(gx, m.t); chartCtx.lineTo(gx, m.t + plotH); chartCtx.stroke();
      chartCtx.beginPath(); chartCtx.moveTo(m.l, gy); chartCtx.lineTo(m.l + plotW, gy); chartCtx.stroke();
      chartCtx.fillText(formatNumber(xmin + (xmax - xmin) * i / 4, 2), gx - 12, m.t + plotH + 18);
    }

    if (unitCount === 1) {
      const range = Object.values(scaleRanges)[0];
      for (let i = 0; i <= 4; i += 1) {
        const gy = m.t + plotH * i / 4;
        chartCtx.fillText(formatNumber(range.max - (range.max - range.min) * i / 4, 2), 5, gy + 4);
      }
    } else {
      chartCtx.save();
      chartCtx.fillStyle = '#98a2b3';
      chartCtx.font = '10px system-ui,sans-serif';
      chartCtx.translate(12, m.t + plotH / 2);
      chartCtx.rotate(-Math.PI / 2);
      chartCtx.textAlign = 'center';
      chartCtx.fillText('vlastní barevná měřítka', 0, 0);
      chartCtx.restore();
    }

    chartCtx.fillStyle = '#344054';
    chartCtx.font = '12px system-ui,sans-serif';
    chartCtx.textAlign = 'center';
    chartCtx.fillText(primaryKey === 'xy' ? primaryConfig.xLabel : 't [s]', m.l + plotW / 2, height - 8);

    if (unitCount === 1) {
      chartCtx.save();
      chartCtx.translate(13, m.t + plotH / 2);
      chartCtx.rotate(-Math.PI / 2);
      chartCtx.fillText(seriesKeys.length === 1 ? primaryConfig.yLabel : `[${seriesMeta[primaryKey].unit}]`, 0, 0);
      chartCtx.restore();
    }
    chartCtx.textAlign = 'start';

    seriesKeys.forEach((key) => {
      const data = dataByKey[key];
      if (!data?.length) return;
      const meta = seriesMeta[key];
      chartCtx.save();
      chartCtx.strokeStyle = meta.color;
      chartCtx.lineWidth = key === primaryKey ? 2.8 : 2.35;
      chartCtx.beginPath();
      data.forEach((item, index) => {
        const x = px(item.x);
        const y = pyForKey(key, item.y);
        if (index === 0) chartCtx.moveTo(x, y);
        else chartCtx.lineTo(x, y);
      });
      chartCtx.stroke();
      data.forEach((item) => {
        chartCtx.fillStyle = meta.color;
        chartCtx.beginPath();
        chartCtx.arc(px(item.x), pyForKey(key, item.y), seriesKeys.length > 1 ? 3.2 : 4, 0, Math.PI * 2);
        chartCtx.fill();
        chartCtx.strokeStyle = '#fff';
        chartCtx.lineWidth = 1.2;
        chartCtx.stroke();
      });
      chartCtx.restore();
    });

    if (seriesKeys.length === 1 && primaryConfig.fit) {
      const data = dataByKey[primaryKey];
      const fit = linearFit(data.map((item) => item.x), data.map((item) => item.y));
      if (fit) {
        chartCtx.save();
        chartCtx.strokeStyle = '#7f56d9';
        chartCtx.lineWidth = 2;
        chartCtx.setLineDash([7, 5]);
        chartCtx.beginPath();
        chartCtx.moveTo(px(xmin), pyForKey(primaryKey, fit.slope * xmin + fit.intercept));
        chartCtx.lineTo(px(xmax), pyForKey(primaryKey, fit.slope * xmax + fit.intercept));
        chartCtx.stroke();
        chartCtx.restore();
      }
    }

    drawSeriesStats(seriesKeys, dataByKey);
    renderMultiGraphUi(scaleRanges);
  };

  installMultiGraphUi();

  $$('.graph-tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.graphSeries = [state.graph];
      renderMultiGraphUi();
      drawChart();
    });
  });

  $('#segmentEnabled')?.addEventListener('change', () => requestAnimationFrame(() => drawChart()));
})();