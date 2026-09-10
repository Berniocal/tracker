const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const video = $('#video');
const viewport = $('#videoViewport');
const overlay = $('#overlay');
const ctx = overlay.getContext('2d');
const chart = $('#chart');
const chartCtx = chart.getContext('2d');

const analysisCanvas = document.createElement('canvas');
const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });

const state = {
  stage: 'video',
  videoUrl: null,
  scalePoints: [],
  metersPerPixel: null,
  trackPoints: [],
  graph: 'x',
  selected: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  vectors: { velocity: true, acceleration: false, mode: 'current', size: 1 },
  auto: {
    status: 'idle',
    box: null,
    template: null,
    confidence: null,
    threshold: 0.52,
    stopRequested: false,
    lastShiftX: 0,
    lastShiftY: 0,
    startFrame: null
  }
};

const pointers = new Map();
let pendingTap = null;
let activeDrag = null;
let selectionDrag = null;
let pinchSession = null;
let pinchUsed = false;

function fps() { return Math.max(1, Number($('#fpsInput').value) || 30); }
function frameStep() { return Math.max(1, Number($('#frameStepSelect').value) || 1); }
function currentFrame() { return Math.round(video.currentTime * fps()); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return '–';
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits }).format(value);
}
function sleep(ms = 0) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function toast(message) {
  const template = $('#toastTemplate');
  if (!template) return;
  const node = template.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2400);
}

function installExtraControls() {
  const panel = $('#panelTrack');
  if (!panel) return;

  if (!$('#autoTracker')) {
    const auto = document.createElement('div');
    auto.id = 'autoTracker';
    auto.className = 'auto-tracker';
    auto.innerHTML = `
      <div class="tool-head">
        <strong>Automatické sledování</strong>
        <span id="autoStatus" class="tool-status">Připraveno</span>
      </div>
      <p class="micro-help">Označ objekt rámečkem. Aplikace bude hledat stejný obraz v dalších snímcích a sama ukládat jeho střed.</p>
      <div class="auto-buttons">
        <button id="selectAutoObjectBtn" class="secondary-btn" type="button">▣ Označit objekt</button>
        <button id="runAutoBtn" class="primary-btn" type="button" disabled>▶ Sledovat</button>
      </div>
      <div class="auto-settings">
        <label>Minimální shoda
          <input id="autoThreshold" type="range" min="0.30" max="0.80" step="0.02" value="0.52">
        </label>
        <strong id="autoThresholdLabel">52 %</strong>
      </div>
      <div id="autoResult" class="auto-result">Nejdřív označ sledovaný objekt.</div>
    `;
    const actions = panel.querySelector('.track-actions');
    if (actions) actions.insertAdjacentElement('beforebegin', auto);
    else panel.append(auto);
  }

  if (!$('#vectorControls')) {
    const controls = document.createElement('div');
    controls.id = 'vectorControls';
    controls.className = 'vector-controls';
    controls.innerHTML = `
      <div class="tool-head">
        <strong>Vektory přes video</strong>
        <span id="vectorLegend" class="vector-legend">–</span>
      </div>
      <div class="vector-toggle-row">
        <label class="vector-toggle"><input id="showVelocity" type="checkbox" checked><span>v⃗ rychlost</span></label>
        <label class="vector-toggle"><input id="showAcceleration" type="checkbox"><span>a⃗ zrychlení</span></label>
      </div>
      <div class="vector-settings-row">
        <label>Zobrazit
          <select id="vectorMode"><option value="current">aktuální bod</option><option value="all">všechny body</option></select>
        </label>
        <label>Velikost šipek
          <input id="vectorSize" type="range" min="0.5" max="2" step="0.1" value="1">
        </label>
      </div>
    `;
    const auto = $('#autoTracker');
    auto.insertAdjacentElement('afterend', controls);
  }

  if (!$('#trackerDynamicStyles')) {
    const style = document.createElement('style');
    style.id = 'trackerDynamicStyles';
    style.textContent = `
      .auto-tracker,.vector-controls{margin:12px 0;padding:12px;border:1px solid #e4e7ec;border-radius:14px;background:#f9fafb}
      .tool-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
      .tool-status,.vector-legend{font-size:.72rem;color:#667085;text-align:right}
      .tool-status.running{color:#067647;font-weight:800}.tool-status.lost{color:#b42318;font-weight:800}.tool-status.ready{color:#155eef;font-weight:800}
      .auto-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
      .auto-buttons .primary-btn,.auto-buttons .secondary-btn{min-height:44px;padding:9px 10px}
      .auto-settings{display:grid;grid-template-columns:1fr auto;align-items:end;gap:10px;margin-top:8px}
      .auto-settings input[type=range]{padding:0;margin-top:7px}.auto-settings strong{padding-bottom:10px;font-size:.82rem}
      .auto-result{margin-top:8px;padding:9px 10px;border-radius:10px;background:#fff;border:1px solid #e4e7ec;font-size:.78rem;color:#475467;line-height:1.4}
      .vector-toggle-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
      .vector-toggle{display:flex;align-items:center;gap:8px;min-height:42px;padding:8px 10px;border:1px solid #d0d5dd;border-radius:10px;background:#fff}
      .vector-toggle input{width:18px;height:18px;min-height:0;margin:0}.vector-toggle span{font-weight:800}
      .vector-settings-row{display:grid;grid-template-columns:1fr 1.2fr;gap:10px;align-items:end}.vector-settings-row input[type=range]{padding:0}
      @media(max-width:430px){.vector-settings-row{grid-template-columns:1fr}.auto-buttons{grid-template-columns:1fr 1fr}}
    `;
    document.head.append(style);
  }

  $('#showVelocity').addEventListener('change', (event) => { state.vectors.velocity = event.target.checked; updateVectorLegend(); drawOverlay(); });
  $('#showAcceleration').addEventListener('change', (event) => { state.vectors.acceleration = event.target.checked; updateVectorLegend(); drawOverlay(); });
  $('#vectorMode').addEventListener('change', (event) => { state.vectors.mode = event.target.value; drawOverlay(); });
  $('#vectorSize').addEventListener('input', (event) => { state.vectors.size = Number(event.target.value) || 1; updateVectorLegend(); drawOverlay(); });

  $('#selectAutoObjectBtn').addEventListener('click', beginAutoSelection);
  $('#runAutoBtn').addEventListener('click', () => {
    if (state.auto.status === 'running') stopAutoTracking();
    else runAutoTracking();
  });
  $('#autoThreshold').addEventListener('input', (event) => {
    state.auto.threshold = Number(event.target.value);
    $('#autoThresholdLabel').textContent = `${Math.round(state.auto.threshold * 100)} %`;
  });
  updateAutoUi();
}

