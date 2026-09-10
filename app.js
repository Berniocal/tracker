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
  graph: 'x',
  selected: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  vectors: {
    velocity: true,
    acceleration: false,
    mode: 'current',
    size: 1
  }
};

const pointers = new Map();
let pendingTap = null;
let activeDrag = null;
let pinchSession = null;
let pinchUsed = false;

function fps() {
  return Math.max(1, Number($('#fpsInput').value) || 30);
}

function frameStep() {
  return Math.max(1, Number($('#frameStepSelect').value) || 1);
}

function currentFrame() {
  return Math.round(video.currentTime * fps());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits }).format(value);
}

function toast(message) {
  const template = $('#toastTemplate');
  if (!template) return;
  const node = template.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2200);
}

function installVectorControls() {
  const panel = $('#panelTrack');
  if (!panel || $('#vectorControls')) return;

  const controls = document.createElement('div');
  controls.id = 'vectorControls';
  controls.className = 'vector-controls';
  controls.innerHTML = `
    <div class="vector-controls__head">
      <strong>Vektory přes video</strong>
      <span id="vectorLegend" class="vector-legend">–</span>
    </div>
    <div class="vector-toggle-row">
      <label class="vector-toggle"><input id="showVelocity" type="checkbox" checked><span>v⃗ rychlost</span></label>
      <label class="vector-toggle"><input id="showAcceleration" type="checkbox"><span>a⃗ zrychlení</span></label>
    </div>
    <div class="vector-settings-row">
      <label>Zobrazit
        <select id="vectorMode">
          <option value="current">aktuální bod</option>
          <option value="all">všechny body</option>
        </select>
      </label>
      <label>Velikost šipek
        <input id="vectorSize" type="range" min="0.5" max="2" step="0.1" value="1">
      </label>
    </div>
    <p class="micro-help">Délka šipky je úměrná velikosti veličiny. Grafické měřítko se nastaví automaticky podle naměřených dat.</p>
  `;

  const actions = panel.querySelector('.track-actions');
  if (actions) actions.insertAdjacentElement('beforebegin', controls);
  else panel.append(controls);

  const style = document.createElement('style');
  style.textContent = `
    .vector-controls{margin:12px 0;padding:12px;border:1px solid #e4e7ec;border-radius:14px;background:#f9fafb}
    .vector-controls__head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
    .vector-legend{font-size:.72rem;color:#667085;text-align:right}
    .vector-toggle-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
    .vector-toggle{display:flex;align-items:center;gap:8px;min-height:42px;padding:8px 10px;border:1px solid #d0d5dd;border-radius:10px;background:#fff}
    .vector-toggle input{width:18px;height:18px;min-height:0;margin:0}
    .vector-toggle span{font-weight:800}
    .vector-settings-row{display:grid;grid-template-columns:1fr 1.2fr;gap:10px;align-items:end}
    .vector-settings-row input[type=range]{padding:0}
    @media(max-width:430px){.vector-settings-row{grid-template-columns:1fr}.vector-toggle-row{grid-template-columns:1fr 1fr}}
  `;
  document.head.append(style);

  $('#showVelocity').addEventListener('change', (event) => {
    state.vectors.velocity = event.target.checked;
    updateVectorLegend();
    drawOverlay();
  });
  $('#showAcceleration').addEventListener('change', (event) => {
    state.vectors.acceleration = event.target.checked;
    updateVectorLegend();
    drawOverlay();
  });
  $('#vectorMode').addEventListener('change', (event) => {
    state.vectors.mode = event.target.value;
    drawOverlay();
  });
  $('#vectorSize').addEventListener('input', (event) => {
    state.vectors.size = Number(event.target.value) || 1;
    updateVectorLegend();
    drawOverlay();
  });
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
  state.selected = null;

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
  updateTapHint();
  drawOverlay();
  if (stage === 'graphs') requestAnimationFrame(resizeChart);
}

