(() => {
  let dragGesture = null;

  function beginTrackPointDrag(event) {
    if (state.stage !== 'track' || state.auto.status === 'running' || !video.videoWidth) return;

    const target = hitTestDraggable(event.clientX, event.clientY);
    if (!target || target.kind !== 'track') return;

    const trackPoint = state.trackPoints[target.index];
    if (!trackPoint) return;

    const canvasPoint = canvasCoordinates(event.clientX, event.clientY);

    event.preventDefault();
    event.stopImmediatePropagation();
    overlay.setPointerCapture?.(event.pointerId);

    pointers.set(event.pointerId, canvasPoint);
    activeDrag = {
      pointerId: event.pointerId,
      target,
      startX: canvasPoint.x,
      startY: canvasPoint.y
    };
    pendingTap = null;
    state.selected = target;
    if (state.review) state.review.frame = trackPoint.frame;

    dragGesture = {
      pointerId: event.pointerId,
      startX: canvasPoint.x,
      startY: canvasPoint.y,
      frame: trackPoint.frame,
      moved: false
    };

    video.pause();
    drawOverlay();
  }

  function watchTrackPointDrag(event) {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;
    const point = canvasCoordinates(event.clientX, event.clientY);
    if (Math.hypot(point.x - dragGesture.startX, point.y - dragGesture.startY) > 3) {
      dragGesture.moved = true;
    }
  }

  function finishTrackPointDrag(event, cancelled = false) {
    if (!dragGesture || dragGesture.pointerId !== event.pointerId) return;

    const gesture = dragGesture;
    dragGesture = null;

    if (cancelled || gesture.moved) return;

    const point = state.trackPoints.find((item) => item.frame === gesture.frame);
    if (!point) return;

    // Obyčejné klepnutí na bod stále funguje jako navigace na jeho snímek.
    // Pokud už na daném snímku jsme, znovu neseekujeme – tím se vyhneme
    // posunu o sousední dekódovaný snímek u některých mobilních videí.
    if (Math.abs(video.currentTime - point.t) > 0.35 / fps()) {
      video.currentTime = point.t;
    }
  }

  overlay.addEventListener('pointerdown', beginTrackPointDrag, true);
  overlay.addEventListener('pointermove', watchTrackPointDrag, true);
  overlay.addEventListener('pointerup', (event) => finishTrackPointDrag(event, false), true);
  overlay.addEventListener('pointercancel', (event) => finishTrackPointDrag(event, true), true);
})();
