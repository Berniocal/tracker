(() => {
  state.coordinates = {
    enabled: false,
    editing: false,
    origin: null,
    xPoint: null
  };

  let axisDrag = null;

  function ensureCoordinateUi() {
    const panel = $('#panelTrack');
    if (!panel || $('#coordinateControls')) return;

    const box = document.createElement('div');
    box.id = 'coordinateControls';
    box.className = 'coordinate-controls';
    box.innerHTML = `
      <div class="tool-head">
        <strong>Souřadnicová soustava</strong>
        <span id="coordinateStatus" class="tool-status">Výchozí osy</span>
      </div>
      <p class="micro-help">Ve výchozím stavu je počátek v prvním bodě, osa x míří doprava a osa y nahoru. Vlastní osy můžeš kdykoliv nastavit nebo změnit.</p>
      <div class="coordinate-buttons">
        <button id="setCoordinatesBtn" class="secondary-btn" type="button">⊹ Nastavit osy</button>
        <button id="resetCoordinatesBtn" class="secondary-btn" type="button">Výchozí osy</button>
      </div>
      <div id="coordinateResult" class="auto-result">x doprava • y nahoru</div>
    `;

    const auto = $('#autoTracker');
    if (auto) auto.insertAdjacentElement('beforebegin', box);
    else panel.querySelector('.track-actions')?.insertAdjacentElement('beforebegin', box);

    if (!$('#coordinateDynamicStyles')) {
      const style = document.createElement('style');
      style.id = 'coordinateDynamicStyles';
      style.textContent = `
        .coordinate-controls{margin:12px 0;padding:12px;border:1px solid #e4e7ec;border-radius:14px;background:#f9fafb}
        .coordinate-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
        .coordinate-buttons .secondary-btn{min-height:44px;padding:9px 10px}
        @media(max-width:430px){.coordinate-buttons{grid-template-columns:1fr 1fr}}
      `;
      document.head.append(style);
    }

    $('#setCoordinatesBtn').addEventListener('click', () => {
      if (!video.videoWidth) return;
      if (!state.coordinates.enabled) createDefaultCustomAxes();
      state.coordinates.enabled = true;
      state.coordinates.editing = !state.coordinates.editing;
      updateCoordinateUi();
      drawOverlay();
    });

    $('#resetCoordinatesBtn').addEventListener('click', () => {
      resetCoordinates();
      updateTrackingUi();
      if (state.stage === 'graphs') drawChart();
      drawOverlay();
    });

    updateCoordinateUi();
  }

  function createDefaultCustomAxes() {
    const first = state.trackPoints[0];
    const ox = first?.x ?? video.videoWidth * 0.25;
    const oy = first?.y ?? video.videoHeight * 0.72;
    const length = Math.max(60, Math.min(video.videoWidth, video.videoHeight) * 0.28);
    state.coordinates.origin = { x: ox, y: oy };
    state.coordinates.xPoint = {
      x: clamp(ox + length, 0, video.videoWidth),
      y: oy
    };
  }

  function resetCoordinates() {
    state.coordinates.enabled = false;
    state.coordinates.editing = false;
    state.coordinates.origin = null;
    state.coordinates.xPoint = null;
    axisDrag = null;
    updateCoordinateUi();
  }

  function coordinateBasis() {
    if (!state.coordinates.enabled || !state.coordinates.origin || !state.coordinates.xPoint) return null;
    const dx = state.coordinates.xPoint.x - state.coordinates.origin.x;
    const dy = state.coordinates.xPoint.y - state.coordinates.origin.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return null;
    const ux = dx / length;
    const uy = dy / length;
    return {
      ux,
      uy,
      yx: uy,
      yy: -ux,
      length
    };
  }

  function angleDegrees() {
    const basis = coordinateBasis();
    if (!basis) return 0;
    let angle = Math.atan2(-basis.uy, basis.ux) * 180 / Math.PI;
    if (angle > 180) angle -= 360;
    if (angle <= -180) angle += 360;
    return angle;
  }

  function updateCoordinateUi() {
    const status = $('#coordinateStatus');
    const button = $('#setCoordinatesBtn');
    const result = $('#coordinateResult');
    if (!status || !button || !result) return;

    if (!state.coordinates.enabled) {
      status.textContent = 'Výchozí osy';
      status.className = 'tool-status';
      button.textContent = '⊹ Nastavit osy';
      result.textContent = 'Počátek = první naměřený bod • x doprava • y nahoru';
      return;
    }

    status.textContent = state.coordinates.editing ? 'Uprav osy' : 'Vlastní osy';
    status.className = 'tool-status ready';
    button.textContent = state.coordinates.editing ? '✓ Hotovo' : '✎ Upravit osy';
    result.textContent = `Úhel osy x: ${formatNumber(angleDegrees(), 1)}° • chyť O nebo konec osy x a táhni`;
  }

  const originalMeasuredPoints = measuredPoints;
  measuredPoints = function measuredPointsWithCoordinates() {
    if (!state.metersPerPixel || !state.trackPoints.length) return [];
    if (!state.coordinates.enabled || !state.coordinates.origin || !state.coordinates.xPoint) {
      return originalMeasuredPoints();
    }

    const basis = coordinateBasis();
    if (!basis) return originalMeasuredPoints();

    const sorted = [...state.trackPoints].sort((a, b) => a.t - b.t);
    const t0 = sorted[0].t;
    const origin = state.coordinates.origin;

    return sorted.map((point) => {
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      return {
        ...point,
        dt: point.t - t0,
        xm: (dx * basis.ux + dy * basis.uy) * state.metersPerPixel,
        ym: (dx * basis.yx + dy * basis.yy) * state.metersPerPixel
      };
    });
  };

  const originalDrawVectorOverlays = drawVectorOverlays;
  drawVectorOverlays = function drawVectorOverlaysWithCoordinates() {
    if (!state.coordinates.enabled) {
      originalDrawVectorOverlays();
      return;
    }
    if ((state.stage !== 'track' && state.stage !== 'graphs') || state.trackPoints.length < 2) return;
    if (!state.vectors.velocity && !state.vectors.acceleration) return;

    const basis = coordinateBasis();
    if (!basis) {
      originalDrawVectorOverlays();
      return;
    }

    const points = kinematicsPoints();
    const scales = vectorPixelScales(points);
    const indices = state.vectors.mode === 'all'
      ? points.map((_, index) => index)
      : [nearestKinematicIndex(points)].filter((index) => index >= 0);

    indices.forEach((index) => {
      const point = points[index];
      const origin = videoToCanvasPoint(point);
      const current = Math.abs(point.t - video.currentTime) <= Math.max(0.55 / fps(), 0.55 * frameStep() / fps());
      const width = state.vectors.mode === 'all' && !current ? 2.2 : 3.2;

      if (state.vectors.velocity && scales.velocity && Number.isFinite(point.vx) && Number.isFinite(point.vy)) {
        const screenVx = point.vx * basis.ux + point.vy * basis.yx;
        const screenVy = point.vx * basis.uy + point.vy * basis.yy;
        drawArrow(origin, screenVx * scales.velocity, screenVy * scales.velocity, {
          color: '#12b76a',
          lineWidth: width,
          label: state.vectors.mode === 'current' || current ? 'v⃗' : ''
        });
      }

      if (state.vectors.acceleration && scales.acceleration && Number.isFinite(point.ax) && Number.isFinite(point.ay)) {
        const screenAx = point.ax * basis.ux + point.ay * basis.yx;
        const screenAy = point.ax * basis.uy + point.ay * basis.yy;
        drawArrow(origin, screenAx * scales.acceleration, screenAy * scales.acceleration, {
          color: '#d92d20',
          lineWidth: width,
          label: state.vectors.mode === 'current' || current ? 'a⃗' : ''
        });
      }
    });
  };

  function drawAxisArrow(from, to, color, label) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = 10;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.font = '800 13px system-ui,sans-serif';
    ctx.fillText(label, to.x + 7 * Math.cos(angle), to.y + 7 * Math.sin(angle));
    ctx.restore();
  }

  function drawCoordinateAxes() {
    if (!state.coordinates.enabled || !state.coordinates.origin || !state.coordinates.xPoint || state.stage !== 'track') return;
    const basis = coordinateBasis();
    if (!basis) return;

    const o = videoToCanvasPoint(state.coordinates.origin);
    const xEnd = videoToCanvasPoint(state.coordinates.xPoint);
    const axisLengthVideo = basis.length;
    const yPoint = {
      x: state.coordinates.origin.x + basis.yx * axisLengthVideo,
      y: state.coordinates.origin.y + basis.yy * axisLengthVideo
    };
    const yEnd = videoToCanvasPoint(yPoint);

    drawAxisArrow(o, xEnd, '#155eef', 'x');
    drawAxisArrow(o, yEnd, '#7f56d9', 'y');

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#101828';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(o.x, o.y, state.coordinates.editing ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#101828';
    ctx.font = '800 12px system-ui,sans-serif';
    ctx.fillText('O', o.x + 10, o.y - 8);

    if (state.coordinates.editing) {
      ctx.fillStyle = '#155eef';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(xEnd.x, xEnd.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  const originalDrawOverlay = drawOverlay;
  drawOverlay = function drawOverlayWithCoordinates() {
    originalDrawOverlay();
    drawCoordinateAxes();
  };

  function hitAxisHandle(clientX, clientY) {
    if (!state.coordinates.enabled || !state.coordinates.editing || !state.coordinates.origin || !state.coordinates.xPoint) return null;
    const screen = canvasCoordinates(clientX, clientY);
    const o = videoToCanvasPoint(state.coordinates.origin);
    const x = videoToCanvasPoint(state.coordinates.xPoint);
    const dO = Math.hypot(screen.x - o.x, screen.y - o.y);
    const dX = Math.hypot(screen.x - x.x, screen.y - x.y);
    if (dO <= 30 && dO <= dX) return 'origin';
    if (dX <= 30) return 'xPoint';
    return null;
  }

  function beginAxisDrag(event) {
    if (event.pointerType !== 'mouse' && pointers.size > 0) return false;
    const target = hitAxisHandle(event.clientX, event.clientY);
    if (!target) return false;
    const point = clientToVideoPointXY(event.clientX, event.clientY);
    if (!point) return false;

    axisDrag = {
      pointerId: event.pointerId,
      target,
      startPointer: point,
      startOrigin: { ...state.coordinates.origin },
      startXPoint: { ...state.coordinates.xPoint }
    };
    overlay.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function moveAxisDrag(event) {
    if (!axisDrag || axisDrag.pointerId !== event.pointerId) return false;
    const point = clientToVideoPointXY(event.clientX, event.clientY);
    if (!point) return true;

    if (axisDrag.target === 'xPoint') {
      const dx = point.x - state.coordinates.origin.x;
      const dy = point.y - state.coordinates.origin.y;
      const minLength = Math.max(20, Math.min(video.videoWidth, video.videoHeight) * 0.035);
      const length = Math.hypot(dx, dy);
      if (length >= minLength) {
        state.coordinates.xPoint = {
          x: clamp(point.x, 0, video.videoWidth),
          y: clamp(point.y, 0, video.videoHeight)
        };
      }
    } else {
      let tx = point.x - axisDrag.startPointer.x;
      let ty = point.y - axisDrag.startPointer.y;
      tx = clamp(tx, -Math.min(axisDrag.startOrigin.x, axisDrag.startXPoint.x), video.videoWidth - Math.max(axisDrag.startOrigin.x, axisDrag.startXPoint.x));
      ty = clamp(ty, -Math.min(axisDrag.startOrigin.y, axisDrag.startXPoint.y), video.videoHeight - Math.max(axisDrag.startOrigin.y, axisDrag.startXPoint.y));
      state.coordinates.origin = { x: axisDrag.startOrigin.x + tx, y: axisDrag.startOrigin.y + ty };
      state.coordinates.xPoint = { x: axisDrag.startXPoint.x + tx, y: axisDrag.startXPoint.y + ty };
    }

    updateCoordinateUi();
    updateTrackingUi();
    if (state.stage === 'graphs') drawChart();
    drawOverlay();
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function endAxisDrag(event) {
    if (!axisDrag || axisDrag.pointerId !== event.pointerId) return false;
    axisDrag = null;
    updateCoordinateUi();
    updateTrackingUi();
    if (state.stage === 'graphs') drawChart();
    drawOverlay();
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  overlay.addEventListener('pointerdown', (event) => {
    if (state.auto.status === 'running') return;
    beginAxisDrag(event);
  }, true);
  overlay.addEventListener('pointermove', (event) => moveAxisDrag(event), true);
  overlay.addEventListener('pointerup', (event) => endAxisDrag(event), true);
  overlay.addEventListener('pointercancel', (event) => endAxisDrag(event), true);

  const resetForNewVideo = () => {
    resetCoordinates();
    drawOverlay();
  };
  $('#cameraInput')?.addEventListener('change', resetForNewVideo);
  $('#fileInput')?.addEventListener('change', resetForNewVideo);
  $('#resetBtn')?.addEventListener('click', resetForNewVideo);

  ensureCoordinateUi();
})();
