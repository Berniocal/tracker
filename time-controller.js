(() => {
  const SEEK_THROTTLE_MS = 70;
  let previewTimer = null;
  let pendingPreviewTarget = null;
  let lastPreviewAt = 0;
  let exactSeekToken = 0;
  let playbackToken = 0;
  let rangeEditing = false;
  let rangeEditingKind = null;
  let rangeStartAtPointerDown = null;

  function durationValue() {
    return Number.isFinite(video.duration) ? video.duration : 0;
  }

  function frameDuration() {
    return Math.max(1 / fps(), 0.001);
  }

  function segmentBounds() {
    const duration = durationValue();
    if (!(duration > 0)) return { start: 0, end: 0 };
    const step = frameDuration();
    const start = clamp(Number(state.segment?.start) || 0, 0, Math.max(0, duration - step));
    const rawEnd = Number.isFinite(state.segment?.end) ? state.segment.end : duration;
    const end = clamp(rawEnd, Math.min(duration, start + step), duration);
    return { start, end };
  }

  function clearGestureState() {
    try {
      if (typeof pointers !== 'undefined' && pointers?.keys) {
        for (const pointerId of pointers.keys()) {
          if (overlay.hasPointerCapture?.(pointerId)) overlay.releasePointerCapture(pointerId);
        }
        pointers.clear();
      }
    } catch {}
    try { if (typeof pinchSession !== 'undefined') pinchSession = null; } catch {}
    try { if (typeof pinchUsed !== 'undefined') pinchUsed = false; } catch {}
    try { if (typeof pendingTap !== 'undefined') pendingTap = null; } catch {}
    try { if (typeof selectionDrag !== 'undefined') selectionDrag = null; } catch {}
  }

  function stopTracker(reason = 'time-control') {
    if (state.auto?.status !== 'running') return;
    if (typeof window.cancelAutoTrackingNow === 'function') {
      window.cancelAutoTrackingNow(reason);
    } else {
      state.auto.stopRequested = true;
      state.auto.status = 'stopped';
    }
  }

  function setVideoTime(target) {
    const duration = durationValue();
    if (!(duration > 0)) return;
    const safe = clamp(Number(target) || 0, 0, duration);
    try { video.currentTime = safe; } catch {}
    try { updateTimeUi(); } catch {}
    try { drawOverlay(); } catch {}
  }

  function cancelPreviewSeek() {
    clearTimeout(previewTimer);
    previewTimer = null;
    pendingPreviewTarget = null;
  }

  function previewSeek(target) {
    pendingPreviewTarget = target;
    if (previewTimer) return;

    const delay = Math.max(0, SEEK_THROTTLE_MS - (performance.now() - lastPreviewAt));
    previewTimer = setTimeout(() => {
      previewTimer = null;
      lastPreviewAt = performance.now();
      const value = pendingPreviewTarget;
      pendingPreviewTarget = null;
      if (Number.isFinite(value)) setVideoTime(value);
    }, delay);
  }

  function seekExact(target) {
    const duration = durationValue();
    if (!(duration > 0)) return Promise.resolve(false);
    const safe = clamp(Number(target) || 0, 0, duration);
    const token = ++exactSeekToken;
    cancelPreviewSeek();
    video.pause();

    return new Promise((resolve) => {
      let finished = false;
      let timeout = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        video.removeEventListener('seeked', finish);
        if (token === exactSeekToken) {
          try { updateTimeUi(); } catch {}
          try { drawOverlay(); } catch {}
        }
        resolve(token === exactSeekToken);
      };

      if (Math.abs(video.currentTime - safe) <= 0.2 / fps()) {
        setVideoTime(safe);
        requestAnimationFrame(() => requestAnimationFrame(finish));
        return;
      }

      video.addEventListener('seeked', finish, { once: true });
      setVideoTime(safe);
      timeout = setTimeout(finish, 900);
    });
  }

  window.seekMeasurementStart = async function seekMeasurementStart(reason = 'stage') {
    stopTracker(reason);
    clearGestureState();
    const { start } = segmentBounds();
    return seekExact(start);
  };

  function updateRangeAppearance(start, end) {
    const root = $('#videoDualRange');
    const label = $('#videoRangeLabel');
    const duration = durationValue();
    if (!root || !label || !(duration > 0)) return;
    const lo = clamp(start / duration * 100, 0, 100);
    const hi = clamp(end / duration * 100, 0, 100);
    root.style.setProperty('--range-lo', `${lo}%`);
    root.style.setProperty('--range-hi', `${hi}%`);
    label.textContent = `${formatNumber(start, 3)} s – ${formatNumber(end, 3)} s`;
  }

  function normalizeRangeFromInputs(changed) {
    const startInput = $('#videoRangeStart');
    const endInput = $('#videoRangeEnd');
    const duration = durationValue();
    if (!startInput || !endInput || !(duration > 0)) return null;

    const step = frameDuration();
    let start = Math.round((Number(startInput.value) || 0) / step) * step;
    let end = Math.round((Number(endInput.value) || duration) / step) * step;

    if (changed === 'start') start = Math.min(start, end - step);
    else end = Math.max(end, start + step);

    start = clamp(start, 0, Math.max(0, duration - step));
    end = clamp(end, Math.min(duration, start + step), duration);

    startInput.min = '0';
    startInput.max = String(duration);
    startInput.step = String(step);
    startInput.value = String(start);
    endInput.min = '0';
    endInput.max = String(duration);
    endInput.step = String(step);
    endInput.value = String(end);

    state.segment.start = start;
    state.segment.end = end;
    state.segment.enabled = !(start <= step * 0.51 && end >= duration - step * 0.51);
    updateRangeAppearance(start, end);
    return { start, end };
  }

  function finalizeRangeEdit(changed) {
    if (!rangeEditing) return;
    const values = normalizeRangeFromInputs(changed || rangeEditingKind || 'start');
    rangeEditing = false;
    rangeEditingKind = null;
    if (!values) return;

    cancelPreviewSeek();
    setVideoTime(changed === 'end' ? values.end : values.start);

    const legacyToggle = $('#segmentEnabled');
    if (legacyToggle) {
      legacyToggle.checked = state.segment.enabled;
      legacyToggle.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const startChanged = Number.isFinite(rangeStartAtPointerDown)
      && Math.abs(values.start - rangeStartAtPointerDown) > 0.25 / fps();
    rangeStartAtPointerDown = null;

    if (startChanged && state.auto?.template) {
      resetAutoTracker();
      toast('Začátek měřeného úseku se změnil. Objekt pro automatické sledování označ znovu.');
    }

    try { updateTrackingUi(); } catch {}
    if (state.stage === 'graphs') requestAnimationFrame(() => drawChart());
  }

  function beginRangeEdit(kind) {
    if (!rangeEditing) {
      rangeEditing = true;
      rangeStartAtPointerDown = Number(state.segment?.start) || 0;
      stopTracker('segment-range');
      clearGestureState();
      video.pause();
    }
    rangeEditingKind = kind;
  }

  function handleRangeInput(kind) {
    beginRangeEdit(kind);
    const values = normalizeRangeFromInputs(kind);
    if (!values) return;
    previewSeek(kind === 'start' ? values.start : values.end);
  }

  function cloneWithoutListeners(node) {
    if (!node?.parentNode) return node;
    const clone = node.cloneNode(true);
    node.parentNode.replaceChild(clone, node);
    return clone;
  }

  function installUnifiedMeasurementRange() {
    let startInput = $('#videoRangeStart');
    let endInput = $('#videoRangeEnd');
    if (!startInput || !endInput) return;

    startInput = cloneWithoutListeners(startInput);
    endInput = cloneWithoutListeners(endInput);
    $('#videoDualRange')?.setAttribute('data-time-controller', '1');

    const wire = (input, kind) => {
      input.addEventListener('pointerdown', () => beginRangeEdit(kind), { passive: true });
      input.addEventListener('input', () => handleRangeInput(kind));
      input.addEventListener('change', () => finalizeRangeEdit(kind));
      input.addEventListener('pointerup', () => setTimeout(() => finalizeRangeEdit(kind), 0), { passive: true });
      input.addEventListener('pointercancel', () => setTimeout(() => finalizeRangeEdit(kind), 0), { passive: true });
    };
    wire(startInput, 'start');
    wire(endInput, 'end');

    const { start, end } = segmentBounds();
    if (durationValue() > 0) {
      startInput.max = String(durationValue());
      endInput.max = String(durationValue());
      startInput.step = String(frameDuration());
      endInput.step = String(frameDuration());
      startInput.value = String(start);
      endInput.value = String(end);
      updateRangeAppearance(start, end);
    }
  }

  function installUnifiedScrubber() {
    let scrubber = $('#videoScrubber');
    if (!scrubber) return;
    scrubber = cloneWithoutListeners(scrubber);

    let scrubbing = false;
    scrubber.addEventListener('pointerdown', () => {
      scrubbing = true;
      stopTracker('scrubber');
      clearGestureState();
      video.pause();
    }, { passive: true });
    scrubber.addEventListener('input', () => {
      const target = Number(scrubber.value);
      if (Number.isFinite(target)) previewSeek(target);
    });
    const finish = () => {
      if (!scrubbing) return;
      scrubbing = false;
      const target = Number(scrubber.value);
      cancelPreviewSeek();
      if (Number.isFinite(target)) setVideoTime(target);
    };
    scrubber.addEventListener('change', finish);
    scrubber.addEventListener('pointerup', finish, { passive: true });
    scrubber.addEventListener('pointercancel', finish, { passive: true });
  }

  function monitorPlayback(token) {
    if (token !== playbackToken || video.paused) return;
    const { start, end } = segmentBounds();
    const tolerance = 0.35 / fps();
    if (state.segment?.enabled && video.currentTime >= end - tolerance) {
      video.pause();
      setVideoTime(end);
      return;
    }
    if (state.segment?.enabled && video.currentTime < start - tolerance) {
      video.pause();
      setVideoTime(start);
      return;
    }
    requestAnimationFrame(() => monitorPlayback(token));
  }

  async function toggleSegmentPlayback() {
    stopTracker('playback');
    clearGestureState();

    if (!video.paused) {
      playbackToken += 1;
      video.pause();
      return;
    }

    const bounds = segmentBounds();
    const tolerance = 0.5 / fps();
    if (state.segment?.enabled) {
      if (video.currentTime < bounds.start - tolerance || video.currentTime >= bounds.end - tolerance) {
        await seekExact(bounds.start);
      }
    } else if (video.ended || video.currentTime >= durationValue() - 0.001) {
      await seekExact(0);
    }

    try {
      await video.play();
      const token = ++playbackToken;
      requestAnimationFrame(() => monitorPlayback(token));
    } catch {
      toast('Video se nepodařilo přehrát.');
    }
  }

  async function stepOneFrame(delta) {
    stopTracker('frame-step');
    clearGestureState();
    video.pause();

    const bounds = segmentBounds();
    const rate = fps();
    const startFrame = Math.ceil(bounds.start * rate - 1e-6);
    const endFrame = Math.floor(bounds.end * rate + 1e-6);
    let frame = Math.round(video.currentTime * rate);

    if (state.segment?.enabled && (frame < startFrame || frame > endFrame)) {
      frame = delta >= 0 ? startFrame : endFrame;
    } else {
      frame += delta;
      if (state.segment?.enabled) frame = clamp(frame, startFrame, endFrame);
      else frame = clamp(frame, 0, Math.floor(durationValue() * rate));
    }

    await seekExact(frame / rate);
  }

  function installUnifiedTransport() {
    let prev = $('#prevFrameBtn');
    let next = $('#nextFrameBtn');
    let play = $('#playBtn');
    if (!prev || !next || !play) return;

    prev = cloneWithoutListeners(prev);
    next = cloneWithoutListeners(next);
    play = cloneWithoutListeners(play);

    prev.addEventListener('click', (event) => {
      event.preventDefault();
      stepOneFrame(-1);
    });
    next.addEventListener('click', (event) => {
      event.preventDefault();
      stepOneFrame(1);
    });
    play.addEventListener('click', (event) => {
      event.preventDefault();
      toggleSegmentPlayback();
    });
  }

  function installStageStartBehavior() {
    const originalSetStage = setStage;
    setStage = function setStageWithMeasurementStart(stage) {
      const result = originalSetStage(stage);
      if (state.stage === stage && (stage === 'scale' || stage === 'track')) {
        requestAnimationFrame(() => window.seekMeasurementStart(`stage-${stage}`));
      }
      return result;
    };
  }

  function installCoordinateStartGuard() {
    const button = $('#setCoordinatesBtn');
    if (!button || button.dataset.timeStartGuard === '1') return;
    button.dataset.timeStartGuard = '1';
    let replaying = false;

    button.addEventListener('click', async (event) => {
      if (replaying) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      await window.seekMeasurementStart('coordinates');
      replaying = true;
      try { button.click(); } finally { replaying = false; }
    }, true);
  }

  function syncRangeAfterMetadata() {
    const duration = durationValue();
    if (!(duration > 0)) return;
    const startInput = $('#videoRangeStart');
    const endInput = $('#videoRangeEnd');
    if (!startInput || !endInput) return;
    const { start, end } = segmentBounds();
    startInput.max = String(duration);
    endInput.max = String(duration);
    startInput.step = String(frameDuration());
    endInput.step = String(frameDuration());
    startInput.value = String(start);
    endInput.value = String(end);
    updateRangeAppearance(start, end);
  }

  video.addEventListener('loadedmetadata', () => requestAnimationFrame(syncRangeAfterMetadata));
  video.addEventListener('durationchange', () => requestAnimationFrame(syncRangeAfterMetadata));
  video.addEventListener('ended', () => { playbackToken += 1; });

  installUnifiedMeasurementRange();
  installUnifiedScrubber();
  installUnifiedTransport();
  installStageStartBehavior();
  installCoordinateStartGuard();
  syncRangeAfterMetadata();
})();