function resetAutoTracker(clearBox = true) {
  state.auto.status = 'idle';
  state.auto.template = null;
  state.auto.confidence = null;
  state.auto.stopRequested = false;
  state.auto.lastShiftX = 0;
  state.auto.lastShiftY = 0;
  state.auto.startFrame = null;
  if (clearBox) state.auto.box = null;
  selectionDrag = null;
  updateAutoUi();
}

function updateAutoUi() {
  const status = $('#autoStatus');
  const run = $('#runAutoBtn');
  const select = $('#selectAutoObjectBtn');
  const result = $('#autoResult');
  if (!status || !run || !select || !result) return;

  const map = {
    idle: ['Připraveno', ''],
    selecting: ['Označ objekt', 'ready'],
    ready: ['Objekt označen', 'ready'],
    running: ['Sleduji…', 'running'],
    stopped: ['Zastaveno', ''],
    lost: ['Objekt ztracen', 'lost'],
    done: ['Hotovo', 'ready']
  };
  const [text, cls] = map[state.auto.status] || map.idle;
  status.textContent = text;
  status.className = `tool-status ${cls}`.trim();

  if (state.auto.status === 'running') {
    run.disabled = false;
    run.textContent = '■ Zastavit';
    select.disabled = true;
  } else {
    run.disabled = !state.auto.template || !state.auto.box;
    run.textContent = state.auto.status === 'lost' ? '▶ Pokračovat' : '▶ Sledovat';
    select.disabled = false;
    select.textContent = state.auto.status === 'lost' ? '▣ Znovu označit' : '▣ Označit objekt';
  }

  if (state.auto.status === 'selecting') result.textContent = 'Táhni prstem přes objekt a vytvoř kolem něj rámeček.';
  else if (state.auto.status === 'ready') result.textContent = `Objekt je připraven. Sledování začne od snímku ${currentFrame()}.`;
  else if (state.auto.status === 'running') {
    const conf = Number.isFinite(state.auto.confidence) ? ` • shoda ${Math.round(state.auto.confidence * 100)} %` : '';
    result.textContent = `Sleduji snímek ${currentFrame()}${conf}`;
  } else if (state.auto.status === 'lost') {
    const conf = Number.isFinite(state.auto.confidence) ? Math.round(state.auto.confidence * 100) : 0;
    result.textContent = `Shoda klesla na ${conf} %. Označ objekt znovu v tomto snímku a pokračuj.`;
  } else if (state.auto.status === 'done') result.textContent = `Sledování dokončeno. Naměřeno ${state.trackPoints.length} bodů.`;
  else if (state.auto.status === 'stopped') result.textContent = `Sledování zastaveno na snímku ${currentFrame()}. Můžeš pokračovat.`;
  else result.textContent = 'Nejdřív označ sledovaný objekt.';
}

function setStage(stage) {
  if (!state.videoUrl && stage !== 'video') return;
  if ((stage === 'track' || stage === 'graphs') && !state.metersPerPixel) { toast('Nejdřív nastav měřítko.'); return; }
  if (stage === 'graphs' && state.trackPoints.length < 2) { toast('Pro graf označ alespoň dva body.'); return; }
  if (state.auto.status === 'running' && stage !== 'track') stopAutoTracking();

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
    hint.textContent = state.scalePoints.length === 0 ? 'Klepni na 1. bod měřítka' : state.scalePoints.length === 1 ? 'Klepni na 2. bod měřítka' : 'Body měřítka můžeš táhnout';
    hint.classList.remove('hidden');
  } else if (state.stage === 'track') {
    if (state.auto.status === 'selecting') hint.textContent = 'Táhni rámeček kolem objektu';
    else if (state.auto.status === 'running') hint.textContent = 'Automatické sledování běží';
    else if (state.auto.status === 'lost') hint.textContent = 'Objekt ztracen – označ ho znovu';
    else hint.textContent = 'Klepni na těleso nebo použij automatické sledování';
    hint.classList.remove('hidden');
  } else hint.classList.add('hidden');
}

function resetView() { state.view.zoom = 1; state.view.panX = 0; state.view.panY = 0; applyViewTransform(); }
function clampView() {
  const width = viewport.clientWidth || 1;
  const height = viewport.clientHeight || 1;
  const zoom = state.view.zoom;
  if (zoom <= 1.0001) { state.view.zoom = 1; state.view.panX = 0; state.view.panY = 0; return; }
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
  resetAutoTracker();
  resetView();
  $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.graph === 'x'));
  video.src = state.videoUrl;
  video.load();
  $('#emptyState').classList.add('hidden');
  $('#workspace').classList.remove('hidden');
  setStage('video');
  updateTrackingUi();
  toast(`Načteno: ${file.name || 'video'}`);
}

function resetApp() {
  stopAutoTracking();
  video.pause();
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = null;
  state.scalePoints = [];
  state.metersPerPixel = null;
  state.trackPoints = [];
  state.selected = null;
  state.graph = 'x';
  resetAutoTracker();
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
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const boxW = viewport.clientWidth, boxH = viewport.clientHeight;
  const videoAspect = vw / vh, boxAspect = boxW / boxH;
  let width, height, left, top;
  if (videoAspect > boxAspect) { width = boxW; height = boxW / videoAspect; left = 0; top = (boxH - height) / 2; }
  else { height = boxH; width = boxH * videoAspect; top = 0; left = (boxW - width) / 2; }
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
  return { x: ((baseX - rect.left) / rect.width) * video.videoWidth, y: ((baseY - rect.top) / rect.height) * video.videoHeight };
}
function videoToCanvasPoint(point) {
  const rect = renderedVideoRect();
  const baseX = rect.left + (point.x / video.videoWidth) * rect.width;
  const baseY = rect.top + (point.y / video.videoHeight) * rect.height;
  return { x: baseX * state.view.zoom + state.view.panX, y: baseY * state.view.zoom + state.view.panY };
}
function videoBoxToCanvasRect(box) {
  const a = videoToCanvasPoint({ x: box.x, y: box.y });
  const b = videoToCanvasPoint({ x: box.x + box.w, y: box.y + box.h });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}
function resizeOverlay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = viewport.clientWidth, height = viewport.clientHeight;
  overlay.width = Math.max(1, Math.round(width * dpr));
  overlay.height = Math.max(1, Math.round(height * dpr));
  overlay.style.width = `${width}px`; overlay.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawOverlay();
}

