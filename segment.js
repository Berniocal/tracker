(() => {
  state.segment = {
    enabled: false,
    start: 0,
    end: null,
    detection: null
  };

  let scrubbing = false;

  function formatTime(value) {
    return `${formatNumber(Math.max(0, value || 0), 3)} s`;
  }

  function snapTime(value) {
    const step = 1 / fps();
    return Math.max(0, Math.round(value / step) * step);
  }

  function durationValue() {
    return Number.isFinite(video.duration) ? video.duration : 0;
  }

  function segmentEnd() {
    const duration = durationValue();
    return Number.isFinite(state.segment.end) ? Math.min(state.segment.end, duration || state.segment.end) : duration;
  }

  function isInSegment(time, tolerance = 0.51 / fps()) {
    if (!state.segment.enabled) return true;
    return time >= state.segment.start - tolerance && time <= segmentEnd() + tolerance;
  }

  function installSegmentUi() {
    const panelVideo = $('#panelVideo');
    if (!panelVideo || $('#segmentControls')) return;

    const controls = document.createElement('div');
    controls.id = 'segmentControls';
    controls.className = 'segment-controls';
    controls.innerHTML = `
      <div class="tool-head">
        <strong>Měřený úsek videa</strong>
        <label class="segment-switch"><input id="segmentEnabled" type="checkbox"><span>Jen vybraný úsek</span></label>
      </div>
      <p class="micro-help">Posuň video na požadovaný snímek a nastav začátek nebo konec. Automatické sledování se na konci úseku zastaví.</p>
      <div class="segment-buttons">
        <button id="setSegmentStartBtn" class="secondary-btn" type="button">Začátek: 0,000 s</button>
        <button id="setSegmentEndBtn" class="secondary-btn" type="button">Konec: –</button>
      </div>
      <div class="segment-row">
        <button id="goSegmentStartBtn" class="secondary-btn small" type="button">▶ Na začátek</button>
        <button id="goSegmentEndBtn" class="secondary-btn small" type="button">▶ Na konec</button>
        <button id="wholeVideoBtn" class="secondary-btn small" type="button">Celé video</button>
      </div>
      <div id="segmentInfo" class="auto-result">Měří se celé video.</div>
    `;

    const nextButton = panelVideo.querySelector('.next-stage');
    if (nextButton) nextButton.insertAdjacentElement('beforebegin', controls);
    else panelVideo.append(controls);

    const timeReadout = $('.time-readout');
    if (timeReadout && !$('#videoScrubber')) {
      const wrap = document.createElement('div');
      wrap.className = 'video-scrubber-wrap';
      wrap.innerHTML = `<input id="videoScrubber" class="video-scrubber" type="range" min="0" max="1" step="0.001" value="0" aria-label="Pozice ve videu">`;
      timeReadout.insertAdjacentElement('beforebegin', wrap);
    }

    const panelTrack = $('#panelTrack');
    if (panelTrack && !$('#motionSummary')) {
      const summary = document.createElement('div');
      summary.id = 'motionSummary';
      summary.className = 'motion-summary';
      summary.innerHTML = `
        <div class="tool-head">
          <strong>Výsledek pohybu</strong>
          <span id="motionStatus" class="tool-status">Čekám na data</span>
        </div>
        <p class="micro-help">Začátek pohybu se určí automaticky z několika po sobě jdoucích bodů, aby drobné chvění trackeru nebylo považované za pohyb.</p>
        <div id="motionStats" class="motion-stats"></div>
      `;
      const graphsButton = $('#graphsBtn');
      if (graphsButton) graphsButton.insertAdjacentElement('beforebegin', summary);
      else panelTrack.append(summary);
    }

    if (!$('#segmentDynamicStyles')) {
      const style = document.createElement('style');
      style.id = 'segmentDynamicStyles';
      style.textContent = `
        .segment-controls,.motion-summary{margin:12px 0;padding:12px;border:1px solid #e4e7ec;border-radius:14px;background:#f9fafb}
        .segment-switch{display:flex;align-items:center;gap:7px;margin:0;font-size:.76rem;white-space:nowrap}
        .segment-switch input{width:18px;height:18px;min-height:0;margin:0;padding:0}
        .segment-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
        .segment-buttons .secondary-btn{min-height:44px;padding:9px 10px}
        .segment-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}
        .segment-row .secondary-btn{min-height:38px;padding:7px 8px;font-size:.74rem}
        .video-scrubber-wrap{padding:5px 14px 0}
        .video-scrubber{width:100%;min-height:26px;height:26px;margin:0;padding:0;accent-color:#155eef}
        .motion-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
        .motion-stat{padding:10px;border:1px solid #e4e7ec;border-radius:11px;background:#fff}
        .motion-stat span{display:block;color:#667085;font-size:.7rem;margin-bottom:2px}
        .motion-stat strong{font-size:.95rem}
        @media(max-width:430px){.segment-row{grid-template-columns:1fr 1fr}.segment-row #wholeVideoBtn{grid-column:1/-1}}
      `;
      document.head.append(style);
    }

    $('#segmentEnabled').addEventListener('change', (event) => {
      state.segment.enabled = event.target.checked;
      if (state.segment.enabled && !Number.isFinite(state.segment.end)) state.segment.end = durationValue();
      updateSegmentUi();
      updateMotionSummary();
    });

    $('#setSegmentStartBtn').addEventListener('click', () => {
      const end = segmentEnd() || durationValue();
      state.segment.start = Math.min(snapTime(video.currentTime), Math.max(0, end - 1 / fps()));
      state.segment.enabled = true;
      $('#segmentEnabled').checked = true;
      updateSegmentUi();
      updateMotionSummary();
    });

    $('#setSegmentEndBtn').addEventListener('click', () => {
      const duration = durationValue();
      state.segment.end = Math.max(snapTime(video.currentTime), state.segment.start + 1 / fps());
      if (duration) state.segment.end = Math.min(state.segment.end, duration);
      state.segment.enabled = true;
      $('#segmentEnabled').checked = true;
      updateSegmentUi();
      updateMotionSummary();
    });

    $('#goSegmentStartBtn').addEventListener('click', () => { video.currentTime = state.segment.start || 0; });
    $('#goSegmentEndBtn').addEventListener('click', () => { video.currentTime = segmentEnd() || durationValue(); });
    $('#wholeVideoBtn').addEventListener('click', () => {
      state.segment.enabled = false;
      state.segment.start = 0;
      state.segment.end = durationValue();
      $('#segmentEnabled').checked = false;
      updateSegmentUi();
      updateMotionSummary();
    });

    const scrubber = $('#videoScrubber');
    scrubber.addEventListener('pointerdown', () => { scrubbing = true; });
    scrubber.addEventListener('pointerup', () => { scrubbing = false; });
    scrubber.addEventListener('pointercancel', () => { scrubbing = false; });
    scrubber.addEventListener('input', () => {
      if (state.auto.status === 'running') return;
      const target = Number(scrubber.value);
      if (Number.isFinite(target)) video.currentTime = target;
    });

    updateSegmentUi();
    updateMotionSummary();
  }

  function updateSegmentUi() {
    const startButton = $('#setSegmentStartBtn');
    const endButton = $('#setSegmentEndBtn');
    const info = $('#segmentInfo');
    if (!startButton || !endButton || !info) return;

    const duration = durationValue();
    const end = segmentEnd();
    startButton.textContent = `Začátek: ${formatTime(state.segment.start)}`;
    endButton.textContent = `Konec: ${duration || end ? formatTime(end) : '–'}`;

    if (!state.segment.enabled) {
      info.textContent = duration ? `Měří se celé video • ${formatTime(duration)}` : 'Měří se celé video.';
    } else {
      const length = Math.max(0, end - state.segment.start);
      info.textContent = `Vybraný úsek: ${formatTime(state.segment.start)} – ${formatTime(end)} • délka ${formatTime(length)}`;
    }

    const scrubber = $('#videoScrubber');
    if (scrubber && duration) {
      scrubber.max = String(duration);
      scrubber.step = String(Math.min(0.01, 1 / fps()));
      if (!scrubbing) scrubber.value = String(Math.min(video.currentTime, duration));
    }
  }

  function pointsInMeasurementRange() {
    const points = [...state.trackPoints].sort((a, b) => a.t - b.t);
    if (!state.segment.enabled) return points;
    const end = segmentEnd();
    return points.filter((point) => point.t >= state.segment.start - 0.51 / fps() && point.t <= end + 0.51 / fps());
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
  }

  function detectMotionStart(points) {
    if (points.length < 3) return null;
    const steps = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const dt = points[i + 1].t - points[i].t;
      if (dt <= 1e-9) continue;
      steps.push({
        index: i,
        distancePx: Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y),
        dt
      });
    }
    if (steps.length < 2) return null;

    const distances = steps.map((step) => step.distancePx);
    const q25 = quantile(distances, 0.25);
    const q50 = quantile(distances, 0.50);
    const q75 = quantile(distances, 0.75);
    const noise = Math.max(0.35, q25);
    const threshold = Math.max(1.5, noise * 3.2);

    for (let i = 0; i < steps.length; i += 1) {
      const window = steps.slice(i, i + 3);
      const strong = window.filter((step) => step.distancePx > threshold).length;
      const cumulative = window.reduce((sum, step) => sum + step.distancePx, 0);
      if (strong >= Math.min(2, window.length) && cumulative > threshold * 1.8) {
        return { pointIndex: steps[i].index, thresholdPx: threshold, confidence: 'detected' };
      }
    }

    if (q50 > 1.8 && q75 < Math.max(q50 * 2.4, q50 + 3)) {
      return { pointIndex: 0, thresholdPx: Math.max(1.5, q25 * 0.6), confidence: 'from-start' };
    }

    return null;
  }

  function motionStatistics() {
    const raw = pointsInMeasurementRange();
    if (raw.length < 3 || !state.metersPerPixel) return null;
    const detection = detectMotionStart(raw);
    if (!detection) return { detected: false, points: raw.length };

    const startIndex = clamp(detection.pointIndex, 0, raw.length - 2);
    const startPoint = raw[startIndex];
    const endPoint = raw[raw.length - 1];
    let pathPx = 0;
    for (let i = startIndex; i < raw.length - 1; i += 1) {
      pathPx += Math.hypot(raw[i + 1].x - raw[i].x, raw[i + 1].y - raw[i].y);
    }
    const path = pathPx * state.metersPerPixel;
    const time = Math.max(0, endPoint.t - startPoint.t);
    const averageSpeed = time > 1e-9 ? path / time : null;
    return {
      detected: true,
      startTime: startPoint.t,
      startFrame: startPoint.frame,
      path,
      time,
      averageSpeed,
      thresholdPx: detection.thresholdPx,
      confidence: detection.confidence,
      points: raw.length
    };
  }

  function stat(label, value) {
    return `<div class="motion-stat"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function updateMotionSummary() {
    const status = $('#motionStatus');
    const stats = $('#motionStats');
    if (!status || !stats) return;

    const result = motionStatistics();
    state.segment.detection = result;

    if (!result) {
      status.textContent = 'Čekám na data';
      status.className = 'tool-status';
      stats.innerHTML = stat('Potřebuji', 'alespoň 3 body') + stat('Měřený úsek', state.segment.enabled ? `${formatTime(state.segment.start)}–${formatTime(segmentEnd())}` : 'celé video');
      return;
    }

    if (!result.detected) {
      status.textContent = 'Pohyb nerozpoznán';
      status.className = 'tool-status lost';
      stats.innerHTML = stat('Body v úseku', `${result.points}`) + stat('Tip', 'začni měřit chvíli před pohybem');
      return;
    }

    status.textContent = result.confidence === 'from-start' ? 'Pohyb od začátku' : 'Začátek nalezen';
    status.className = 'tool-status ready';
    const startLabel = `≈ ${formatTime(result.startTime)}${Number.isFinite(result.startFrame) ? ` • sn. ${result.startFrame}` : ''}`;
    stats.innerHTML =
      stat('Začátek pohybu', startLabel) +
      stat('Uražená dráha', `${formatNumber(result.path, 3)} m`) +
      stat('Čas pohybu', `${formatNumber(result.time, 3)} s`) +
      stat('Průměrná rychlost', Number.isFinite(result.averageSpeed) ? `${formatNumber(result.averageSpeed, 3)} m/s` : '–');
  }

  const measuredPointsBeforeSegment = measuredPoints;
  measuredPoints = function measuredPointsInSelectedSegment() {
    if (!state.segment.enabled) return measuredPointsBeforeSegment();
    if (!state.metersPerPixel) return [];
    const sorted = pointsInMeasurementRange();
    if (!sorted.length) return [];
    const t0 = sorted[0].t;

    if (state.coordinates?.enabled && state.coordinates.origin && state.coordinates.xPoint) {
      const axisDx = state.coordinates.xPoint.x - state.coordinates.origin.x;
      const axisDy = state.coordinates.xPoint.y - state.coordinates.origin.y;
      const axisLength = Math.hypot(axisDx, axisDy);
      if (axisLength > 1e-9) {
        const ux = axisDx / axisLength;
        const uy = axisDy / axisLength;
        const yx = uy;
        const yy = -ux;
        return sorted.map((point) => {
          const dx = point.x - state.coordinates.origin.x;
          const dy = point.y - state.coordinates.origin.y;
          return {
            ...point,
            dt: point.t - t0,
            xm: (dx * ux + dy * uy) * state.metersPerPixel,
            ym: (dx * yx + dy * yy) * state.metersPerPixel
          };
        });
      }
    }

    const origin = sorted[0];
    return sorted.map((point) => ({
      ...point,
      dt: point.t - t0,
      xm: (point.x - origin.x) * state.metersPerPixel,
      ym: (origin.y - point.y) * state.metersPerPixel
    }));
  };

  const originalAddTrackPoint = addTrackPoint;
  addTrackPoint = function addTrackPointInSegment(point) {
    if (!isInSegment(video.currentTime)) {
      toast('Tento snímek je mimo vybraný měřený úsek.');
      return;
    }
    return originalAddTrackPoint(point);
  };

  const originalSetTrackPoint = setTrackPoint;
  setTrackPoint = function setTrackPointInSegment(point, time, frame, source = 'manual', confidence = null) {
    if (!isInSegment(time)) return -1;
    const result = originalSetTrackPoint(point, time, frame, source, confidence);
    updateMotionSummary();
    return result;
  };

  const originalUpdateTrackingUi = updateTrackingUi;
  updateTrackingUi = function updateTrackingUiWithMotion() {
    originalUpdateTrackingUi();
    updateMotionSummary();
  };

  const originalUpdateAutoUi = updateAutoUi;
  updateAutoUi = function updateAutoUiWithSegmentStop() {
    if (state.auto.status === 'running' && state.segment.enabled) {
      const endFrame = Math.floor(segmentEnd() * fps() + 1e-6);
      if (currentFrame() + frameStep() > endFrame) state.auto.stopRequested = true;
    }
    originalUpdateAutoUi();
  };

  const originalRunAutoTracking = runAutoTracking;
  runAutoTracking = async function runAutoTrackingInSegment() {
    if (state.segment.enabled && !isInSegment(video.currentTime)) {
      video.currentTime = state.segment.start;
      toast('Přešel jsem na začátek měřeného úseku. Označ objekt v tomto snímku.');
      beginAutoSelection();
      return;
    }
    const result = await originalRunAutoTracking();
    if (state.segment.enabled && state.auto.status === 'stopped' && video.currentTime >= segmentEnd() - 0.6 / fps()) {
      state.auto.status = 'done';
      updateTrackingUi();
      updateTapHint();
      drawOverlay();
    }
    return result;
  };

  video.addEventListener('loadedmetadata', () => {
    state.segment.start = 0;
    state.segment.end = durationValue();
    updateSegmentUi();
    updateMotionSummary();
  });

  video.addEventListener('timeupdate', () => {
    const scrubber = $('#videoScrubber');
    if (scrubber && !scrubbing && durationValue()) scrubber.value = String(video.currentTime);
    updateSegmentUi();
  });
  video.addEventListener('seeked', updateSegmentUi);
  $('#fpsInput')?.addEventListener('input', () => { updateSegmentUi(); updateMotionSummary(); });
  $('#frameStepSelect')?.addEventListener('change', updateMotionSummary);

  ensureLoadedResetHooks();

  function ensureLoadedResetHooks() {
    const resetSegmentForVideo = () => {
      state.segment.enabled = false;
      state.segment.start = 0;
      state.segment.end = null;
      state.segment.detection = null;
      if ($('#segmentEnabled')) $('#segmentEnabled').checked = false;
      updateSegmentUi();
      updateMotionSummary();
    };
    $('#cameraInput')?.addEventListener('change', resetSegmentForVideo);
    $('#fileInput')?.addEventListener('change', resetSegmentForVideo);
    $('#resetBtn')?.addEventListener('click', resetSegmentForVideo);
  }

  installSegmentUi();
})();
