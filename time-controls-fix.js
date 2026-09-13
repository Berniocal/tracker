(() => {
  function clearVideoGestureState() {
    try {
      for (const pointerId of pointers.keys()) {
        if (overlay.hasPointerCapture?.(pointerId)) overlay.releasePointerCapture(pointerId);
      }
    } catch {}

    pointers.clear();
    pinchSession = null;
    pinchUsed = false;
    pendingTap = null;
    if (selectionDrag) selectionDrag = null;
  }

  function interruptTracker() {
    if (state.auto.status !== 'running') return;
    if (typeof window.cancelAutoTrackingNow === 'function') {
      window.cancelAutoTrackingNow('time-control');
      return;
    }
    state.auto.stopRequested = true;
  }

  function seekByFrames(delta) {
    if (!Number.isFinite(video.duration)) return;
    interruptTracker();
    clearVideoGestureState();
    video.pause();
    const targetFrame = Math.max(0, currentFrame() + delta);
    video.currentTime = clamp(targetFrame / fps(), 0, video.duration);
  }

  async function togglePlayback(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    interruptTracker();
    clearVideoGestureState();

    if (!video.paused) {
      video.pause();
      return;
    }

    if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - 0.001)) {
      video.currentTime = state.segment?.enabled ? (state.segment.start || 0) : 0;
    }

    try {
      await video.play();
    } catch {
      toast('Video se nepodařilo přehrát.');
    }
  }

  function installButtonFix(button, handler) {
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    }, true);
  }

  installButtonFix($('#prevFrameBtn'), () => seekByFrames(-1));
  installButtonFix($('#nextFrameBtn'), () => seekByFrames(1));
  $('#playBtn')?.addEventListener('click', togglePlayback, true);

  const scrubber = $('#videoScrubber');
  if (scrubber) {
    const prepareScrub = (event) => {
      event.stopPropagation();
      interruptTracker();
      clearVideoGestureState();
      video.pause();
    };

    scrubber.addEventListener('pointerdown', prepareScrub, true);
    scrubber.addEventListener('touchstart', prepareScrub, { capture: true, passive: true });
    scrubber.addEventListener('input', (event) => {
      event.stopImmediatePropagation();
      interruptTracker();
      clearVideoGestureState();
      const target = Number(scrubber.value);
      if (Number.isFinite(target) && Number.isFinite(video.duration)) {
        video.currentTime = clamp(target, 0, video.duration);
      }
    }, true);
  }
})();