function drawMarker(point, options = {}) {
  const p = videoToCanvasPoint(point), radius = options.radius ?? 6;
  ctx.save();
  ctx.lineWidth = options.lineWidth ?? 2.5;
  ctx.strokeStyle = options.stroke ?? '#ffffff'; ctx.fillStyle = options.fill ?? '#155eef';
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (options.ring) { ctx.strokeStyle = options.ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, radius + 5, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function percentile(values, p = 0.9) {
  const finite = values.filter(Number.isFinite).filter((v) => v > 1e-12).sort((a, b) => a - b);
  if (!finite.length) return null;
  return finite[clamp(Math.round((finite.length - 1) * p), 0, finite.length - 1)];
}
function vectorPixelScales(points) {
  const baseLength = Math.min(86, Math.max(48, viewport.clientWidth * 0.16)) * state.vectors.size;
  const vRef = percentile(points.map((p) => p.v)), aRef = percentile(points.map((p) => p.a));
  return { velocity: vRef ? baseLength / vRef : 0, acceleration: aRef ? baseLength / aRef : 0 };
}
function drawArrow(origin, dx, dy, options = {}) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const length = Math.hypot(dx, dy); if (length < 1) return;
  const x2 = origin.x + dx, y2 = origin.y + dy, angle = Math.atan2(dy, dx);
  const head = clamp(length * 0.2, 7, 14), color = options.color || '#12b76a';
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = options.lineWidth || 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6)); ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill();
  if (options.label) { ctx.font = '700 12px system-ui,sans-serif'; ctx.textBaseline = 'middle'; const tx = x2 + 7 * Math.cos(angle), ty = y2 + 7 * Math.sin(angle); const m = ctx.measureText(options.label); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(tx - 3, ty - 9, m.width + 6, 18); ctx.fillStyle = color; ctx.fillText(options.label, tx, ty); }
  ctx.restore();
}
function nearestKinematicIndex(points) {
  if (!points.length) return -1;
  let best = 0, dist = Infinity;
  points.forEach((point, i) => { const d = Math.abs(point.t - video.currentTime); if (d < dist) { dist = d; best = i; } });
  const tolerance = Math.max(0.55 / fps(), 0.55 * frameStep() / fps());
  return dist <= tolerance ? best : -1;
}
function drawVectorOverlays() {
  if ((state.stage !== 'track' && state.stage !== 'graphs') || state.trackPoints.length < 2) return;
  if (!state.vectors.velocity && !state.vectors.acceleration) return;
  const points = kinematicsPoints(), scales = vectorPixelScales(points);
  const indices = state.vectors.mode === 'all' ? points.map((_, i) => i) : [nearestKinematicIndex(points)].filter((i) => i >= 0);
  indices.forEach((i) => {
    const point = points[i], origin = videoToCanvasPoint(point);
    const current = Math.abs(point.t - video.currentTime) <= Math.max(0.55 / fps(), 0.55 * frameStep() / fps());
    const width = state.vectors.mode === 'all' && !current ? 2.2 : 3.2;
    if (state.vectors.velocity && scales.velocity && Number.isFinite(point.vx) && Number.isFinite(point.vy)) drawArrow(origin, point.vx * scales.velocity, -point.vy * scales.velocity, { color: '#12b76a', lineWidth: width, label: state.vectors.mode === 'current' || current ? 'v⃗' : '' });
    if (state.vectors.acceleration && scales.acceleration && Number.isFinite(point.ax) && Number.isFinite(point.ay)) drawArrow(origin, point.ax * scales.acceleration, -point.ay * scales.acceleration, { color: '#d92d20', lineWidth: width, label: state.vectors.mode === 'current' || current ? 'a⃗' : '' });
  });
}
function updateVectorLegend() {
  const legend = $('#vectorLegend'); if (!legend) return;
  const points = kinematicsPoints(), scales = vectorPixelScales(points), parts = [];
  if (state.vectors.velocity && scales.velocity) parts.push(`v⃗: 1 m/s = ${formatNumber(scales.velocity, 0)} px`);
  if (state.vectors.acceleration && scales.acceleration) parts.push(`a⃗: 1 m/s² = ${formatNumber(scales.acceleration, 0)} px`);
  legend.textContent = parts.length ? parts.join(' • ') : '–';
}

function drawAutoTrackerBox() {
  if (!state.auto.box || state.stage !== 'track') return;
  const r = videoBoxToCanvasRect(state.auto.box);
  const lost = state.auto.status === 'lost';
  const selecting = state.auto.status === 'selecting';
  const color = lost ? '#d92d20' : selecting ? '#7f56d9' : '#15b79e';
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.setLineDash(selecting ? [7, 5] : []);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = `${color}22`; ctx.fillRect(r.x, r.y, r.w, r.h);
  if (Number.isFinite(state.auto.confidence) && !selecting) {
    const label = `${Math.round(state.auto.confidence * 100)} %`;
    ctx.font = '700 12px system-ui,sans-serif';
    const m = ctx.measureText(label);
    ctx.fillStyle = color; ctx.fillRect(r.x, Math.max(0, r.y - 22), m.width + 12, 20);
    ctx.fillStyle = '#fff'; ctx.fillText(label, r.x + 6, Math.max(13, r.y - 8));
  }
  ctx.restore();
}

