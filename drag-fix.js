(() => {
  let dragGesture = null;
  const hitRadius = 28;

  function activeReviewIndex() {
    if (state.review && Number.isFinite(state.review.frame)) {
      const index = state.trackPoints.findIndex((point) => point.frame === state.review.frame);
      if (index >= 0) return index;
    }
    if (state.selected?.kind === 'track' && state.trackPoints[state.selected.index]) {
      return state.selected.index;
    }
    return -1;
  }

  function trackPointDistance(index, clientX, clientY) {
    const point = state.trackPoints[index];
    if (!point) return Infinity;
    const screen = canvasCoordinates(clientX, clientY);
    const canvasPoint = videoToCanvasPoint(point);
    return Math.hypot(screen.x - canvasPoint.x, screen.y - canvasPoint.y);
  }

  function nearestTrackPoint(clientX, clientY) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    state.trackPoints.forEach((point, index) => {
      const distance = trackPointDistance(index, clientX, clientY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return { index: bestIndex, distance: bestDistance };
  }

  function blockInactiveTrackPoint(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingTap = null;
    activeDrag = null;
    drawOverlay();
  }

  function beginTrackPointDrag(event) {
    if (state.stage !== 'track' || state.auto.status === 'running' || !video.videoWidth) return;
    if (!state.trackPoints.length) return;

    const activeIndex = activeReviewIndex();

    // V režimu kontroly bod po bodu lze chytit pouze právě aktivní bod.
    if (activeIndex >= 0) {
      const activeDistance = trackPointDistance(activeIndex, event.clientX, event.clientY);
      if (activeDistance <= hitRadius) {
        const trackPoint = state.trackPoints[activeIndex];
        const canvasPoint = canvasCoordinates(event.clientX, event.clientY);
        const target = { kind: 'track', index: activeIndex };

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
        return;
      }

      // Pokud uživatel sáhne na jiný viditelný bod, nic se nestane.
      // Tím se zabrání nechtěné opravě sousedního snímku.
      const nearest = nearestTrackPoint(event.clientX, event.clientY);
      if (nearest.index >= 0 && nearest.distance <= hitRadius) {
        blockInactiveTrackPoint(event);
      }
      return;
    }

    // Záložní chování pro případ, že zatím není zvolen aktivní bod.
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

    // Obyčejné klepnutí na aktivní bod stále funguje jako navigace na jeho snímek.
    // Pokud už na daném snímku jsme, znovu neseekujeme – tím se vyhneme
    // posunu o sousední dekódovaný snímek u některých mobilních videí.
    if (Math.abs(video.currentTime - point.t) > 0.35 / fps()) {
      video.currentTime = point.t;
    }
  }

  const reviewHelp = document.querySelector('#pointReview .micro-help');
  if (reviewHelp) {
    reviewHelp.textContent = 'Projdi body tlačítky Předchozí a Další. Přesunout lze vždy jen právě zvýrazněný aktivní bod.';
  }

  overlay.addEventListener('pointerdown', beginTrackPointDrag, true);
  overlay.addEventListener('pointermove', watchTrackPointDrag, true);
  overlay.addEventListener('pointerup', (event) => finishTrackPointDrag(event, false), true);
  overlay.addEventListener('pointercancel', (event) => finishTrackPointDrag(event, true), true);
})();
