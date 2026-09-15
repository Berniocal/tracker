(() => {
  const exportMeta = {
    x:  { label: 'x',   field: 'xm', unit: 'm' },
    y:  { label: 'y',   field: 'ym', unit: 'm' },
    s:  { label: '|s|', field: 's',  unit: 'm' },
    vx: { label: 'vₓ',  field: 'vx', unit: 'm/s' },
    vy: { label: 'vᵧ',  field: 'vy', unit: 'm/s' },
    v:  { label: '|v|', field: 'v',  unit: 'm/s' },
    ax: { label: 'aₓ',  field: 'ax', unit: 'm/s²' },
    ay: { label: 'aᵧ',  field: 'ay', unit: 'm/s²' },
    a:  { label: '|a|', field: 'a',  unit: 'm/s²' }
  };

  function selectedKeys() {
    const selected = Array.isArray(state.graphSeries) && state.graphSeries.length
      ? [...new Set(state.graphSeries)]
      : [state.graph || 'x'];

    if (state.graph === 'xy' || selected.includes('xy')) return ['xy'];
    return selected.filter((key) => exportMeta[key]).slice(0, 3);
  }

  function exportPoints() {
    let points = kinematicsPoints()
      .filter((point) => Number.isFinite(point.dt))
      .sort((a, b) => a.dt - b.dt);

    if (!points.length) return points;

    const min = points[0].dt;
    const max = points[points.length - 1].dt;
    const start = clamp(Number.isFinite(state.graphView?.rangeStart) ? state.graphView.rangeStart : min, min, max);
    const end = clamp(Number.isFinite(state.graphView?.rangeEnd) ? state.graphView.rangeEnd : max, start, max);
    return points.filter((point) => point.dt >= start - 1e-9 && point.dt <= end + 1e-9);
  }

  function buildSeries() {
    const points = exportPoints();
    return selectedKeys().map((key) => {
      if (key === 'xy') {
        const pairs = points
          .filter((point) => Number.isFinite(point.xm) && Number.isFinite(point.ym))
          .map((point) => ({ x: point.xm, y: point.ym, frame: point.frame, t: point.dt }));
        return {
          key,
          label: 'Poloha y(x)',
          xLabel: 'x',
          xUnit: 'm',
          yLabel: 'y',
          yUnit: 'm',
          pairs
        };
      }

      const meta = exportMeta[key];
      const pairs = points
        .filter((point) => Number.isFinite(point[meta.field]))
        .map((point) => ({ x: point.dt, y: point[meta.field], frame: point.frame, t: point.dt }));
      return {
        key,
        label: `${meta.label}(t)`,
        xLabel: 't',
        xUnit: 's',
        yLabel: meta.label,
        yUnit: meta.unit,
        pairs
      };
    }).filter((series) => series.pairs.length);
  }

  function decimal(value) {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(10));
    return String(rounded);
  }

  function desmosExpressions() {
    const series = buildSeries();
    const lines = [];
    series.forEach((item, index) => {
      const n = index + 1;
      lines.push(`x_${n}=[${item.pairs.map((pair) => decimal(pair.x)).join(',')}]`);
      lines.push(`y_${n}=[${item.pairs.map((pair) => decimal(pair.y)).join(',')}]`);
      lines.push(`(x_${n},y_${n})`);
    });
    return lines.join('\n');
  }

  function csvValue(value) {
    return Number.isFinite(value) ? decimal(value) : '';
  }

  function csvText() {
    const keys = selectedKeys();
    const points = exportPoints();
    if (!keys.length || !points.length) return '';

    if (keys[0] === 'xy') {
      const rows = points
        .filter((point) => Number.isFinite(point.xm) && Number.isFinite(point.ym))
        .map((point) => `${csvValue(point.xm)};${csvValue(point.ym)}`);
      return ['x_m;y_m', ...rows].join('\n');
    }

    const headers = ['t_s', ...keys.map((key) => {
      const meta = exportMeta[key];
      return `${key}_${meta.unit.replaceAll('/', '_').replaceAll('²', '2').replaceAll('|', '')}`;
    })];
    const rows = points.map((point) => [
      csvValue(point.dt),
      ...keys.map((key) => csvValue(point[exportMeta[key].field]))
    ].join(';'));
    return [headers.join(';'), ...rows].join('\n');
  }

  async function copyText(text) {
    if (!text) throw new Error('empty');
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy');
  }

  function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportFilename() {
    const keys = selectedKeys();
    const suffix = keys[0] === 'xy' ? 'poloha-y-x' : keys.join('-');
    return `tracker-graf-${suffix}.csv`;
  }

  function installExportUi() {
    const stats = $('#graphStats');
    if (!stats || $('#graphDataExport')) return;

    const controls = document.createElement('div');
    controls.id = 'graphDataExport';
    controls.className = 'graph-data-export';
    controls.innerHTML = `
      <button id="copyForDesmosBtn" class="secondary-btn" type="button">📋 Kopírovat pro Desmos</button>
      <button id="exportCurrentGraphBtn" class="secondary-btn" type="button">↓ CSV grafu</button>
      <span id="graphExportHint">Exportuje právě vybraný úsek a zobrazené křivky.</span>
    `;
    stats.insertAdjacentElement('beforebegin', controls);

    if (!$('#graphDataExportStyles')) {
      const style = document.createElement('style');
      style.id = 'graphDataExportStyles';
      style.textContent = `
        .graph-data-export{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0 10px}
        .graph-data-export button{min-height:40px;padding:8px 9px}
        .graph-data-export span{grid-column:1/-1;color:#667085;font-size:.68rem;line-height:1.35;text-align:center}
        @media(max-width:430px){.graph-data-export button{font-size:.72rem;padding:7px 6px}}
      `;
      document.head.append(style);
    }

    $('#copyForDesmosBtn').addEventListener('click', async () => {
      const text = desmosExpressions();
      if (!text) {
        toast('Pro export nejsou dostupná data.');
        return;
      }
      try {
        await copyText(text);
        toast('Data jsou zkopírovaná. Vlož je do prázdného grafu v Desmosu.');
      } catch {
        toast('Data se nepodařilo zkopírovat.');
      }
    });

    $('#exportCurrentGraphBtn').addEventListener('click', () => {
      const text = csvText();
      if (!text) {
        toast('Pro export nejsou dostupná data.');
        return;
      }
      downloadText(exportFilename(), `\uFEFF${text}`, 'text/csv;charset=utf-8');
    });

    const allCsv = $('#exportBtn');
    if (allCsv) {
      allCsv.textContent = 'CSV vše';
      allCsv.title = 'Stáhnout všechna naměřená data';
    }
  }

  function relabelPositionGraph() {
    const input = document.querySelector('#multiGraphChoices input[data-series="xy"]');
    const label = input?.closest('.multi-series-choice');
    if (label) {
      const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Poloha y(x)';
    }

    const help = $('#multiGraphHelp');
    const selected = selectedKeys();
    if (help && selected.length === 1 && selected[0] === 'xy') {
      help.textContent = 'Poloha y(x): vodorovně x, svisle y. Zobrazuje se samostatně.';
    }
  }

  function polishPointInfo() {
    const info = $('#graphPointInfo');
    if (!info) return;
    const selected = selectedKeys();
    const isPosition = selected.length === 1 && selected[0] === 'xy';
    const head = info.querySelector('.graph-point-head strong');
    if (head && isPosition && !head.dataset.positionPrefix) {
      head.dataset.positionPrefix = '1';
      head.textContent = `Poloha • ${head.textContent}`;
    }
  }

  // Public data layer for a future one-click Desmos API integration.
  // It intentionally does not open Desmos or load any external API yet.
  window.TrackerGraphExport = {
    getSeries: buildSeries,
    getDesmosExpressions: desmosExpressions,
    getCsv: csvText
  };

  installExportUi();
  relabelPositionGraph();

  const drawChartBeforeGraphExport = drawChart;
  drawChart = function drawChartWithGraphExport() {
    drawChartBeforeGraphExport();
    relabelPositionGraph();
    polishPointInfo();
  };
})();