function drawOverlay() {
  const width = viewport.clientWidth, height = viewport.clientHeight;
  ctx.clearRect(0, 0, width, height);
  if (!video.videoWidth) return;

  if (state.scalePoints.length) {
    const a = videoToCanvasPoint(state.scalePoints[0]), b = state.scalePoints[1] ? videoToCanvasPoint(state.scalePoints[1]) : null;
    if (b) { ctx.save(); ctx.strokeStyle = '#fdb022'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }
    state.scalePoints.forEach((point, index) => drawMarker(point, { fill: '#f79009', radius: 7.5, ring: state.selected?.kind === 'scale' && state.selected.index === index ? '#fdb022' : null }));
  }

  if (state.trackPoints.length) {
    ctx.save(); ctx.strokeStyle = 'rgba(21,94,239,.8)'; ctx.lineWidth = 2.5; ctx.beginPath();
    state.trackPoints.forEach((point, index) => { const p = videoToCanvasPoint(point); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke(); ctx.restore();
    drawVectorOverlays();
    state.trackPoints.forEach((point, index) => {
      const selected = state.selected?.kind === 'track' && state.selected.index === index;
      const current = Math.abs(point.t - video.currentTime) <= 0.51 / fps();
      drawMarker(point, { radius: selected || current ? 7.5 : 4.5, fill: point.source === 'auto' ? '#155eef' : '#155eef', ring: selected ? '#84adff' : current ? 'rgba(132,173,255,.8)' : null });
    });
  }
  drawAutoTrackerBox();
}

function updateTimeUi() {
  $('#timeLabel').textContent = `${formatNumber(video.currentTime, 3)} s`;
  $('#frameLabel').textContent = `snímek ${currentFrame()}`;
  $('#playBtn').textContent = video.paused ? '▶' : 'Ⅱ';
  if (state.auto.status === 'running') updateAutoUi();
  drawOverlay();
}
function seekFrames(delta) {
  if (!Number.isFinite(video.duration) || state.auto.status === 'running') return;
  const targetFrame = Math.max(0, currentFrame() + delta);
  video.currentTime = Math.min(video.duration, targetFrame / fps());
}
function scaleMeters() { const value = Number($('#scaleDistance').value), multiplier = Number($('#scaleUnit').value); return value > 0 ? value * multiplier : null; }
function calculateScale() {
  if (state.scalePoints.length !== 2) return;
  const [a, b] = state.scalePoints, pixelDistance = Math.hypot(b.x - a.x, b.y - a.y), meters = scaleMeters();
  if (!meters || !pixelDistance) { state.metersPerPixel = null; $('#scaleNextBtn').disabled = true; return; }
  state.metersPerPixel = meters / pixelDistance;
  $('#scaleResult').innerHTML = `Označeno <strong>${formatNumber(pixelDistance, 1)} px</strong><br>1 px = <strong>${formatNumber(state.metersPerPixel, 6)} m</strong>`;
  $('#scaleResult').classList.remove('hidden'); $('#scaleNextBtn').disabled = false; updateTrackingUi(); if (state.stage === 'graphs') drawChart();
}
function updateScaleInstruction() {
  const instruction = $('#scaleInstruction'); if (!instruction) return;
  instruction.textContent = state.scalePoints.length === 0 ? 'Klepni ve videu na první konec známé vzdálenosti.' : state.scalePoints.length === 1 ? 'Teď klepni na druhý konec známé vzdálenosti.' : 'Měřítko je nastavené. Pro doladění chyť oranžový bod a posuň ho.';
  updateTapHint();
}
function clearScale() {
  state.scalePoints = []; state.metersPerPixel = null; state.selected = null; $('#scaleResult').classList.add('hidden'); $('#scaleNextBtn').disabled = true; updateScaleInstruction(); updateTrackingUi(); drawOverlay();
}

function measuredPoints() {
  if (!state.metersPerPixel || !state.trackPoints.length) return [];
  const sorted = [...state.trackPoints].sort((a, b) => a.t - b.t), origin = sorted[0], t0 = origin.t;
  return sorted.map((point) => ({ ...point, dt: point.t - t0, xm: (point.x - origin.x) * state.metersPerPixel, ym: (origin.y - point.y) * state.metersPerPixel }));
}
function derivativeSeries(points, key, minCount = 2) {
  const n = points.length; if (n < minCount) return Array(n).fill(null);
  return points.map((_, index) => {
    let left, right;
    if (index === 0) { left = 0; right = 1; } else if (index === n - 1) { left = n - 2; right = n - 1; } else { left = index - 1; right = index + 1; }
    const a = points[left], b = points[right], av = a[key], bv = b[key], dt = b.dt - a.dt;
    return !Number.isFinite(av) || !Number.isFinite(bv) || Math.abs(dt) < 1e-9 ? null : (bv - av) / dt;
  });
}
function kinematicsPoints() {
  const points = measuredPoints(); if (!points.length) return [];
  const vx = derivativeSeries(points, 'xm', 2), vy = derivativeSeries(points, 'ym', 2);
  const withVelocity = points.map((point, i) => ({ ...point, vx: vx[i], vy: vy[i], v: Number.isFinite(vx[i]) && Number.isFinite(vy[i]) ? Math.hypot(vx[i], vy[i]) : null }));
  const ax = derivativeSeries(withVelocity, 'vx', 3), ay = derivativeSeries(withVelocity, 'vy', 3);
  return withVelocity.map((point, i) => ({ ...point, ax: ax[i], ay: ay[i], a: Number.isFinite(ax[i]) && Number.isFinite(ay[i]) ? Math.hypot(ax[i], ay[i]) : null }));
}
function setTrackPoint(point, time, frame, source = 'manual', confidence = null) {
  const existingIndex = state.trackPoints.findIndex((item) => item.frame === frame);
  const item = { ...point, t: time, frame, source, confidence };
  if (existingIndex >= 0) state.trackPoints[existingIndex] = { ...state.trackPoints[existingIndex], ...item };
  else state.trackPoints.push(item);
  state.trackPoints.sort((a, b) => a.t - b.t);
  return state.trackPoints.findIndex((p) => p.frame === frame);
}
function addTrackPoint(point) {
  const frame = currentFrame();
  const index = setTrackPoint(point, video.currentTime, frame, 'manual');
  state.selected = { kind: 'track', index };
  updateTrackingUi(); drawOverlay(); seekFrames(frameStep());
}
function updateTrackingUi() {
  const count = state.trackPoints.length;
  $('#pointCount').textContent = `${count} ${count === 1 ? 'bod' : count >= 2 && count <= 4 ? 'body' : 'bodů'}`;
  $('#undoPointBtn').disabled = count === 0 || state.auto.status === 'running';
  $('#clearPointsBtn').disabled = count === 0 || state.auto.status === 'running';
  $('#graphsBtn').disabled = count < 2 || !state.metersPerPixel || state.auto.status === 'running';
  if (count && state.metersPerPixel) {
    const last = kinematicsPoints().at(-1), speed = Number.isFinite(last?.v) ? `, v = <strong>${formatNumber(last.v)} m/s</strong>` : '';
    $('#latestPoint').innerHTML = `Poslední bod: <strong>t = ${formatNumber(last.dt)} s</strong>, x = ${formatNumber(last.xm)} m, y = ${formatNumber(last.ym)} m${speed}`;
    $('#latestPoint').classList.remove('hidden');
  } else $('#latestPoint').classList.add('hidden');
  updateVectorLegend(); updateAutoUi();
}

function normalizeBox(a, b) {
  const x1 = clamp(Math.min(a.x, b.x), 0, video.videoWidth), y1 = clamp(Math.min(a.y, b.y), 0, video.videoHeight);
  const x2 = clamp(Math.max(a.x, b.x), 0, video.videoWidth), y2 = clamp(Math.max(a.y, b.y), 0, video.videoHeight);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function beginAutoSelection() {
  if (state.stage !== 'track' || state.auto.status === 'running') return;
  state.auto.status = 'selecting'; state.auto.template = null; state.auto.confidence = null; state.auto.box = null; state.auto.lastShiftX = 0; state.auto.lastShiftY = 0;
  state.selected = null; updateAutoUi(); updateTapHint(); drawOverlay();
}
async function finalizeAutoSelection() {
  if (!state.auto.box || state.auto.box.w < 10 || state.auto.box.h < 10) {
    state.auto.box = null; state.auto.status = 'idle'; toast('Rámeček je příliš malý.'); updateAutoUi(); updateTapHint(); drawOverlay(); return;
  }
  try {
    state.auto.template = captureTemplate(state.auto.box);
    if (!state.auto.template) throw new Error('template');
    state.auto.status = 'ready'; state.auto.startFrame = currentFrame(); state.auto.confidence = 1;
    const center = { x: state.auto.box.x + state.auto.box.w / 2, y: state.auto.box.y + state.auto.box.h / 2 };
    setTrackPoint(center, video.currentTime, currentFrame(), 'auto', 1);
    updateTrackingUi(); updateTapHint(); drawOverlay();
  } catch {
    state.auto.status = 'idle'; state.auto.template = null; toast('Nepodařilo se načíst obraz objektu.'); updateAutoUi();
  }
}

function prepareAnalysisCanvas() {
  const maxWidth = 480;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  if (analysisCanvas.width !== width || analysisCanvas.height !== height) { analysisCanvas.width = width; analysisCanvas.height = height; }
  return { scale, width, height };
}
function captureFrame() {
  const info = prepareAnalysisCanvas();
  analysisCtx.drawImage(video, 0, 0, info.width, info.height);
  const image = analysisCtx.getImageData(0, 0, info.width, info.height);
  return { ...info, data: image.data };
}
function boxToAnalysis(box, scale, width, height) {
  let x = Math.round(box.x * scale), y = Math.round(box.y * scale), w = Math.max(4, Math.round(box.w * scale)), h = Math.max(4, Math.round(box.h * scale));
  x = clamp(x, 0, Math.max(0, width - 4)); y = clamp(y, 0, Math.max(0, height - 4));
  w = clamp(w, 4, width - x); h = clamp(h, 4, height - y);
  return { x, y, w, h };
}
function extractPatch(frame, box) {
  const b = boxToAnalysis(box, frame.scale, frame.width, frame.height);
  const data = new Uint8ClampedArray(b.w * b.h * 3);
  let out = 0;
  for (let yy = 0; yy < b.h; yy += 1) {
    let src = ((b.y + yy) * frame.width + b.x) * 4;
    for (let xx = 0; xx < b.w; xx += 1) {
      data[out++] = frame.data[src]; data[out++] = frame.data[src + 1]; data[out++] = frame.data[src + 2]; src += 4;
    }
  }
  return { w: b.w, h: b.h, data, scale: frame.scale };
}
function captureTemplate(box) { return extractPatch(captureFrame(), box); }
function scorePatch(frame, template, x, y) {
  const tw = template.w, th = template.h;
  if (x < 0 || y < 0 || x + tw > frame.width || y + th > frame.height) return Infinity;
  const sample = clamp(Math.floor(Math.min(tw, th) / 16), 1, 5);
  let sum = 0, count = 0;
  for (let yy = 0; yy < th; yy += sample) {
    let fi = ((y + yy) * frame.width + x) * 4;
    let ti = (yy * tw) * 3;
    for (let xx = 0; xx < tw; xx += sample) {
      sum += Math.abs(frame.data[fi] - template.data[ti]);
      sum += Math.abs(frame.data[fi + 1] - template.data[ti + 1]);
      sum += Math.abs(frame.data[fi + 2] - template.data[ti + 2]);
      count += 3; fi += sample * 4; ti += sample * 3;
    }
  }
  return count ? sum / count : Infinity;
}
function findBestMatch(frame) {
  const template = state.auto.template;
  if (!template || !state.auto.box) return null;
  const scale = frame.scale, previous = boxToAnalysis(state.auto.box, scale, frame.width, frame.height);
  const predictedX = Math.round(previous.x + state.auto.lastShiftX * scale);
  const predictedY = Math.round(previous.y + state.auto.lastShiftY * scale);
  const motion = Math.hypot(state.auto.lastShiftX, state.auto.lastShiftY) * scale;
  const radiusX = Math.round(clamp(Math.max(20, previous.w * 1.35, motion * 3), 20, frame.width * 0.35));
  const radiusY = Math.round(clamp(Math.max(20, previous.h * 1.35, motion * 3), 20, frame.height * 0.35));
  const minX = clamp(predictedX - radiusX, 0, Math.max(0, frame.width - template.w));
  const maxX = clamp(predictedX + radiusX, 0, Math.max(0, frame.width - template.w));
  const minY = clamp(predictedY - radiusY, 0, Math.max(0, frame.height - template.h));
  const maxY = clamp(predictedY + radiusY, 0, Math.max(0, frame.height - template.h));
  const coarse = clamp(Math.floor(Math.min(template.w, template.h) / 12), 2, 6);
  let best = { x: previous.x, y: previous.y, error: Infinity };
  for (let y = minY; y <= maxY; y += coarse) {
    for (let x = minX; x <= maxX; x += coarse) {
      const error = scorePatch(frame, template, x, y);
      if (error < best.error) best = { x, y, error };
    }
  }
  const fineRadius = coarse * 2;
  for (let y = Math.max(minY, best.y - fineRadius); y <= Math.min(maxY, best.y + fineRadius); y += 1) {
    for (let x = Math.max(minX, best.x - fineRadius); x <= Math.min(maxX, best.x + fineRadius); x += 1) {
      const error = scorePatch(frame, template, x, y);
      if (error < best.error) best = { x, y, error };
    }
  }
  const confidence = clamp(1 - best.error / 72, 0, 1);
  const inv = 1 / scale;
  return { box: { x: best.x * inv, y: best.y * inv, w: template.w * inv, h: template.h * inv }, confidence, error: best.error };
}
function adaptTemplate(frame, matchedBox, amount = 0.12) {
  const fresh = extractPatch(frame, matchedBox), old = state.auto.template;
  if (!old || fresh.w !== old.w || fresh.h !== old.h) return;
  for (let i = 0; i < old.data.length; i += 1) old.data[i] = Math.round(old.data[i] * (1 - amount) + fresh.data[i] * amount);
}
function seekToFrame(frame) {
  const target = clamp(frame / fps(), 0, Math.max(0, video.duration || 0));
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - target) < 0.0005) { requestAnimationFrame(resolve); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; video.removeEventListener('seeked', finish); resolve(); };
    video.addEventListener('seeked', finish, { once: true });
    video.currentTime = target;
    setTimeout(finish, 700);
  });
}
function stopAutoTracking() {
  if (state.auto.status === 'running') state.auto.stopRequested = true;
}
async function runAutoTracking() {
  if (!state.auto.template || !state.auto.box || state.auto.status === 'running') return;
  video.pause(); state.auto.stopRequested = false; state.auto.status = 'running'; updateTrackingUi(); updateTapHint();
  let frame = currentFrame();
  const maxFrame = Math.floor((video.duration || 0) * fps());
  let processed = 0;

  while (frame + frameStep() <= maxFrame && processed < 1000) {
    if (state.auto.stopRequested) { state.auto.status = 'stopped'; break; }
    const nextFrame = frame + frameStep();
    await seekToFrame(nextFrame);
    await sleep(0);
    const captured = captureFrame();
    const previousCenter = { x: state.auto.box.x + state.auto.box.w / 2, y: state.auto.box.y + state.auto.box.h / 2 };
    const match = findBestMatch(captured);
    if (!match) { state.auto.status = 'lost'; break; }

    state.auto.confidence = match.confidence;
    state.auto.box = match.box;
    const center = { x: match.box.x + match.box.w / 2, y: match.box.y + match.box.h / 2 };
    state.auto.lastShiftX = center.x - previousCenter.x;
    state.auto.lastShiftY = center.y - previousCenter.y;
    drawOverlay(); updateAutoUi();

    if (match.confidence < state.auto.threshold) {
      state.auto.status = 'lost';
      break;
    }

    setTrackPoint(center, video.currentTime, nextFrame, 'auto', match.confidence);
    if (match.confidence > state.auto.threshold + 0.12) adaptTemplate(captured, match.box, 0.10);
    frame = nextFrame; processed += 1;
    updateTrackingUi();
    if (processed % 3 === 0) await sleep(0);
  }

  if (state.auto.status === 'running') state.auto.status = frame + frameStep() > maxFrame ? 'done' : 'stopped';
  state.auto.stopRequested = false;
  updateTrackingUi(); updateTapHint(); drawOverlay();
  if (state.auto.status === 'lost') toast('Automatika objekt ztratila. Označ ho znovu a pokračuj.');
  else if (state.auto.status === 'done') toast('Automatické sledování dokončeno.');
}

