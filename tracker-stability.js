(() => {
  state.auto.runId = Number.isFinite(state.auto.runId) ? state.auto.runId : 0;

  const yieldToBrowser = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  function finishCancelledRun() {
    if (state.auto.status === 'running') state.auto.status = 'stopped';
    state.auto.stopRequested = false;
    updateTrackingUi();
    updateTapHint();
    drawOverlay();
  }

  function cancelAutoTrackingNow(reason = 'interaction') {
    state.auto.runId += 1;
    state.auto.stopRequested = true;
    if (state.auto.status === 'running') {
      state.auto.status = 'stopped';
      updateTrackingUi();
      updateTapHint();
      drawOverlay();
    }
    return reason;
  }

  window.cancelAutoTrackingNow = cancelAutoTrackingNow;

  stopAutoTracking = function stopAutoTrackingSafely() {
    cancelAutoTrackingNow('stop-button');
  };

  // Keep the original matching principle, but bound the amount of work per frame.
  // A very small template combined with a large search radius previously created
  // tens of thousands of candidates and could block a phone for a long time.
  findBestMatch = function findBestMatchBounded(frame) {
    const template = state.auto.template;
    if (!template || !state.auto.box) return null;

    const scale = frame.scale;
    const previous = boxToAnalysis(state.auto.box, scale, frame.width, frame.height);
    const predictedX = Math.round(previous.x + state.auto.lastShiftX * scale);
    const predictedY = Math.round(previous.y + state.auto.lastShiftY * scale);
    const motion = Math.hypot(state.auto.lastShiftX, state.auto.lastShiftY) * scale;

    const wantedRadiusX = Math.max(20, previous.w * 1.7, motion * 2.4);
    const wantedRadiusY = Math.max(20, previous.h * 1.7, motion * 2.4);
    const maxRadiusX = Math.min(frame.width * 0.27, Math.max(72, previous.w * 4.5));
    const maxRadiusY = Math.min(frame.height * 0.27, Math.max(72, previous.h * 4.5));
    const radiusX = Math.round(clamp(wantedRadiusX, 20, maxRadiusX));
    const radiusY = Math.round(clamp(wantedRadiusY, 20, maxRadiusY));

    const minX = clamp(predictedX - radiusX, 0, Math.max(0, frame.width - template.w));
    const maxX = clamp(predictedX + radiusX, 0, Math.max(0, frame.width - template.w));
    const minY = clamp(predictedY - radiusY, 0, Math.max(0, frame.height - template.h));
    const maxY = clamp(predictedY + radiusY, 0, Math.max(0, frame.height - template.h));

    const spanX = Math.max(1, maxX - minX + 1);
    const spanY = Math.max(1, maxY - minY + 1);
    const targetCoarseCandidates = 1400;
    const candidateStep = Math.ceil(Math.sqrt((spanX * spanY) / targetCoarseCandidates));
    const templateStep = Math.floor(Math.min(template.w, template.h) / 12);
    const coarse = clamp(Math.max(2, candidateStep, templateStep), 2, 10);

    let best = { x: previous.x, y: previous.y, error: Infinity };
    for (let y = minY; y <= maxY; y += coarse) {
      for (let x = minX; x <= maxX; x += coarse) {
        const error = scorePatch(frame, template, x, y);
        if (error < best.error) best = { x, y, error };
      }
    }

    const fineRadius = Math.min(14, coarse * 2);
    for (let y = Math.max(minY, best.y - fineRadius); y <= Math.min(maxY, best.y + fineRadius); y += 1) {
      for (let x = Math.max(minX, best.x - fineRadius); x <= Math.min(maxX, best.x + fineRadius); x += 1) {
        const error = scorePatch(frame, template, x, y);
        if (error < best.error) best = { x, y, error };
      }
    }

    const confidence = clamp(1 - best.error / 72, 0, 1);
    const inv = 1 / scale;
    return {
      box: {
        x: best.x * inv,
        y: best.y * inv,
        w: template.w * inv,
        h: template.h * inv
      },
      confidence,
      error: best.error
    };
  };

  runAutoTracking = async function runAutoTrackingStable() {
    if (!state.auto.template || !state.auto.box || state.auto.status === 'running') return;

    const runId = ++state.auto.runId;
    state.auto.stopRequested = false;
    video.pause();

    // A template belongs to the frame on which it was selected. If the user has
    // moved elsewhere in the video, return to that frame before tracking.
    if (Number.isFinite(state.auto.startFrame) && currentFrame() !== state.auto.startFrame) {
      try {
        await seekToFrame(state.auto.startFrame);
      } catch {}
      if (runId !== state.auto.runId) return;
    }

    state.auto.status = 'running';
    updateTrackingUi();
    updateTapHint();

    let frame = currentFrame();
    const videoMaxFrame = Math.floor((video.duration || 0) * fps());
    const selectedEnd = state.segment?.enabled && Number.isFinite(state.segment.end)
      ? Math.floor(state.segment.end * fps() + 1e-6)
      : videoMaxFrame;
    const maxFrame = Math.min(videoMaxFrame, selectedEnd);
    let processed = 0;
    let lastUiUpdate = 0;

    try {
      while (frame + frameStep() <= maxFrame && processed < 2000) {
        if (runId !== state.auto.runId || state.auto.stopRequested || state.auto.status !== 'running') break;

        const nextFrame = frame + frameStep();
        await seekToFrame(nextFrame);
        if (runId !== state.auto.runId || state.auto.stopRequested || state.auto.status !== 'running') break;

        // Give touch controls, scrolling and the browser video pipeline a chance
        // to run before the CPU-heavy image comparison starts.
        await yieldToBrowser();
        if (runId !== state.auto.runId || state.auto.stopRequested || state.auto.status !== 'running') break;

        const captured = captureFrame();
        const previousCenter = {
          x: state.auto.box.x + state.auto.box.w / 2,
          y: state.auto.box.y + state.auto.box.h / 2
        };

        const matchStarted = performance.now();
        const match = findBestMatch(captured);
        const matchTime = performance.now() - matchStarted;

        if (!match) {
          state.auto.status = 'lost';
          break;
        }

        state.auto.confidence = match.confidence;
        state.auto.box = match.box;
        const center = {
          x: match.box.x + match.box.w / 2,
          y: match.box.y + match.box.h / 2
        };
        state.auto.lastShiftX = center.x - previousCenter.x;
        state.auto.lastShiftY = center.y - previousCenter.y;

        if (match.confidence < state.auto.threshold) {
          state.auto.status = 'lost';
          drawOverlay();
          updateAutoUi();
          break;
        }

        setTrackPoint(center, video.currentTime, nextFrame, 'auto', match.confidence);

        // Template adaptation allocates another pixel buffer. Doing it every
        // third frame is visually equivalent here and substantially reduces GC
        // pressure on phones during long measurements.
        if (processed % 3 === 0 && match.confidence > state.auto.threshold + 0.12) {
          adaptTemplate(captured, match.box, 0.10);
        }

        frame = nextFrame;
        processed += 1;

        const now = performance.now();
        if (processed % 3 === 0 || now - lastUiUpdate > 120) {
          updateTrackingUi();
          drawOverlay();
          lastUiUpdate = now;
        } else {
          updateAutoUi();
        }

        // A single pathological frame should stop gracefully instead of making
        // the whole tab appear dead for the rest of the session.
        if (matchTime > 1400) {
          state.auto.status = 'stopped';
          toast('Sledování bylo zastaveno, protože tento snímek je příliš náročný. Zkus objekt označit menším rámečkem.');
          break;
        }

        // Yield on every frame. This is the important difference for mobile:
        // the Stop button and browser video controls remain responsive.
        await yieldToBrowser();
      }

      if (runId === state.auto.runId && state.auto.status === 'running') {
        state.auto.status = frame + frameStep() > maxFrame ? 'done' : 'stopped';
      }
    } catch (error) {
      console.error('Automatic tracker stopped safely:', error);
      if (runId === state.auto.runId) {
        state.auto.status = 'stopped';
        toast('Automatické sledování narazilo na problém a bylo bezpečně zastaveno. Naměřené body zůstaly zachované.');
      }
    } finally {
      if (runId === state.auto.runId) {
        state.auto.stopRequested = false;
        if (state.auto.status === 'running') state.auto.status = 'stopped';
        updateTrackingUi();
        updateTapHint();
        drawOverlay();
      }
    }
  };

  // If another part of the app changes the video source, invalidate any still
  // pending async tracking loop immediately.
  const invalidateRun = () => {
    state.auto.runId += 1;
    state.auto.stopRequested = false;
  };
  $('#cameraInput')?.addEventListener('change', invalidateRun, true);
  $('#fileInput')?.addEventListener('change', invalidateRun, true);
  $('#resetBtn')?.addEventListener('click', invalidateRun, true);

  // Replace the two measurement-range inputs with listener-free clones. The
  // previous implementation sought on every tiny pointer move. Here state and
  // labels update immediately, but the expensive video seek is throttled.
  function installStableMeasurementRange() {
    const oldStart = $('#videoRangeStart');
    const oldEnd = $('#videoRangeEnd');
    const root = $('#videoDualRange');
    const label = $('#videoRangeLabel');
    if (!oldStart || !oldEnd || !root || !label || root.dataset.stableRange === '1') return;

    const start = oldStart.cloneNode(true);
    const end = oldEnd.cloneNode(true);
    oldStart.replaceWith(start);
    oldEnd.replaceWith(end);
    root.dataset.stableRange = '1';

    let seekTimer = null;

    const updateFill = (a, b, duration) => {
      const lo = duration > 0 ? clamp(a / duration * 100, 0, 100) : 0;
      const hi = duration > 0 ? clamp(b / duration * 100, 0, 100) : 100;
      root.style.setProperty('--range-lo', `${lo}%`);
      root.style.setProperty('--range-hi', `${hi}%`);
    };

    const apply = (changed, final = false) => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!(duration > 0)) return;

      cancelAutoTrackingNow('segment-range');
      video.pause();

      const step = Math.max(1 / fps(), 0.001);
      let a = Math.round((Number(start.value) || 0) / step) * step;
      let b = Math.round((Number(end.value) || duration) / step) * step;
      if (changed === 'start') a = Math.min(a, b - step);
      else b = Math.max(b, a + step);
      a = clamp(a, 0, Math.max(0, duration - step));
      b = clamp(b, Math.min(duration, a + step), duration);

      start.min = '0'; start.max = String(duration); start.step = String(step); start.value = String(a);
      end.min = '0'; end.max = String(duration); end.step = String(step); end.value = String(b);
      state.segment.start = a;
      state.segment.end = b;
      state.segment.enabled = !(a <= step * 0.51 && b >= duration - step * 0.51);

      label.textContent = `${formatNumber(a, 3)} s – ${formatNumber(b, 3)} s`;
      updateFill(a, b, duration);

      const legacyToggle = $('#segmentEnabled');
      if (legacyToggle) legacyToggle.checked = state.segment.enabled;

      const target = changed === 'start' ? a : b;
      clearTimeout(seekTimer);
      if (final) {
        video.currentTime = target;
        legacyToggle?.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        seekTimer = setTimeout(() => {
          if (Number.isFinite(video.duration)) video.currentTime = clamp(target, 0, video.duration);
        }, 110);
      }

      if (state.stage === 'graphs') requestAnimationFrame(() => drawChart());
    };

    start.addEventListener('pointerdown', () => cancelAutoTrackingNow('segment-range'), { passive: true });
    end.addEventListener('pointerdown', () => cancelAutoTrackingNow('segment-range'), { passive: true });
    start.addEventListener('input', () => apply('start', false));
    end.addEventListener('input', () => apply('end', false));
    start.addEventListener('change', () => apply('start', true));
    end.addEventListener('change', () => apply('end', true));
  }

  installStableMeasurementRange();
})();