function updateTapHint() {
  const hint = $('#tapHint');
  if (!hint) return;
  if (state.stage === 'scale') {
    if (state.scalePoints.length === 0) hint.textContent = 'Klepni na 1. bod měřítka';
    else if (state.scalePoints.length === 1) hint.textContent = 'Klepni na 2. bod měřítka';
    else hint.textContent = 'Body měřítka můžeš táhnout';
    hint.classList.remove('hidden');
  } else if (state.stage === 'track') {
    hint.textContent = 'Klepni na sledované těleso';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function resetView() {
  state.view.zoom = 1;
  state.view.panX = 0;
  state.view.panY = 0;
  applyViewTransform();
}

function clampView() {
  const width = viewport.clientWidth || 1;
  const height = viewport.clientHeight || 1;
  const zoom = state.view.zoom;
  if (zoom <= 1.0001) {
    state.view.zoom = 1;
    state.view.panX = 0;
    state.view.panY = 0;
    return;
  }
  state.view.panX = clamp(state.view.panX, width - width * zoom, 0);
  state.view.panY = clamp(state.view.panY, height - height * zoom, 0);
}

function applyViewTransform(redraw = true) {
  clampView();
  const { zoom, panX, panY } = state.view;
  video.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  video.style.transformOrigin = '0 0';
  $('#zoomLabel').textContent = `${formatNumber(zoom, zoom < 2 ? 2 : 1)}×`;
  $('#zoomOutBtn').disabled = zoom <= 1.001;
  if (redraw) drawOverlay();
}

function setZoom(newZoom, anchorX = viewport.clientWidth / 2, anchorY = viewport.clientHeight / 2) {
  const oldZoom = state.view.zoom;
  newZoom = clamp(newZoom, 1, 8);
  if (Math.abs(newZoom - oldZoom) < 0.0001) return;
  const baseX = (anchorX - state.view.panX) / oldZoom;
  const baseY = (anchorY - state.view.panY) / oldZoom;
  state.view.zoom = newZoom;
  state.view.panX = anchorX - baseX * newZoom;
  state.view.panY = anchorY - baseY * newZoom;
  applyViewTransform();
}

function loadVideo(file) {
  if (!file) return;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  state.scalePoints = [];
  state.metersPerPixel = null;
  state.trackPoints = [];
  state.selected = null;
  state.graph = 'x';
  resetView();
  $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.graph === 'x'));
  video.src = state.videoUrl;
  $('#emptyState').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  setStage('video');
  updateTrackingUi();
  toast(`Načteno: ${file.name || 'video'}`);
}

function resetApp() {
  video.pause();
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = null;
  state.scalePoints = [];
  state.metersPerPixel = null;
  state.trackPoints = [];
  state.selected = null;
  state.graph = 'x';
  resetView();
  video.removeAttribute('src');
  video.style.transform = '';
  video.load();
  $('#workspace').classList.add('hidden');
  $('#emptyState').classList.remove('hidden');
  $('#cameraInput').value = '';
  $('#fileInput').value = '';
  updateTrackingUi();
  updateScaleInstruction();
  setStage('video');
}