function hitTestDraggable(clientX, clientY) {
  const screen = canvasCoordinates(clientX, clientY), hitRadius = 28, candidates = [];
  if (state.stage === 'scale') state.scalePoints.forEach((point, index) => { const p = videoToCanvasPoint(point); candidates.push({ kind: 'scale', index, distance: Math.hypot(screen.x - p.x, screen.y - p.y) }); });
  if ((state.stage === 'track' || state.stage === 'graphs') && state.auto.status !== 'running' && state.auto.status !== 'selecting') state.trackPoints.forEach((point, index) => { const p = videoToCanvasPoint(point); candidates.push({ kind: 'track', index, distance: Math.hypot(screen.x - p.x, screen.y - p.y) }); });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.distance <= hitRadius ? candidates[0] : null;
}
function handleTapAt(clientX, clientY) {
  const point = clientToVideoPointXY(clientX, clientY); if (!point) return;
  if (state.stage === 'scale') {
    if (state.scalePoints.length >= 2) return;
    state.scalePoints.push(point); state.selected = { kind: 'scale', index: state.scalePoints.length - 1 };
    if (state.scalePoints.length === 2) calculateScale(); updateScaleInstruction(); drawOverlay();
  } else if (state.stage === 'track' && state.auto.status !== 'running' && state.auto.status !== 'selecting') addTrackPoint(point);
}
function beginPinch() {
  const entries = [...pointers.entries()].slice(0, 2); if (entries.length < 2) return;
  const [[id1, p1], [id2, p2]] = entries, midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2, distance = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  pinchSession = { id1, id2, startDistance: distance, startZoom: state.view.zoom, anchorBaseX: (midX - state.view.panX) / state.view.zoom, anchorBaseY: (midY - state.view.panY) / state.view.zoom };
  activeDrag = null; pendingTap = null; selectionDrag = null; pinchUsed = true; state.selected = null;
}
function updatePinch() {
  if (!pinchSession) return;
  const p1 = pointers.get(pinchSession.id1), p2 = pointers.get(pinchSession.id2); if (!p1 || !p2) return;
  const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2, distance = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
  const zoom = clamp(pinchSession.startZoom * distance / pinchSession.startDistance, 1, 8);
  state.view.zoom = zoom; state.view.panX = midX - pinchSession.anchorBaseX * zoom; state.view.panY = midY - pinchSession.anchorBaseY * zoom; applyViewTransform();
}
function updateDraggedPoint(clientX, clientY) {
  if (!activeDrag) return;
  const point = clientToVideoPointXY(clientX, clientY); if (!point) return;
  const target = activeDrag.target;
  if (target.kind === 'scale' && state.scalePoints[target.index]) { state.scalePoints[target.index] = point; calculateScale(); updateScaleInstruction(); }
  else if (target.kind === 'track' && state.trackPoints[target.index]) { state.trackPoints[target.index] = { ...state.trackPoints[target.index], ...point, source: 'manual' }; updateTrackingUi(); if (state.stage === 'graphs') drawChart(); }
  drawOverlay();
}
function pointerDown(event) {
  if (!video.videoWidth || state.auto.status === 'running') return;
  event.preventDefault(); overlay.setPointerCapture?.(event.pointerId);
  const canvasPoint = canvasCoordinates(event.clientX, event.clientY); pointers.set(event.pointerId, canvasPoint);
  if (pointers.size >= 2) { beginPinch(); return; }

  if (state.stage === 'track' && state.auto.status === 'selecting') {
    const point = clientToVideoPointXY(event.clientX, event.clientY); if (!point) return;
    selectionDrag = { pointerId: event.pointerId, start: point, current: point };
    state.auto.box = { x: point.x, y: point.y, w: 1, h: 1 }; drawOverlay(); return;
  }

  const target = hitTestDraggable(event.clientX, event.clientY);
  if (target) {
    activeDrag = { pointerId: event.pointerId, target, startX: canvasPoint.x, startY: canvasPoint.y };
    state.selected = target;
    if (target.kind === 'track') { const trackPoint = state.trackPoints[target.index]; if (trackPoint) video.currentTime = trackPoint.t; }
    drawOverlay(); return;
  }
  pendingTap = { pointerId: event.pointerId, startX: canvasPoint.x, startY: canvasPoint.y, clientX: event.clientX, clientY: event.clientY, moved: false };
}
function pointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  event.preventDefault(); const point = canvasCoordinates(event.clientX, event.clientY); pointers.set(event.pointerId, point);
  if (pinchSession || pointers.size >= 2) { if (!pinchSession) beginPinch(); updatePinch(); return; }
  if (selectionDrag?.pointerId === event.pointerId) {
    const videoPoint = clientToVideoPointXY(event.clientX, event.clientY); if (videoPoint) { selectionDrag.current = videoPoint; state.auto.box = normalizeBox(selectionDrag.start, videoPoint); drawOverlay(); } return;
  }
  if (activeDrag?.pointerId === event.pointerId) { updateDraggedPoint(event.clientX, event.clientY); return; }
  if (pendingTap?.pointerId === event.pointerId) {
    if (Math.hypot(point.x - pendingTap.startX, point.y - pendingTap.startY) > 8) pendingTap.moved = true;
    pendingTap.clientX = event.clientX; pendingTap.clientY = event.clientY;
  }
}
function finishPointer(event, cancelled = false) {
  if (!pointers.has(event.pointerId)) return;
  event.preventDefault(); const wasPinch = pinchUsed; pointers.delete(event.pointerId); if (pointers.size < 2) pinchSession = null;
  if (selectionDrag?.pointerId === event.pointerId) { selectionDrag = null; if (!cancelled) finalizeAutoSelection(); }
  else if (activeDrag?.pointerId === event.pointerId) { activeDrag = null; updateTrackingUi(); if (state.stage === 'graphs') drawChart(); }
  else if (!wasPinch && !cancelled && pendingTap?.pointerId === event.pointerId && !pendingTap.moved) handleTapAt(pendingTap.clientX, pendingTap.clientY);
  if (pendingTap?.pointerId === event.pointerId) pendingTap = null; if (pointers.size === 0) pinchUsed = false;
}

