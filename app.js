const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const video = $('#video');
const viewport = $('#videoViewport');
const overlay = $('#overlay');
const ctx = overlay.getContext('2d');
const chart = $('#chart');
const chartCtx = chart.getContext('2d');

const state = {
  stage: 'video',
  videoUrl: null,
  scalePoints: [],
  metersPerPixel: null,
  trackPoints: [],
  graph: 'x'
};

function fps() {
  return Math.max(1, Number($('#fpsInput').value) || 30);
}

function frameStep() {
  return Math.max(1, Number($('#frameStepSelect').value) || 1);
}

function currentFrame() {
  return Math.round(video.currentTime * fps());
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits }).format(value);
}

function toast(message) {
  const node = $('#toastTemplate').content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2200);
}

function setStage(stage) {
  if (!state.videoUrl && stage !== 'video') return;
  if ((stage === 'track' || stage === 'graphs') && !state.metersPerPixel) {
    toast('Nejdřív nastav měřítko.');
    return;
  }
  if (stage === 'graphs' && state.trackPoints.length < 2) {
    toast('Pro graf označ alespoň dva body.');
    return;
  }

  state.stage = stage;
  ['video', 'scale', 'track', 'graphs'].forEach((name) => {
    $(`#panel${name[0].toUpperCase()}${name.slice(1)}`)?.classList.toggle('hidden', name !== stage);
  });

  const order = ['video', 'scale', 'track', 'graphs'];
  const activeIndex = order.indexOf(stage);
  $$('.step').forEach((button, index) => {
    button.classList.toggle('active', index === activeIndex);
    button.classList.toggle('done', index < activeIndex);
  });

  if (stage === 'scale') updateScaleInstruction();
  if (stage === 'graphs') drawChart();
  updateTapHint();
  drawOverlay();
}