function fitViewportToVideo() {
  if (!video.videoWidth || !video.videoHeight) return;
  const aspect = video.videoWidth / video.videoHeight;
  const width = viewport.clientWidth || Math.min(window.innerWidth, 920);
  const maxHeight = window.innerHeight * 0.68;
  const desired = width / aspect;
  const minHeight = window.innerWidth <= 430 ? 230 : 220;
  viewport.style.height = `${Math.round(clamp(desired, minHeight, maxHeight))}px`;
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

function canvasCoordinates(clientX, clientY) {
  const rect = overlay.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function clientToVideoPointXY(clientX, clientY) {
  if (!video.videoWidth || !video.videoHeight) return null;
  const screen = canvasCoordinates(clientX, clientY);
  const baseX = (screen.x - state.view.panX) / state.view.zoom;
  const baseY = (screen.y - state.view.panY) / state.view.zoom;
  const rect = renderedVideoRect();
  if (baseX < rect.left || baseX > rect.left + rect.width || baseY < rect.top || baseY > rect.top + rect.height) return null;
  return {
    x: ((baseX - rect.left) / rect.width) * video.videoWidth,
    y: ((baseY - rect.top) / rect.height) * video.videoHeight
  };
}

function videoToCanvasPoint(point) {
  const rect = renderedVideoRect();
  const baseX = rect.left + (point.x / video.videoWidth) * rect.width;
  const baseY = rect.top + (point.y / video.videoHeight) * rect.height;
  return {
    x: baseX * state.view.zoom + state.view.panX,
    y: baseY * state.view.zoom + state.view.panY
  };
}

function resizeOverlay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  overlay.width = Math.max(1, Math.round(width * dpr));
  overlay.height = Math.max(1, Math.round(height * dpr));
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
  if (options.ring) {
    ctx.strokeStyle = options.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function percentile(values, p = 0.9) {
  const finite = values.filter(Number.isFinite).filter((value) => value > 1e-12).sort((a, b) => a - b);
  if (!finite.length) return null;
  const index = clamp(Math.round((finite.length - 1) * p), 0, finite.length - 1);
  return finite[index];
}

function vectorPixelScales(points) {
  const baseLength = Math.min(86, Math.max(48, viewport.clientWidth * 0.16)) * state.vectors.size;
  const vRef = percentile(points.map((p) => p.v));
  const aRef = percentile(points.map((p) => p.a));
  return {
    velocity: vRef ? baseLength / vRef : 0,
    acceleration: aRef ? baseLength / aRef : 0,
    vRef,
    aRef,
    baseLength
  };
}

function drawArrow(origin, dx, dy, options = {}) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const x2 = origin.x + dx;
  const y2 = origin.y + dy;
  const angle = Math.atan2(dy, dx);
  const head = clamp(length * 0.2, 7, 14);
  const color = options.color || '#12b76a';

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = options.lineWidth || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();

  if (options.label) {
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const tx = x2 + 7 * Math.cos(angle);
    const ty = y2 + 7 * Math.sin(angle);
    const metrics = ctx.measureText(options.label);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(tx - 3, ty - 9, metrics.width + 6, 18);
    ctx.fillStyle = color;
    ctx.fillText(options.label, tx, ty);
  }
  ctx.restore();
}

function nearestKinematicIndex(points) {
  if (!points.length) return -1;
  let bestIndex = 0;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const distance = Math.abs(point.t - video.currentTime);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  const tolerance = Math.max(0.55 / fps(), 0.55 * frameStep() / fps());
  return bestDistance <= tolerance ? bestIndex : -1;
}

function drawVectorOverlays() {
  if ((state.stage !== 'track' && state.stage !== 'graphs') || state.trackPoints.length < 2) return;
  if (!state.vectors.velocity && !state.vectors.acceleration) return;

  const points = kinematicsPoints();
  const scales = vectorPixelScales(points);
  const indices = state.vectors.mode === 'all'
    ? points.map((_, index) => index)
    : [nearestKinematicIndex(points)].filter((index) => index >= 0);

  indices.forEach((index) => {
    const point = points[index];
    const origin = videoToCanvasPoint(point);
    const isCurrent = Math.abs(point.t - video.currentTime) <= Math.max(0.55 / fps(), 0.55 * frameStep() / fps());
    const width = state.vectors.mode === 'all' && !isCurrent ? 2.2 : 3.2;

    if (state.vectors.velocity && scales.velocity && Number.isFinite(point.vx) && Number.isFinite(point.vy)) {
      drawArrow(origin, point.vx * scales.velocity, -point.vy * scales.velocity, {
        color: '#12b76a',
        lineWidth: width,
        label: state.vectors.mode === 'current' || isCurrent ? 'v⃗' : ''
      });
    }

    if (state.vectors.acceleration && scales.acceleration && Number.isFinite(point.ax) && Number.isFinite(point.ay)) {
      drawArrow(origin, point.ax * scales.acceleration, -point.ay * scales.acceleration, {
        color: '#d92d20',
        lineWidth: width,
        label: state.vectors.mode === 'current' || isCurrent ? 'a⃗' : ''
      });
    }
  });
}

function updateVectorLegend() {
  const legend = $('#vectorLegend');
  if (!legend) return;
  const points = kinematicsPoints();
  const scales = vectorPixelScales(points);
  const parts = [];
  if (state.vectors.velocity && scales.velocity) parts.push(`v⃗: 1 m/s = ${formatNumber(scales.velocity, 0)} px`);
  if (state.vectors.acceleration && scales.acceleration) parts.push(`a⃗: 1 m/s² = ${formatNumber(scales.acceleration, 0)} px`);
  legend.textContent = parts.length ? parts.join(' • ') : '–';
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
    state.scalePoints.forEach((point, index) => {
      const selected = state.selected?.kind === 'scale' && state.selected.index === index;
      drawMarker(point, { fill: '#f79009', radius: 7.5, ring: selected ? '#fdb022' : null });
    });
  }

  if (state.trackPoints.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(21,94,239,.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    state.trackPoints.forEach((point, index) => {
      const p = videoToCanvasPoint(point);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();

    drawVectorOverlays();

    state.trackPoints.forEach((point, index) => {
      const selected = state.selected?.kind === 'track' && state.selected.index === index;
      const current = Math.abs(point.t - video.currentTime) <= 0.51 / fps();
      drawMarker(point, {
        radius: selected || current ? 7.5 : 4.5,
        ring: selected ? '#84adff' : current ? 'rgba(132,173,255,.8)' : null
      });
    });
  }
}

function updateTimeUi() {
  $('#timeLabel').textContent = `${formatNumber(video.currentTime, 3)} s`;
  $('#frameLabel').textContent = `snímek ${currentFrame()}`;
  $('#playBtn').textContent = video.paused ? '▶' : 'Ⅱ';
  drawOverlay();
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
  updateTrackingUi();
  if (state.stage === 'graphs') drawChart();
}

function updateScaleInstruction() {
  const instruction = $('#scaleInstruction');
  if (!instruction) return;
  if (state.scalePoints.length === 0) instruction.textContent = 'Klepni ve videu na první konec známé vzdálenosti.';
  else if (state.scalePoints.length === 1) instruction.textContent = 'Teď klepni na druhý konec známé vzdálenosti.';
  else instruction.textContent = 'Měřítko je nastavené. Pro doladění chyť oranžový bod a posuň ho.';
  updateTapHint();
}

function clearScale() {
  state.scalePoints = [];
  state.metersPerPixel = null;
  state.selected = null;
  $('#scaleResult').classList.add('hidden');
  $('#scaleNextBtn').disabled = true;
  updateScaleInstruction();
  updateTrackingUi();
  drawOverlay();
}

function measuredPoints() {
  if (!state.metersPerPixel || state.trackPoints.length === 0) return [];
  const sorted = [...state.trackPoints].sort((a, b) => a.t - b.t);
  const origin = sorted[0];
  const t0 = origin.t;
  return sorted.map((point) => ({
    ...point,
    dt: point.t - t0,
    xm: (point.x - origin.x) * state.metersPerPixel,
    ym: (origin.y - point.y) * state.metersPerPixel
  }));
}

function derivativeSeries(points, key, minCount = 2) {
  const n = points.length;
  if (n < minCount) return Array(n).fill(null);
  return points.map((_, index) => {
    let left, right;
    if (index === 0) { left = 0; right = 1; }
    else if (index === n - 1) { left = n - 2; right = n - 1; }
    else { left = index - 1; right = index + 1; }
    const a = points[left];
    const b = points[right];
    const av = a[key];
    const bv = b[key];
    const dt = b.dt - a.dt;
    if (!Number.isFinite(av) || !Number.isFinite(bv) || Math.abs(dt) < 1e-9) return null;
    return (bv - av) / dt;
  });
}

function kinematicsPoints() {
  const points = measuredPoints();
  if (!points.length) return [];
  const vx = derivativeSeries(points, 'xm', 2);
  const vy = derivativeSeries(points, 'ym', 2);
  const withVelocity = points.map((point, index) => ({
    ...point,
    vx: vx[index],
    vy: vy[index],
    v: Number.isFinite(vx[index]) && Number.isFinite(vy[index]) ? Math.hypot(vx[index], vy[index]) : null
  }));
  const ax = derivativeSeries(withVelocity, 'vx', 3);
  const ay = derivativeSeries(withVelocity, 'vy', 3);
  return withVelocity.map((point, index) => ({
    ...point,
    ax: ax[index],
    ay: ay[index],
    a: Number.isFinite(ax[index]) && Number.isFinite(ay[index]) ? Math.hypot(ax[index], ay[index]) : null
  }));
}

function addTrackPoint(point) {
  const frame = currentFrame();
  const existingIndex = state.trackPoints.findIndex((item) => item.frame === frame);
  if (existingIndex >= 0) {
    state.trackPoints[existingIndex] = { ...state.trackPoints[existingIndex], ...point, t: video.currentTime, frame };
    state.selected = { kind: 'track', index: existingIndex };
    toast('Bod v tomto snímku byl upraven.');
  } else {
    state.trackPoints.push({ ...point, t: video.currentTime, frame });
    state.trackPoints.sort((a, b) => a.t - b.t);
    state.selected = { kind: 'track', index: state.trackPoints.findIndex((item) => item.frame === frame) };
  }
  updateTrackingUi();
  drawOverlay();
  seekFrames(frameStep());
}

function updateTrackingUi() {
  const count = state.trackPoints.length;
  $('#pointCount').textContent = `${count} ${count === 1 ? 'bod' : count >= 2 && count <= 4 ? 'body' : 'bodů'}`;
  $('#undoPointBtn').disabled = count === 0;
  $('#clearPointsBtn').disabled = count === 0;
  $('#graphsBtn').disabled = count < 2 || !state.metersPerPixel;
  if (count && state.metersPerPixel) {
    const last = kinematicsPoints().at(-1);
    const speed = Number.isFinite(last?.v) ? `, v = <strong>${formatNumber(last.v)} m/s</strong>` : '';
    $('#latestPoint').innerHTML = `Poslední bod: <strong>t = ${formatNumber(last.dt)} s</strong>, x = ${formatNumber(last.xm)} m, y = ${formatNumber(last.ym)} m${speed}`;
    $('#latestPoint').classList.remove('hidden');
  } else {
    $('#latestPoint').classList.add('hidden');
  }
  updateVectorLegend();
}

function hitTestDraggable(clientX, clientY) {
  const screen = canvasCoordinates(clientX, clientY);
  const hitRadius = 28;
  const candidates = [];
  if (state.stage === 'scale') {
    state.scalePoints.forEach((point, index) => {
      const p = videoToCanvasPoint(point);
      candidates.push({ kind: 'scale', index, distance: Math.hypot(screen.x - p.x, screen.y - p.y) });
    });
  }
  if (state.stage === 'track' || state.stage === 'graphs') {
    state.trackPoints.forEach((point, index) => {
      const p = videoToCanvasPoint(point);
      candidates.push({ kind: 'track', index, distance: Math.hypot(screen.x - p.x, screen.y - p.y) });
    });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.distance <= hitRadius ? candidates[0] : null;
}

function handleTapAt(clientX, clientY) {
  const point = clientToVideoPointXY(clientX, clientY);
  if (!point) return;
  if (state.stage === 'scale') {
    if (state.scalePoints.length >= 2) return;
    state.scalePoints.push(point);
    state.selected = { kind: 'scale', index: state.scalePoints.length - 1 };
    if (state.scalePoints.length === 2) calculateScale();
    updateScaleInstruction();
    drawOverlay();
  } else if (state.stage === 'track') {
    addTrackPoint(point);
  }
}

function beginPinch() {
  const entries = [...pointers.entries()].slice(0, 2);
  if (entries.length < 2) return;
  const [[id1, p1], [id2, p2]] = entries;
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const distance = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  pinchSession = {
    id1, id2,
    startDistance: distance,
    startZoom: state.view.zoom,
    anchorBaseX: (midX - state.view.panX) / state.view.zoom,
    anchorBaseY: (midY - state.view.panY) / state.view.zoom
  };
  activeDrag = null;
  pendingTap = null;
  pinchUsed = true;
  state.selected = null;
}

function updatePinch() {
  if (!pinchSession) return;
  const p1 = pointers.get(pinchSession.id1);
  const p2 = pointers.get(pinchSession.id2);
  if (!p1 || !p2) return;
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const distance = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  const zoom = clamp(pinchSession.startZoom * distance / pinchSession.startDistance, 1, 8);
  state.view.zoom = zoom;
  state.view.panX = midX - pinchSession.anchorBaseX * zoom;
  state.view.panY = midY - pinchSession.anchorBaseY * zoom;
  applyViewTransform();
}

function updateDraggedPoint(clientX, clientY) {
  if (!activeDrag) return;
  const point = clientToVideoPointXY(clientX, clientY);
  if (!point) return;
  const target = activeDrag.target;
  if (target.kind === 'scale' && state.scalePoints[target.index]) {
    state.scalePoints[target.index] = point;
    calculateScale();
    updateScaleInstruction();
  } else if (target.kind === 'track' && state.trackPoints[target.index]) {
    state.trackPoints[target.index] = { ...state.trackPoints[target.index], ...point };
    updateTrackingUi();
    if (state.stage === 'graphs') drawChart();
  }
  drawOverlay();
}

function pointerDown(event) {
  if (!video.videoWidth) return;
  event.preventDefault();
  overlay.setPointerCapture?.(event.pointerId);
  const point = canvasCoordinates(event.clientX, event.clientY);
  pointers.set(event.pointerId, point);
  if (pointers.size >= 2) {
    beginPinch();
    return;
  }
  const target = hitTestDraggable(event.clientX, event.clientY);
  if (target) {
    activeDrag = { pointerId: event.pointerId, target, startX: point.x, startY: point.y, moved: false };
    state.selected = target;
    if (target.kind === 'track') {
      const trackPoint = state.trackPoints[target.index];
      if (trackPoint) video.currentTime = trackPoint.t;
    }
    drawOverlay();
    return;
  }
  pendingTap = { pointerId: event.pointerId, startX: point.x, startY: point.y, clientX: event.clientX, clientY: event.clientY, moved: false };
}

function pointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  event.preventDefault();
  const point = canvasCoordinates(event.clientX, event.clientY);
  pointers.set(event.pointerId, point);
  if (pinchSession || pointers.size >= 2) {
    if (!pinchSession) beginPinch();
    updatePinch();
    return;
  }
  if (activeDrag?.pointerId === event.pointerId) {
    if (Math.hypot(point.x - activeDrag.startX, point.y - activeDrag.startY) > 2) activeDrag.moved = true;
    updateDraggedPoint(event.clientX, event.clientY);
    return;
  }
  if (pendingTap?.pointerId === event.pointerId) {
    if (Math.hypot(point.x - pendingTap.startX, point.y - pendingTap.startY) > 8) pendingTap.moved = true;
    pendingTap.clientX = event.clientX;
    pendingTap.clientY = event.clientY;
  }
}

function finishPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  event.preventDefault();
  const wasPinch = pinchUsed;
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchSession = null;
  if (activeDrag?.pointerId === event.pointerId) {
    activeDrag = null;
    updateTrackingUi();
    if (state.stage === 'graphs') drawChart();
  } else if (!wasPinch && !cancelled && pendingTap?.pointerId === event.pointerId && !pendingTap.moved) {
    handleTapAt(pendingTap.clientX, pendingTap.clientY);
  }
  if (pendingTap?.pointerId === event.pointerId) pendingTap = null;
  if (pointers.size === 0) pinchUsed = false;
}

const graphConfigs = {
  x:  { xKey: 'dt', yKey: 'xm', xLabel: 't [s]', yLabel: 'x [m]', unit: 'm', fit: true },
  y:  { xKey: 'dt', yKey: 'ym', xLabel: 't [s]', yLabel: 'y [m]', unit: 'm', fit: true },
  vx: { xKey: 'dt', yKey: 'vx', xLabel: 't [s]', yLabel: 'vₓ [m/s]', unit: 'm/s' },
  vy: { xKey: 'dt', yKey: 'vy', xLabel: 't [s]', yLabel: 'vᵧ [m/s]', unit: 'm/s' },
  v:  { xKey: 'dt', yKey: 'v', xLabel: 't [s]', yLabel: 'v [m/s]', unit: 'm/s' },
  ax: { xKey: 'dt', yKey: 'ax', xLabel: 't [s]', yLabel: 'aₓ [m/s²]', unit: 'm/s²' },
  ay: { xKey: 'dt', yKey: 'ay', xLabel: 't [s]', yLabel: 'aᵧ [m/s²]', unit: 'm/s²' },
  a:  { xKey: 'dt', yKey: 'a', xLabel: 't [s]', yLabel: 'a [m/s²]', unit: 'm/s²' },
  xy: { xKey: 'xm', yKey: 'ym', xLabel: 'x [m]', yLabel: 'y [m]', unit: 'm' }
};

function resizeChart() {
  const wrap = chart.parentElement;
  if (!wrap || wrap.clientWidth === 0 || wrap.clientHeight === 0) return;
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
    const pad = Math.abs(min || 1) * 0.1;
    min -= pad;
    max += pad;
  }
  const extra = (max - min) * 0.08;
  return [min - extra, max + extra];
}

function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((sum, x) => sum + x * x, 0);
  const sxy = xs.reduce((sum, x, index) => sum + x * ys[index], 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  return { slope, intercept: (sy - slope * sx) / n };
}

function statCard(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function drawEmptyChart(message) {
  const width = chart.parentElement.clientWidth;
  const height = chart.parentElement.clientHeight;
  chartCtx.clearRect(0, 0, width, height);
  chartCtx.fillStyle = '#ffffff';
  chartCtx.fillRect(0, 0, width, height);
  chartCtx.fillStyle = '#667085';
  chartCtx.font = '14px system-ui, sans-serif';
  chartCtx.textAlign = 'center';
  chartCtx.fillText(message, width / 2, height / 2);
  chartCtx.textAlign = 'start';
}

function drawChart() {
  if (state.stage !== 'graphs') return;
  const points = kinematicsPoints();
  const config = graphConfigs[state.graph] || graphConfigs.x;
  const data = points.map((point) => ({ x: point[config.xKey], y: point[config.yKey] })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (data.length < 2) {
    const message = state.graph.startsWith('a') ? 'Pro zrychlení označ alespoň 3 body.' : 'Pro tento graf není dost dat.';
    drawEmptyChart(message);
    $('#graphStats').innerHTML = statCard('Data', message);
    return;
  }

  const width = chart.parentElement.clientWidth;
  const height = chart.parentElement.clientHeight;
  if (!width || !height) return;
  const xs = data.map((point) => point.x);
  const ys = data.map((point) => point.y);
  const [xmin, xmax] = extent(xs);
  const [ymin, ymax] = extent(ys);
  const margin = { l: 56, r: 18, t: 18, b: 46 };
  const plotW = Math.max(1, width - margin.l - margin.r);
  const plotH = Math.max(1, height - margin.t - margin.b);
  const px = (value) => margin.l + ((value - xmin) / (xmax - xmin)) * plotW;
  const py = (value) => margin.t + plotH - ((value - ymin) / (ymax - ymin)) * plotH;

  chartCtx.clearRect(0, 0, width, height);
  chartCtx.fillStyle = '#ffffff';
  chartCtx.fillRect(0, 0, width, height);
  chartCtx.strokeStyle = '#e4e7ec';
  chartCtx.lineWidth = 1;
  chartCtx.fillStyle = '#667085';
  chartCtx.font = '11px system-ui, sans-serif';

  for (let i = 0; i <= 4; i += 1) {
    const gx = margin.l + plotW * i / 4;
    const gy = margin.t + plotH * i / 4;
    chartCtx.beginPath(); chartCtx.moveTo(gx, margin.t); chartCtx.lineTo(gx, margin.t + plotH); chartCtx.stroke();
    chartCtx.beginPath(); chartCtx.moveTo(margin.l, gy); chartCtx.lineTo(margin.l + plotW, gy); chartCtx.stroke();
    chartCtx.fillText(formatNumber(xmin + (xmax - xmin) * i / 4, 2), gx - 12, margin.t + plotH + 18);
    chartCtx.fillText(formatNumber(ymax - (ymax - ymin) * i / 4, 2), 5, gy + 4);
  }

  chartCtx.fillStyle = '#344054';
  chartCtx.font = '12px system-ui, sans-serif';
  chartCtx.textAlign = 'center';
  chartCtx.fillText(config.xLabel, margin.l + plotW / 2, height - 8);
  chartCtx.save();
  chartCtx.translate(13, margin.t + plotH / 2);
  chartCtx.rotate(-Math.PI / 2);
  chartCtx.fillText(config.yLabel, 0, 0);
  chartCtx.restore();
  chartCtx.textAlign = 'start';

  chartCtx.strokeStyle = '#155eef';
  chartCtx.lineWidth = 2.5;
  chartCtx.beginPath();
  data.forEach((point, index) => index === 0 ? chartCtx.moveTo(px(point.x), py(point.y)) : chartCtx.lineTo(px(point.x), py(point.y)));
  chartCtx.stroke();
  data.forEach((point) => {
    chartCtx.fillStyle = '#155eef';
    chartCtx.beginPath();
    chartCtx.arc(px(point.x), py(point.y), 4, 0, Math.PI * 2);
    chartCtx.fill();
    chartCtx.strokeStyle = '#ffffff';
    chartCtx.lineWidth = 1.5;
    chartCtx.stroke();
  });

  let fit = null;
  if (config.fit) {
    fit = linearFit(xs, ys);
    if (fit) {
      chartCtx.save();
      chartCtx.strokeStyle = '#f79009';
      chartCtx.lineWidth = 2;
      chartCtx.setLineDash([7, 5]);
      chartCtx.beginPath();
      chartCtx.moveTo(px(xmin), py(fit.slope * xmin + fit.intercept));
      chartCtx.lineTo(px(xmax), py(fit.slope * xmax + fit.intercept));
      chartCtx.stroke();
      chartCtx.restore();
    }
  }

  const average = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let stats = statCard('Průměr', `${formatNumber(average)} ${config.unit}`);
  stats += statCard('Minimum', `${formatNumber(Math.min(...ys))} ${config.unit}`);
  stats += statCard('Maximum', `${formatNumber(Math.max(...ys))} ${config.unit}`);
  stats += statCard('Počet bodů', `${data.length}`);
  if (fit) {
    const slopeUnit = state.graph === 'x' || state.graph === 'y' ? 'm/s' : '';
    stats += statCard('Směrnice přímky', `${formatNumber(fit.slope)} ${slopeUnit}`.trim());
    stats += statCard('Průsečík', `${formatNumber(fit.intercept)} ${config.unit}`);
  }
  $('#graphStats').innerHTML = stats;
}

function exportCsv() {
  const points = kinematicsPoints();
  if (!points.length) return;
  const csvNumber = (value) => Number.isFinite(value) ? String(value).replace('.', ',') : '';
  const rows = [
    ['t_s', 'x_m', 'y_m', 'vx_m_s', 'vy_m_s', 'v_m_s', 'ax_m_s2', 'ay_m_s2', 'a_m_s2'].join(';'),
    ...points.map((point) => [point.dt, point.xm, point.ym, point.vx, point.vy, point.v, point.ax, point.ay, point.a].map(csvNumber).join(';'))
  ];
  const blob = new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tracker-data.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

installVectorControls();

$('#cameraInput').addEventListener('change', (event) => loadVideo(event.target.files?.[0]));
$('#fileInput').addEventListener('change', (event) => loadVideo(event.target.files?.[0]));
$('#resetBtn').addEventListener('click', resetApp);
$$('.step').forEach((button) => button.addEventListener('click', () => setStage(button.dataset.stage)));
$$('.next-stage').forEach((button) => button.addEventListener('click', () => setStage(button.dataset.next)));
$('#prevFrameBtn').addEventListener('click', () => seekFrames(-1));
$('#nextFrameBtn').addEventListener('click', () => seekFrames(1));
$('#playBtn').addEventListener('click', () => video.paused ? video.play() : video.pause());
$('#zoomInBtn').addEventListener('click', () => setZoom(state.view.zoom * 1.35));
$('#zoomOutBtn').addEventListener('click', () => setZoom(state.view.zoom / 1.35));
$('#zoomLabel').addEventListener('click', resetView);
$('#zoomResetBtn').addEventListener('click', resetView);
$('#scaleDistance').addEventListener('input', calculateScale);
$('#scaleUnit').addEventListener('change', calculateScale);
$('#clearScaleBtn').addEventListener('click', clearScale);
$('#scaleNextBtn').addEventListener('click', () => setStage('track'));

$('#undoPointBtn').addEventListener('click', () => {
  if (!state.trackPoints.length) return;
  const removed = state.trackPoints.pop();
  state.selected = null;
  if (removed) video.currentTime = removed.t;
  updateTrackingUi();
  drawOverlay();
});

$('#clearPointsBtn').addEventListener('click', () => {
  state.trackPoints = [];
  state.selected = null;
  updateTrackingUi();
  drawOverlay();
});

$('#graphsBtn').addEventListener('click', () => setStage('graphs'));
$('#exportBtn').addEventListener('click', exportCsv);
$$('.graph-tab').forEach((button) => {
  button.addEventListener('click', () => {
    state.graph = button.dataset.graph;
    $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    drawChart();
    button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });
});

overlay.addEventListener('pointerdown', pointerDown);
overlay.addEventListener('pointermove', pointerMove);
overlay.addEventListener('pointerup', (event) => finishPointer(event));
overlay.addEventListener('pointercancel', (event) => finishPointer(event, true));
overlay.addEventListener('wheel', (event) => {
  if (!video.videoWidth) return;
  event.preventDefault();
  const point = canvasCoordinates(event.clientX, event.clientY);
  setZoom(state.view.zoom * Math.exp(-event.deltaY * 0.0015), point.x, point.y);
}, { passive: false });

video.addEventListener('loadedmetadata', () => {
  fitViewportToVideo();
  resetView();
  updateTimeUi();
  requestAnimationFrame(resizeOverlay);
});
video.addEventListener('timeupdate', updateTimeUi);
video.addEventListener('seeked', updateTimeUi);
video.addEventListener('play', updateTimeUi);
video.addEventListener('pause', updateTimeUi);
video.addEventListener('ended', updateTimeUi);
$('#fpsInput').addEventListener('input', () => {
  updateTimeUi();
  updateTrackingUi();
  if (state.stage === 'graphs') drawChart();
});

window.addEventListener('resize', () => {
  fitViewportToVideo();
  clampView();
  applyViewTransform(false);
  resizeOverlay();
  resizeChart();
});

if ('ResizeObserver' in window) {
  const viewportObserver = new ResizeObserver(() => {
    clampView();
    applyViewTransform(false);
    resizeOverlay();
  });
  viewportObserver.observe(viewport);
  const chartObserver = new ResizeObserver(() => {
    if (state.stage === 'graphs') resizeChart();
  });
  chartObserver.observe(chart.parentElement);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

updateTrackingUi();
updateScaleInstruction();
applyViewTransform(false);