const graphConfigs = {
  x: { xKey: 'dt', yKey: 'xm', xLabel: 't [s]', yLabel: 'x [m]', unit: 'm', fit: true },
  y: { xKey: 'dt', yKey: 'ym', xLabel: 't [s]', yLabel: 'y [m]', unit: 'm', fit: true },
  vx: { xKey: 'dt', yKey: 'vx', xLabel: 't [s]', yLabel: 'vₓ [m/s]', unit: 'm/s' },
  vy: { xKey: 'dt', yKey: 'vy', xLabel: 't [s]', yLabel: 'vᵧ [m/s]', unit: 'm/s' },
  v: { xKey: 'dt', yKey: 'v', xLabel: 't [s]', yLabel: 'v [m/s]', unit: 'm/s' },
  ax: { xKey: 'dt', yKey: 'ax', xLabel: 't [s]', yLabel: 'aₓ [m/s²]', unit: 'm/s²' },
  ay: { xKey: 'dt', yKey: 'ay', xLabel: 't [s]', yLabel: 'aᵧ [m/s²]', unit: 'm/s²' },
  a: { xKey: 'dt', yKey: 'a', xLabel: 't [s]', yLabel: 'a [m/s²]', unit: 'm/s²' },
  xy: { xKey: 'xm', yKey: 'ym', xLabel: 'x [m]', yLabel: 'y [m]', unit: 'm' }
};
function resizeChart() {
  const wrap = chart.parentElement; if (!wrap || !wrap.clientWidth || !wrap.clientHeight) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); chart.width = Math.max(1, Math.round(wrap.clientWidth * dpr)); chart.height = Math.max(1, Math.round(wrap.clientHeight * dpr)); chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0); drawChart();
}
function extent(values) {
  let min = Math.min(...values), max = Math.max(...values); if (min === max) { const pad = Math.abs(min || 1) * 0.1; min -= pad; max += pad; } const extra = (max - min) * 0.08; return [min - extra, max + extra];
}
function linearFit(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0), sxx = xs.reduce((s, x) => s + x * x, 0), sxy = xs.reduce((s, x, i) => s + x * ys[i], 0), den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null; const slope = (n * sxy - sx * sy) / den; return { slope, intercept: (sy - slope * sx) / n };
}
function statCard(label, value) { return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`; }
function drawEmptyChart(message) {
  const width = chart.parentElement.clientWidth, height = chart.parentElement.clientHeight; chartCtx.clearRect(0, 0, width, height); chartCtx.fillStyle = '#fff'; chartCtx.fillRect(0, 0, width, height); chartCtx.fillStyle = '#667085'; chartCtx.font = '14px system-ui,sans-serif'; chartCtx.textAlign = 'center'; chartCtx.fillText(message, width / 2, height / 2); chartCtx.textAlign = 'start';
}
function drawChart() {
  if (state.stage !== 'graphs') return;
  const points = kinematicsPoints(), config = graphConfigs[state.graph] || graphConfigs.x;
  const data = points.map((p) => ({ x: p[config.xKey], y: p[config.yKey] })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (data.length < 2) { const message = state.graph.startsWith('a') ? 'Pro zrychlení označ alespoň 3 body.' : 'Pro tento graf není dost dat.'; drawEmptyChart(message); $('#graphStats').innerHTML = statCard('Data', message); return; }
  const width = chart.parentElement.clientWidth, height = chart.parentElement.clientHeight; if (!width || !height) return;
  const xs = data.map((p) => p.x), ys = data.map((p) => p.y), [xmin, xmax] = extent(xs), [ymin, ymax] = extent(ys);
  const m = { l: 56, r: 18, t: 18, b: 46 }, plotW = Math.max(1, width - m.l - m.r), plotH = Math.max(1, height - m.t - m.b);
  const px = (v) => m.l + ((v - xmin) / (xmax - xmin)) * plotW, py = (v) => m.t + plotH - ((v - ymin) / (ymax - ymin)) * plotH;
  chartCtx.clearRect(0, 0, width, height); chartCtx.fillStyle = '#fff'; chartCtx.fillRect(0, 0, width, height); chartCtx.strokeStyle = '#e4e7ec'; chartCtx.lineWidth = 1; chartCtx.fillStyle = '#667085'; chartCtx.font = '11px system-ui,sans-serif';
  for (let i = 0; i <= 4; i += 1) {
    const gx = m.l + plotW * i / 4, gy = m.t + plotH * i / 4; chartCtx.beginPath(); chartCtx.moveTo(gx, m.t); chartCtx.lineTo(gx, m.t + plotH); chartCtx.stroke(); chartCtx.beginPath(); chartCtx.moveTo(m.l, gy); chartCtx.lineTo(m.l + plotW, gy); chartCtx.stroke(); chartCtx.fillText(formatNumber(xmin + (xmax - xmin) * i / 4, 2), gx - 12, m.t + plotH + 18); chartCtx.fillText(formatNumber(ymax - (ymax - ymin) * i / 4, 2), 5, gy + 4);
  }
  chartCtx.fillStyle = '#344054'; chartCtx.font = '12px system-ui,sans-serif'; chartCtx.textAlign = 'center'; chartCtx.fillText(config.xLabel, m.l + plotW / 2, height - 8); chartCtx.save(); chartCtx.translate(13, m.t + plotH / 2); chartCtx.rotate(-Math.PI / 2); chartCtx.fillText(config.yLabel, 0, 0); chartCtx.restore(); chartCtx.textAlign = 'start';
  chartCtx.strokeStyle = '#155eef'; chartCtx.lineWidth = 2.5; chartCtx.beginPath(); data.forEach((p, i) => i === 0 ? chartCtx.moveTo(px(p.x), py(p.y)) : chartCtx.lineTo(px(p.x), py(p.y))); chartCtx.stroke();
  data.forEach((p) => { chartCtx.fillStyle = '#155eef'; chartCtx.beginPath(); chartCtx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2); chartCtx.fill(); chartCtx.strokeStyle = '#fff'; chartCtx.lineWidth = 1.5; chartCtx.stroke(); });
  let fit = null;
  if (config.fit) { fit = linearFit(xs, ys); if (fit) { chartCtx.save(); chartCtx.strokeStyle = '#f79009'; chartCtx.lineWidth = 2; chartCtx.setLineDash([7, 5]); chartCtx.beginPath(); chartCtx.moveTo(px(xmin), py(fit.slope * xmin + fit.intercept)); chartCtx.lineTo(px(xmax), py(fit.slope * xmax + fit.intercept)); chartCtx.stroke(); chartCtx.restore(); } }
  const average = ys.reduce((s, v) => s + v, 0) / ys.length;
  let stats = statCard('Průměr', `${formatNumber(average)} ${config.unit}`) + statCard('Minimum', `${formatNumber(Math.min(...ys))} ${config.unit}`) + statCard('Maximum', `${formatNumber(Math.max(...ys))} ${config.unit}`) + statCard('Počet bodů', `${data.length}`);
  if (fit) { const slopeUnit = state.graph === 'x' || state.graph === 'y' ? 'm/s' : ''; stats += statCard('Směrnice přímky', `${formatNumber(fit.slope)} ${slopeUnit}`.trim()) + statCard('Průsečík', `${formatNumber(fit.intercept)} ${config.unit}`); }
  $('#graphStats').innerHTML = stats;
}
function exportCsv() {
  const points = kinematicsPoints(); if (!points.length) return;
  const csvNumber = (v) => Number.isFinite(v) ? String(v).replace('.', ',') : '';
  const rows = [['t_s','x_m','y_m','vx_m_s','vy_m_s','v_m_s','ax_m_s2','ay_m_s2','a_m_s2','source','confidence'].join(';'), ...points.map((p) => [p.dt,p.xm,p.ym,p.vx,p.vy,p.v,p.ax,p.ay,p.a,p.source || '',Number.isFinite(p.confidence) ? p.confidence : ''].map(csvNumber).join(';'))];
  const blob = new Blob([`\ufeff${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'tracker-data.csv'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

installExtraControls();

$('#cameraInput').addEventListener('change', (event) => loadVideo(event.target.files?.[0]));
$('#fileInput').addEventListener('change', (event) => loadVideo(event.target.files?.[0]));
$('#resetBtn').addEventListener('click', resetApp);
$$('.step').forEach((button) => button.addEventListener('click', () => setStage(button.dataset.stage)));
$$('.next-stage').forEach((button) => button.addEventListener('click', () => setStage(button.dataset.next)));
$('#prevFrameBtn').addEventListener('click', () => seekFrames(-1));
$('#nextFrameBtn').addEventListener('click', () => seekFrames(1));
$('#playBtn').addEventListener('click', () => state.auto.status !== 'running' && (video.paused ? video.play() : video.pause()));
$('#zoomInBtn').addEventListener('click', () => setZoom(state.view.zoom * 1.35));
$('#zoomOutBtn').addEventListener('click', () => setZoom(state.view.zoom / 1.35));
$('#zoomLabel').addEventListener('click', resetView);
$('#zoomResetBtn').addEventListener('click', resetView);
$('#scaleDistance').addEventListener('input', calculateScale);
$('#scaleUnit').addEventListener('change', calculateScale);
$('#clearScaleBtn').addEventListener('click', clearScale);
$('#scaleNextBtn').addEventListener('click', () => setStage('track'));
$('#undoPointBtn').addEventListener('click', () => { if (!state.trackPoints.length || state.auto.status === 'running') return; const removed = state.trackPoints.pop(); state.selected = null; if (removed) video.currentTime = removed.t; updateTrackingUi(); drawOverlay(); });
$('#clearPointsBtn').addEventListener('click', () => { if (state.auto.status === 'running') return; state.trackPoints = []; state.selected = null; resetAutoTracker(false); updateTrackingUi(); drawOverlay(); });
$('#graphsBtn').addEventListener('click', () => setStage('graphs'));
$('#exportBtn').addEventListener('click', exportCsv);
$$('.graph-tab').forEach((button) => button.addEventListener('click', () => { state.graph = button.dataset.graph; $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab === button)); drawChart(); button.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }));

