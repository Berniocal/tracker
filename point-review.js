(() => {
  state.review = { frame: null };

  function signedNumber(value, digits = 3) {
    if (!Number.isFinite(value)) return '–';
    const formatted = formatNumber(Math.abs(value), digits);
    if (value > 1e-10) return `+${formatted}`;
    if (value < -1e-10) return `−${formatted}`;
    return '0';
  }

  function sourceLabel(source) {
    if (source === 'auto') return 'automatický';
    if (source === 'corrected') return 'ručně opravený';
    return 'ruční';
  }

  function reviewEntries() {
    let entries = state.trackPoints.map((point, originalIndex) => ({ point, originalIndex }));
    if (state.segment?.enabled) {
      const start = state.segment.start ?? 0;
      const end = Number.isFinite(state.segment.end) ? state.segment.end : (video.duration || Infinity);
      const tolerance = 0.51 / fps();
      entries = entries.filter(({ point }) => point.t >= start - tolerance && point.t <= end + tolerance);
    }
    return entries.sort((a, b) => a.point.t - b.point.t);
  }

  function currentReviewPosition(entries = reviewEntries()) {
    if (!entries.length) return -1;
    if (Number.isFinite(state.review.frame)) {
      const saved = entries.findIndex(({ point }) => point.frame === state.review.frame);
      if (saved >= 0) return saved;
    }
    if (state.selected?.kind === 'track') {
      const selectedPoint = state.trackPoints[state.selected.index];
      if (selectedPoint) {
        const selected = entries.findIndex(({ point }) => point.frame === selectedPoint.frame);
        if (selected >= 0) return selected;
      }
    }
    let best = 0;
    let distance = Infinity;
    entries.forEach(({ point }, index) => {
      const d = Math.abs(point.t - video.currentTime);
      if (d < distance) {
        distance = d;
        best = index;
      }
    });
    return best;
  }

  function kinematicPointForFrame(frame) {
    return kinematicsPoints().find((point) => point.frame === frame) || null;
  }

  function selectReviewPoint(position) {
    if (state.auto.status === 'running') return;
    const entries = reviewEntries();
    if (!entries.length) return;
    const index = clamp(position, 0, entries.length - 1);
    const entry = entries[index];
    state.review.frame = entry.point.frame;
    state.selected = { kind: 'track', index: entry.originalIndex };
    video.pause();
    video.currentTime = entry.point.t;
    updateReviewUi();
    drawOverlay();
  }

  function moveReview(delta) {
    const entries = reviewEntries();
    if (!entries.length) return;
    const current = currentReviewPosition(entries);
    selectReviewPoint(clamp((current < 0 ? 0 : current) + delta, 0, entries.length - 1));
  }

  function installReviewUi() {
    const panel = $('#panelTrack');
    if (!panel || $('#pointReview')) return;

    const block = document.createElement('div');
    block.id = 'pointReview';
    block.className = 'point-review';
    block.innerHTML = `
      <div class="tool-head">
        <strong>Kontrola bod po bodu</strong>
        <span id="reviewPointStatus" class="tool-status">0 / 0</span>
      </div>
      <p class="micro-help">Projdi i body vytvořené automatikou. Na vybraném snímku můžeš modrý bod prstem chytit a přesunout.</p>
      <div class="review-navigation">
        <button id="prevMeasuredPointBtn" class="secondary-btn" type="button">← Předchozí</button>
        <button id="nextMeasuredPointBtn" class="secondary-btn" type="button">Další →</button>
      </div>
      <div id="reviewPointDetail" class="review-detail">Zatím nejsou žádné body.</div>
    `;

    const latest = $('#latestPoint');
    if (latest) latest.insertAdjacentElement('afterend', block);
    else panel.append(block);

    if (!$('#pointReviewStyles')) {
      const style = document.createElement('style');
      style.id = 'pointReviewStyles';
      style.textContent = `
        .point-review{margin:12px 0;padding:12px;border:1px solid #e4e7ec;border-radius:14px;background:#f9fafb}
        .review-navigation{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
        .review-navigation .secondary-btn{min-height:44px;padding:9px 10px}
        .review-detail{padding:10px 11px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;font-size:.79rem;line-height:1.55;color:#344054}
        .review-detail strong{color:#101828}.review-detail .signed-negative{color:#b42318;font-weight:850}.review-detail .signed-positive{color:#067647;font-weight:850}
        .signed-motion-stat strong.negative{color:#b42318}.signed-motion-stat strong.positive{color:#067647}
      `;
      document.head.append(style);
    }

    $('#prevMeasuredPointBtn').addEventListener('click', () => moveReview(-1));
    $('#nextMeasuredPointBtn').addEventListener('click', () => moveReview(1));
  }

  function velocityHtml(label, value) {
    if (!Number.isFinite(value)) return `${label} = <strong>–</strong>`;
    const cls = value < -1e-10 ? 'signed-negative' : value > 1e-10 ? 'signed-positive' : '';
    return `${label} = <strong class="${cls}">${signedNumber(value)} m/s</strong>`;
  }

  function updateReviewUi() {
    const status = $('#reviewPointStatus');
    const detail = $('#reviewPointDetail');
    const prev = $('#prevMeasuredPointBtn');
    const next = $('#nextMeasuredPointBtn');
    if (!status || !detail || !prev || !next) return;

    const entries = reviewEntries();
    if (!entries.length) {
      status.textContent = '0 / 0';
      detail.textContent = 'Zatím nejsou žádné body.';
      prev.disabled = true;
      next.disabled = true;
      state.review.frame = null;
      return;
    }

    let position = currentReviewPosition(entries);
    if (position < 0) position = 0;
    const entry = entries[position];
    const point = entry.point;
    const kp = kinematicPointForFrame(point.frame);
    state.review.frame = point.frame;

    status.textContent = `${position + 1} / ${entries.length}`;
    prev.disabled = position <= 0 || state.auto.status === 'running';
    next.disabled = position >= entries.length - 1 || state.auto.status === 'running';

    const confidence = Number.isFinite(point.confidence) ? ` • shoda ${Math.round(point.confidence * 100)} %` : '';
    const coords = kp ? `x = <strong>${formatNumber(kp.xm, 3)} m</strong> • y = <strong>${formatNumber(kp.ym, 3)} m</strong>` : 'Souřadnice budou dostupné po nastavení měřítka.';
    const velocities = kp ? `${velocityHtml('vₓ', kp.vx)} • ${velocityHtml('vᵧ', kp.vy)} • |v| = <strong>${Number.isFinite(kp.v) ? `${formatNumber(kp.v, 3)} m/s` : '–'}</strong>` : '';

    detail.innerHTML = `
      <strong>Bod ${position + 1}</strong> • snímek ${point.frame} • ${formatNumber(point.t, 3)} s<br>
      ${sourceLabel(point.source)}${confidence}<br>
      ${coords}${velocities ? `<br>${velocities}` : ''}
    `;
  }

  function appendSignedAverageVelocity() {
    const stats = $('#motionStats');
    if (!stats) return;

    stats.querySelectorAll('.signed-motion-stat').forEach((node) => node.remove());
    stats.querySelectorAll('.motion-stat span').forEach((label) => {
      if (label.textContent.trim() === 'Průměrná rychlost') label.textContent = 'Průměrná rychlost (dráha/čas)';
    });

    const detection = state.segment?.detection;
    if (!detection?.detected || !Number.isFinite(detection.startTime)) return;
    const tolerance = 0.51 / fps();
    const points = kinematicsPoints().filter((point) => point.t >= detection.startTime - tolerance).sort((a, b) => a.t - b.t);
    if (points.length < 2) return;

    const first = points[0];
    const last = points[points.length - 1];
    const dt = last.t - first.t;
    if (!(dt > 1e-9)) return;

    const avgVx = (last.xm - first.xm) / dt;
    const avgVy = (last.ym - first.ym) / dt;

    const make = (label, value) => {
      const node = document.createElement('div');
      node.className = 'motion-stat signed-motion-stat';
      const cls = value < -1e-10 ? 'negative' : value > 1e-10 ? 'positive' : '';
      node.innerHTML = `<span>${label}</span><strong class="${cls}">${signedNumber(value)} m/s</strong>`;
      return node;
    };

    stats.append(make('Průměrná vₓ', avgVx), make('Průměrná vᵧ', avgVy));
  }

  function drawSelectedPointStatus() {
    if (state.stage !== 'track' || state.selected?.kind !== 'track') return;
    const point = state.trackPoints[state.selected.index];
    if (!point) return;
    const p = videoToCanvasPoint(point);
    const corrected = point.source === 'corrected';
    const auto = point.source === 'auto';
    const color = corrected ? '#f79009' : auto ? '#15b79e' : '#155eef';
    const label = corrected ? 'opravený' : auto ? 'auto' : 'ruční';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '800 11px system-ui,sans-serif';
    const m = ctx.measureText(label);
    const x = clamp(p.x + 14, 2, Math.max(2, viewport.clientWidth - m.width - 12));
    const y = clamp(p.y - 25, 18, Math.max(18, viewport.clientHeight - 4));
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 15, m.width + 10, 19);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 5, y - 2);
    ctx.restore();
  }

  if (typeof graphConfigs !== 'undefined') {
    if (graphConfigs.v) graphConfigs.v.yLabel = '|v| [m/s]';
    if (graphConfigs.a) graphConfigs.a.yLabel = '|a| [m/s²]';
  }
  const speedTab = document.querySelector('.graph-tab[data-graph="v"]');
  if (speedTab) speedTab.textContent = '|v|(t)';
  const accelTab = document.querySelector('.graph-tab[data-graph="a"]');
  if (accelTab) accelTab.textContent = '|a|(t)';
  const graphHelp = document.querySelector('.graph-help');
  if (graphHelp) graphHelp.innerHTML = 'Velikost rychlosti <strong>|v| = √(vₓ² + vᵧ²)</strong> je vždy nezáporná. Složky <strong>vₓ</strong> a <strong>vᵧ</strong> mohou být kladné i záporné podle směru pohybu.';

  installReviewUi();

  const updateTrackingUiBeforeReview = updateTrackingUi;
  updateTrackingUi = function updateTrackingUiWithReview() {
    updateTrackingUiBeforeReview();
    updateReviewUi();
    appendSignedAverageVelocity();
  };

  const updateDraggedPointBeforeReview = updateDraggedPoint;
  updateDraggedPoint = function updateDraggedPointWithCorrection(clientX, clientY) {
    const target = activeDrag?.target;
    const previousSource = target?.kind === 'track' ? state.trackPoints[target.index]?.source : null;
    const result = updateDraggedPointBeforeReview(clientX, clientY);
    if (target?.kind === 'track' && state.trackPoints[target.index]) {
      if (previousSource === 'auto' || previousSource === 'corrected') state.trackPoints[target.index].source = 'corrected';
      state.review.frame = state.trackPoints[target.index].frame;
      updateReviewUi();
      appendSignedAverageVelocity();
    }
    return result;
  };

  const drawOverlayBeforeReview = drawOverlay;
  drawOverlay = function drawOverlayWithReviewStatus() {
    drawOverlayBeforeReview();
    drawSelectedPointStatus();
  };

  video.addEventListener('seeked', () => {
    if (state.selected?.kind === 'track') {
      const point = state.trackPoints[state.selected.index];
      if (point) state.review.frame = point.frame;
    }
    updateReviewUi();
  });
  $('#fpsInput')?.addEventListener('input', () => { updateReviewUi(); appendSignedAverageVelocity(); });
  $('#frameStepSelect')?.addEventListener('change', () => { updateReviewUi(); appendSignedAverageVelocity(); });
  $('#segmentEnabled')?.addEventListener('change', () => { state.review.frame = null; updateReviewUi(); appendSignedAverageVelocity(); });

  const resetReview = () => {
    state.review.frame = null;
    updateReviewUi();
  };
  $('#cameraInput')?.addEventListener('change', resetReview);
  $('#fileInput')?.addEventListener('change', resetReview);
  $('#resetBtn')?.addEventListener('click', resetReview);

  updateReviewUi();
  appendSignedAverageVelocity();
})();
