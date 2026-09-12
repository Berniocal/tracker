(() => {
  const seriesMeta = {
    x:  { family: 'position', label: 'x',   unit: 'm',    color: '#155eef' },
    y:  { family: 'position', label: 'y',   unit: 'm',    color: '#f79009' },
    vx: { family: 'velocity', label: 'vₓ',  unit: 'm/s',  color: '#155eef' },
    vy: { family: 'velocity', label: 'vᵧ',  unit: 'm/s',  color: '#f79009' },
    v:  { family: 'velocity', label: '|v|', unit: 'm/s',  color: '#12b76a' },
    ax: { family: 'acceleration', label: 'aₓ',  unit: 'm/s²', color: '#155eef' },
    ay: { family: 'acceleration', label: 'aᵧ',  unit: 'm/s²', color: '#f79009' },
    a:  { family: 'acceleration', label: '|a|', unit: 'm/s²', color: '#12b76a' },
    xy: { family: 'trajectory', label: 'y(x)', unit: 'm', color: '#155eef' }
  };

  const familySeries = {
    position: ['x', 'y'],
    velocity: ['vx', 'vy', 'v'],
    acceleration: ['ax', 'ay', 'a'],
    trajectory: ['xy']
  };

  const familyAxisLabel = {
    position: 'poloha [m]',
    velocity: 'rychlost [m/s]',
    acceleration: 'zrychlení [m/s²]',
    trajectory: 'y [m]'
  };

  state.graphSeries = [state.graph || 'x'];

  function currentFamily() {
    return seriesMeta[state.graph]?.family || 'position';
  }

  function normalizeGraphSeries() {
    const family = currentFamily();
    const allowed = familySeries[family] || [state.graph];
    let series = Array.isArray(state.graphSeries) ? state.graphSeries.filter((key) => allowed.includes(key)) : [];
    if (!series.includes(state.graph)) series.unshift(state.graph);
    if (!series.length) series = [state.graph];
    state.graphSeries = [...new Set(series)].slice(0, 3);
    return state.graphSeries;
  }

  function syncGraphTabs() {
    const selected = normalizeGraphSeries();
    $$('.graph-tab').forEach((button) => {
      const key = button.dataset.graph;
      button.classList.toggle('multi-active', selected.includes(key) && key !== state.graph);
    });
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
      <div id="multiGraphChoices" class="multi-graph-choices"></div>
      <div id="multiGraphLegend" class="multi-graph-legend"></div>
      <p id="multiGraphHelp" class="micro-help">Do jednoho grafu lze dát až tři veličiny se stejnou jednotkou.</p>
    `;
    tabs.insertAdjacentElement('afterend', controls);

    if (!$('#multiGraphStyles')) {
      const style = document.createElement('style');
      style.id = 'multiGraphStyles';
      style.textContent = `
        .multi-graph-controls{margin:8px 0 10px;padding:11px;border:1px solid #e4e7ec;border-radius:12px;background:#f9fafb}
        .multi-graph-choices{display:flex;flex-wrap:wrap;gap:7px}
        .multi-series-choice{display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:7px 10px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;font-size:.78rem;font-weight:800;color:#344054}
        .multi-series-choice input{width:17px;height:17px;min-height:0;margin:0;padding:0}
        .series-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}
        .multi-graph-legend{display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:9px;font-size:.74rem;color:#475467}
        .multi-graph-legend span{display:inline-flex;align-items:center;gap:5px;font-weight:750}
        .graph-tab.multi-active{box-shadow:inset 0 0 0 2px #d0d5dd;background:#fff}
      `;
      document.head.append(style);
    }

    renderMultiGraphUi();
  }

  function renderMultiGraphUi() {
    const choices = $('#multiGraphChoices');
    const legend = $('#multiGraphLegend');
    const count = $('#multiGraphCount');
    const help = $('#multiGraphHelp');
    if (!choices || !legend || !count || !help) return;

    const family = currentFamily();
    const selected = normalizeGraphSeries();
    const allowed = familySeries[family] || [state.graph];

    if (family === 'trajectory') {
      choices.innerHTML = '<span class="graph-point-hint">Graf y(x) se zobrazuje samostatně.</span>';
      help.textContent = 'Více křivek je dostupných pro grafy závislé na čase.';
    } else {
      choices.innerHTML = allowed.map((key) => {
        const meta = seriesMeta[key];
        const checked = selected.includes(key) ? 'checked' : '';
        return `<label class="multi-series-choice"><input type="checkbox" data-series="${key}" ${checked}><span class="series-dot" style="background:${meta.color}"></span>${meta.label}(t)</label>`;
      }).join('');
      help.textContent = 'Vyber 1–3 křivky. Kombinovat lze jen veličiny se stejnou jednotkou.';

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
          if (!next.includes(state.graph)) {
            state.graph = next[0];
            $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.graph === state.graph));
          }
          syncGraphTabs();
          renderMultiGraphUi();
          drawChart();
        });
      });
    }

    count.textContent = `${selected.length} / 3`;
    legend.innerHTML = selected.map((key) => {
      const meta = seriesMeta[key];
      return `<span><i class="series-dot" style="background:${meta.color}"></i>${meta.label}</span>`;
    }).join('');
    syncGraphTabs();
  }

  function seriesData(points, key, xKey) {
    const config = graphConfigs[key];
    if (!config) return [];
    return points
      .map((point) => ({ point, x: point[xKey], y: point[config.yKey] }))
      .filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
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
    if (state.graph !== primaryKey) state.graph = primaryKey;
    const primaryConfig = graphConfigs[primaryKey] || graphConfigs.x;
    const xKey = primaryConfig.xKey;
    const points = kinematicsPoints();
    const dataByKey = Object.fromEntries(seriesKeys.map((key) => [key, seriesData(points, key, xKey)]));
    const allData = seriesKeys.flatMap((key) => dataByKey[key]);

    if (allData.length < 2) {
      const message = currentFamily() === 'acceleration' ? 'Pro zrychlení označ alespoň 3 body.' : 'Pro tento graf není dost dat.';
      drawEmptyChart(message);
      $('#graphStats').innerHTML = statCard('Data', message);
      return;
    }

    const width = chart.parentElement.clientWidth;
    const height = chart.parentElement.clientHeight;
    if (!width || !height) return;

    const xs = allData.map((item) => item.x);
    const ys = allData.map((item) => item.y);
    const [xmin, xmax] = extent(xs);
    const [ymin, ymax] = extent(ys);
    const m = { l: 56, r: 18, t: 18, b: 46 };
    const plotW = Math.max(1, width - m.l - m.r);
    const plotH = Math.max(1, height - m.t - m.b);
    const px = (value) => m.l + ((value - xmin) / (xmax - xmin)) * plotW;
    const py = (value) => m.t + plotH - ((value - ymin) / (ymax - ymin)) * plotH;

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
      chartCtx.fillText(formatNumber(ymax - (ymax - ymin) * i / 4, 2), 5, gy + 4);
    }

    chartCtx.fillStyle = '#344054';
    chartCtx.font = '12px system-ui,sans-serif';
    chartCtx.textAlign = 'center';
    chartCtx.fillText(primaryConfig.xLabel, m.l + plotW / 2, height - 8);
    chartCtx.save();
    chartCtx.translate(13, m.t + plotH / 2);
    chartCtx.rotate(-Math.PI / 2);
    const yAxisLabel = seriesKeys.length === 1 ? primaryConfig.yLabel : familyAxisLabel[currentFamily()];
    chartCtx.fillText(yAxisLabel, 0, 0);
    chartCtx.restore();
    chartCtx.textAlign = 'start';

    seriesKeys.forEach((key) => {
      const data = dataByKey[key];
      if (!data?.length) return;
      const meta = seriesMeta[key];
      chartCtx.save();
      chartCtx.strokeStyle = meta.color;
      chartCtx.lineWidth = key === primaryKey ? 2.8 : 2.35;
      chartCtx.beginPath();
      data.forEach((item, index) => index === 0 ? chartCtx.moveTo(px(item.x), py(item.y)) : chartCtx.lineTo(px(item.x), py(item.y)));
      chartCtx.stroke();
      data.forEach((item) => {
        chartCtx.fillStyle = meta.color;
        chartCtx.beginPath();
        chartCtx.arc(px(item.x), py(item.y), seriesKeys.length > 1 ? 3.2 : 4, 0, Math.PI * 2);
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
        chartCtx.moveTo(px(xmin), py(fit.slope * xmin + fit.intercept));
        chartCtx.lineTo(px(xmax), py(fit.slope * xmax + fit.intercept));
        chartCtx.stroke();
        chartCtx.restore();
      }
    }

    drawSeriesStats(seriesKeys, dataByKey);
  };

  installMultiGraphUi();

  $$('.graph-tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.graphSeries = [state.graph];
      renderMultiGraphUi();
      drawChart();
    });
  });

  $('#segmentEnabled')?.addEventListener('change', () => {
    requestAnimationFrame(() => drawChart());
  });
})();