overlay.addEventListener('pointerdown', pointerDown);
overlay.addEventListener('pointermove', pointerMove);
overlay.addEventListener('pointerup', (event) => finishPointer(event));
overlay.addEventListener('pointercancel', (event) => finishPointer(event, true));
overlay.addEventListener('wheel', (event) => { if (!video.videoWidth) return; event.preventDefault(); const point = canvasCoordinates(event.clientX, event.clientY); setZoom(state.view.zoom * Math.exp(-event.deltaY * 0.0015), point.x, point.y); }, { passive: false });

video.addEventListener('loadedmetadata', () => { fitViewportToVideo(); resetView(); updateTimeUi(); requestAnimationFrame(resizeOverlay); });
video.addEventListener('loadeddata', () => { updateTimeUi(); drawOverlay(); });
video.addEventListener('timeupdate', updateTimeUi);
video.addEventListener('seeked', updateTimeUi);
video.addEventListener('play', updateTimeUi);
video.addEventListener('pause', updateTimeUi);
video.addEventListener('ended', updateTimeUi);
video.addEventListener('error', () => toast('Video se nepodařilo načíst. Zkus jiný formát.'));
$('#fpsInput').addEventListener('input', () => { updateTimeUi(); updateTrackingUi(); if (state.stage === 'graphs') drawChart(); });
window.addEventListener('resize', () => { fitViewportToVideo(); clampView(); applyViewTransform(false); resizeOverlay(); resizeChart(); });
if ('ResizeObserver' in window) {
  const viewportObserver = new ResizeObserver(() => { clampView(); applyViewTransform(false); resizeOverlay(); }); viewportObserver.observe(viewport);
  const chartObserver = new ResizeObserver(() => { if (state.stage === 'graphs') resizeChart(); }); chartObserver.observe(chart.parentElement);
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

updateTrackingUi();
updateScaleInstruction();
applyViewTransform(false);