function updateTapHint() {
  const hint = $('#tapHint');
  if (state.stage === 'scale') {
    hint.textContent = state.scalePoints.length === 0 ? 'Klepni na 1. bod měřítka' : 'Klepni na 2. bod měřítka';
    hint.classList.toggle('hidden', state.scalePoints.length >= 2);
  } else if (state.stage === 'track') {
    hint.textContent = 'Klepni na sledované těleso';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function loadVideo(file) {
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  state.scalePoints = [];
  state.metersPerPixel = null;
  state.trackPoints = [];

  video.src = state.videoUrl;
  $('#emptyState').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  setStage('video');
  toast(`Načteno: ${file.name || 'video'}`);
}

function resetApp() {
  video.pause();
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = null;
  state.scalePoints = [];
  state.metersPerPixel = null;
  state.trackPoints = [];
  video.removeAttribute('src');
  video.load();
  $('#workspace').classList.add('hidden');
  $('#emptyState').classList.remove('hidden');
  $('#cameraInput').value = '';
  $('#fileInput').value = '';
  setStage('video');
  updateTrackingUi();
  updateScaleInstruction();
}

function renderedVideoRect() {
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const boxW = viewport.clientWidth;
  const boxH = viewport.clientHeight;
  const videoAspect = vw / vh;
  const boxAspect = boxW / boxH;
  let width, height, left, top;

  if (videoAspect > boxAspect) {
    width = boxW;
    height = boxW / videoAspect;
    left = 0;
    top = (boxH - height) / 2;
  } else {
    height = boxH;
    width = boxH * videoAspect;
    top = 0;
    left = (boxW - width) / 2;
  }
  return { left, top, width, height };
}

function clientToVideoPoint(event) {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvasRect = overlay.getBoundingClientRect();
  const x = event.clientX - canvasRect.left;
  const y = event.clientY - canvasRect.top;
  const rect = renderedVideoRect();
  if (x < rect.left || x > rect.left + rect.width || y < rect.top || y > rect.top + rect.height) return null;

  return {
    x: ((x - rect.left) / rect.width) * video.videoWidth,
    y: ((y - rect.top) / rect.height) * video.videoHeight
  };
}

function videoToCanvasPoint(point) {
  const rect = renderedVideoRect();
  return {
    x: rect.left + (point.x / video.videoWidth) * rect.width,
    y: rect.top + (point.y / video.videoHeight) * rect.height
  };
}

function resizeOverlay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  overlay.width = Math.round(width * dpr);
  overlay.height = Math.round(height * dpr);
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay();
}

function drawMarker(point, options = {}) {
  const p = videoToCanvasPoint(point);
  const radius = options.radius ?? 6;
  ctx.save();
  ctx.lineWidth = options.lineWidth ?? 2.5;
  ctx.strokeStyle = options.stroke ?? '#ffffff';
  ctx.fillStyle = options.fill ?? '#155eef';
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawOverlay() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  ctx.clearRect(0, 0, width, height);
  if (!video.videoWidth) return;

  if (state.scalePoints.length) {
    const a = videoToCanvasPoint(state.scalePoints[0]);
    const b = state.scalePoints[1] ? videoToCanvasPoint(state.scalePoints[1]) : null;
    if (b) {
      ctx.save();
      ctx.strokeStyle = '#fdb022';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
    state.scalePoints.forEach((point) => drawMarker(point, { fill: '#f79009' }));
  }

  if (state.trackPoints.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(21, 94, 239, .85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    state.trackPoints.forEach((point, i) => {
      const p = videoToCanvasPoint(point);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
    state.trackPoints.forEach((point, i) => drawMarker(point, { radius: i === state.trackPoints.length - 1 ? 7 : 4.5 }));
  }
}

function updateTimeUi() {
  $('#timeLabel').textContent = `${formatNumber(video.currentTime, 3)} s`;
  $('#frameLabel').textContent = `snímek ${currentFrame()}`;
  $('#playBtn').textContent = video.paused ? '▶' : 'Ⅱ';
}

function seekFrames(delta) {
  if (!Number.isFinite(video.duration)) return;
  const targetFrame = Math.max(0, currentFrame() + delta);
  video.currentTime = Math.min(video.duration, targetFrame / fps());
}

function scaleMeters() {
  const value = Number($('#scaleDistance').value);
  const multiplier = Number($('#scaleUnit').value);
  return value > 0 ? value * multiplier : null;
}

function calculateScale() {
  if (state.scalePoints.length !== 2) return;
  const [a, b] = state.scalePoints;
  const pixelDistance = Math.hypot(b.x - a.x, b.y - a.y);
  const meters = scaleMeters();
  if (!meters || !pixelDistance) {
    state.metersPerPixel = null;
    $('#scaleNextBtn').disabled = true;
    return;
  }
  state.metersPerPixel = meters / pixelDistance;
  $('#scaleResult').innerHTML = `Označeno <strong>${formatNumber(pixelDistance, 1)} px</strong><br>1 px = <strong>${formatNumber(state.metersPerPixel, 6)} m</strong>`;
  $('#scaleResult').classList.remove('hidden');
  $('#scaleNextBtn').disabled = false;
}

function updateScaleInstruction() {
  const instruction = $('#scaleInstruction');
  if (state.scalePoints.length === 0) instruction.textContent = 'Klepni ve videu na první konec známé vzdálenosti.';
  else if (state.scalePoints.length === 1) instruction.textContent = 'Teď klepni na druhý konec známé vzdálenosti.';
  else instruction.textContent = 'Měřítko je nastavené. Pokud nesedí, označ ho znovu.';
  updateTapHint();
}

function clearScale() {
  state.scalePoints = [];
  state.metersPerPixel = null;
  $('#scaleResult').classList.add('hidden');
  $('#scaleNextBtn').disabled = true;
  updateScaleInstruction();
  drawOverlay();
}

function measuredPoints() {
  if (!state.metersPerPixel || state.trackPoints.length === 0) return [];
  const origin = state.trackPoints[0];
  const t0 = origin.t;
  return state.trackPoints.map((point) => ({
    ...point,
    dt: point.t - t0,
    xm: (point.x - origin.x) * state.metersPerPixel,
    ym: (origin.y - point.y) * state.metersPerPixel
  }));
}

function addTrackPoint(point) {
  state.trackPoints.push({ ...point, t: video.currentTime, frame: currentFrame() });
  updateTrackingUi();
  drawOverlay();
  seekFrames(frameStep());
}

function updateTrackingUi() {
  const count = state.trackPoints.length;
  $('#pointCount').textContent = `${count} ${count === 1 ? 'bod' : count >= 2 && count <= 4 ? 'body' : 'bodů'}`;
  $('#undoPointBtn').disabled = count === 0;
  $('#clearPointsBtn').disabled = count === 0;
  $('#graphsBtn').disabled = count < 2;

  if (count) {
    const last = measuredPoints().at(-1);
    $('#latestPoint').innerHTML = `Poslední bod: <strong>t = ${formatNumber(last.dt)} s</strong>, x = ${formatNumber(last.xm)} m, y = ${formatNumber(last.ym)} m`;
    $('#latestPoint').classList.remove('hidden');
  } else {
    $('#latestPoint').classList.add('hidden');
  }
}

function handleOverlayTap(event) {
  const point = clientToVideoPoint(event);
  if (!point) return;

  if (state.stage === 'scale') {
    if (state.scalePoints.length >= 2) return;
    state.scalePoints.push(point);
    if (state.scalePoints.length === 2) calculateScale();
    updateScaleInstruction();
    drawOverlay();
  } else if (state.stage === 'track') {
    addTrackPoint(point);
  }
}

function resizeChart() {
  const wrap = chart.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  chart.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
  chart.height = Math.max(1, Math.round(wrap.clientHeight * dpr));
  chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawChart();
}

function extent(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min || 1) * .1;
    min -= pad;
    max += pad;
  }
  const extra = (max - min) * .08;
  return [min - extra, max + extra];
}

function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((sum, x) => sum + x * x, 0);
  const sxy = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function drawChart() {
  if (state.stage !== 'graphs') return;
  const points = measuredPoints();
  if (points.length < 2) return;

  const width = chart.parentElement.clientWidth;
  const height = chart.parentElement.clientHeight;
  chartCtx.clearRect(0, 0, width, height);

  const graph = state.graph;
  const xs = graph === 'xy' ? points.map(p => p.xm) : points.map(p => p.dt);
  const ys = graph === 'x' ? points.map(p => p.xm) : points.map(p => p.ym);
  const xLabel = graph === 'xy' ? 'x [m]' : 't [s]';
  const yLabel = graph === 'x' ? 'x [m]' : 'y [m]';
  const [xmin, xmax] = extent(xs);
  const [ymin, ymax] = extent(ys);

  const m = { l: 50, r: 18, t: 18, b: 42 };
  const plotW = width - m.l - m.r;
  const plotH = height - m.t - m.b;
  const px = value => m.l + ((value - xmin) / (xmax - xmin)) * plotW;
  const py = value => m.t + plotH - ((value - ymin) / (ymax - ymin)) * plotH;

  chartCtx.fillStyle = '#ffffff';
  chartCtx.fillRect(0, 0, width, height);
  chartCtx.strokeStyle = '#e4e7ec';
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = '#667085';
  chartCtx.font = '12px system-ui, sans-serif';

  for (let i = 0; i <= 4; i++) {
    const gx = m.l + (plotW * i / 4);
    const gy = m.t + (plotH * i / 4);
    chartCtx.beginPath(); chartCtx.moveTo(gx, m.t); chartCtx.lineTo(gx, m.t + plotH); chartCtx.stroke();
    chartCtx.beginPath(); chartCtx.moveTo(m.l, gy); chartCtx.lineTo(m.l + plotW, gy); chartCtx.stroke();

    const xv = xmin + (xmax - xmin) * i / 4;
    const yv = ymax - (ymax - ymin) * i / 4;
    chartCtx.textAlign = 'center';
    chartCtx.fillText(formatNumber(xv, 2), gx, height - 20);
    chartCtx.textAlign = 'right';
    chartCtx.fillText(formatNumber(yv, 2), m.l - 7, gy + 4);
  }

  chartCtx.fillStyle = '#344054';
  chartCtx.font = '600 12px system-ui, sans-serif';
  chartCtx.textAlign = 'right';
  chartCtx.fillText(xLabel, width - m.r, height - 5);
  chartCtx.save();
  chartCtx.translate(14, m.t);
  chartCtx.rotate(-Math.PI / 2);
  chartCtx.textAlign = 'right';
  chartCtx.fillText(yLabel, 0, 0);
  chartCtx.restore();

  chartCtx.strokeStyle = '#155eef';
  chartCtx.lineWidth = 2.5;
  chartCtx.beginPath();
  xs.forEach((x, i) => {
    const X = px(x); const Y = py(ys[i]);
    if (i === 0) chartCtx.moveTo(X, Y); else chartCtx.lineTo(X, Y);
  });
  chartCtx.stroke();

  chartCtx.fillStyle = '#155eef';
  xs.forEach((x, i) => {
    chartCtx.beginPath();
    chartCtx.arc(px(x), py(ys[i]), 3.5, 0, Math.PI * 2);
    chartCtx.fill();
  });

  const duration = points.at(-1).dt;
  const dx = points.at(-1).xm;
  const dy = points.at(-1).ym;
  let path = 0;
  for (let i = 1; i < points.length; i++) path += Math.hypot(points[i].xm - points[i - 1].xm, points[i].ym - points[i - 1].ym);
  const fit = graph === 'xy' ? null : linearFit(xs, ys);

  $('#graphStats').innerHTML = `
    <div class="stat"><span>Počet bodů</span><strong>${points.length}</strong></div>
    <div class="stat"><span>Doba měření</span><strong>${formatNumber(duration)} s</strong></div>
    <div class="stat"><span>Δx / Δy</span><strong>${formatNumber(dx)} / ${formatNumber(dy)} m</strong></div>
    <div class="stat"><span>Průměrná rychlost po dráze</span><strong>${duration > 0 ? formatNumber(path / duration) : '–'} m/s</strong></div>
    ${fit ? `<div class="stat" style="grid-column:1/-1"><span>Lineární fit zobrazené veličiny</span><strong>${yLabel.split(' ')[0]} = ${formatNumber(fit.slope)}·${xLabel.split(' ')[0]} ${fit.intercept >= 0 ? '+' : '−'} ${formatNumber(Math.abs(fit.intercept))}</strong></div>` : ''}
  `;
}

function exportCsv() {
  const rows = measuredPoints();
  if (!rows.length) return;
  const lines = ['frame;t_s;x_m;y_m'];
  rows.forEach(p => lines.push(`${p.frame};${p.dt.toFixed(6)};${p.xm.toFixed(6)};${p.ym.toFixed(6)}`));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tracker-data.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#cameraInput').addEventListener('change', e => loadVideo(e.target.files[0]));
$('#fileInput').addEventListener('change', e => loadVideo(e.target.files[0]));
$('#resetBtn').addEventListener('click', resetApp);

video.addEventListener('loadedmetadata', () => {
  video.currentTime = 0;
  resizeOverlay();
  updateTimeUi();
});
video.addEventListener('timeupdate', updateTimeUi);
video.addEventListener('seeked', () => { updateTimeUi(); drawOverlay(); });
video.addEventListener('play', updateTimeUi);
video.addEventListener('pause', updateTimeUi);

$('#playBtn').addEventListener('click', () => video.paused ? video.play() : video.pause());
$('#prevFrameBtn').addEventListener('click', () => seekFrames(-1));
$('#nextFrameBtn').addEventListener('click', () => seekFrames(1));

$$('.next-stage').forEach(btn => btn.addEventListener('click', () => setStage(btn.dataset.next)));
$$('.step').forEach(btn => btn.addEventListener('click', () => setStage(btn.dataset.stage)));
$('#scaleNextBtn').addEventListener('click', () => setStage('track'));
$('#graphsBtn').addEventListener('click', () => setStage('graphs'));

$('#clearScaleBtn').addEventListener('click', clearScale);
$('#scaleDistance').addEventListener('input', calculateScale);
$('#scaleUnit').addEventListener('change', calculateScale);

overlay.addEventListener('pointerup', handleOverlayTap);
overlay.addEventListener('contextmenu', event => event.preventDefault());

$('#undoPointBtn').addEventListener('click', () => {
  const removed = state.trackPoints.pop();
  if (removed) video.currentTime = removed.t;
  updateTrackingUi();
  drawOverlay();
});
$('#clearPointsBtn').addEventListener('click', () => {
  state.trackPoints = [];
  updateTrackingUi();
  drawOverlay();
});

$$('.graph-tab').forEach(btn => btn.addEventListener('click', () => {
  state.graph = btn.dataset.graph;
  $$('.graph-tab').forEach(tab => tab.classList.toggle('active', tab === btn));
  drawChart();
}));
$('#exportBtn').addEventListener('click', exportCsv);

window.addEventListener('resize', () => {
  resizeOverlay();
  resizeChart();
});
window.addEventListener('orientationchange', () => setTimeout(() => { resizeOverlay(); resizeChart(); }, 200));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

updateTrackingUi();
updateScaleInstruction();
