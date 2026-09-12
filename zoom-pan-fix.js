(() => {
  let panGesture = null;
  const panThreshold = 7;

  function beginOneFingerPan(event) {
    if (!video.videoWidth || state.view.zoom <= 1.001) return;
    if (state.auto.status === 'running' || state.auto.status === 'selecting') return;
    if (pointers.size >= 2 || activeDrag || selectionDrag || pinchSession) return;

    const point = canvasCoordinates(event.clientX, event.clientY);
    panGesture = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startPanX: state.view.panX,
      startPanY: state.view.panY,
      moved: false
    };
  }

  function updateOneFingerPan(event) {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    if (pointers.size >= 2 || pinchSession || activeDrag || selectionDrag) {
      panGesture = null;
      return;
    }

    const point = canvasCoordinates(event.clientX, event.clientY);
    const dx = point.x - panGesture.startX;
    const dy = point.y - panGesture.startY;

    if (!panGesture.moved && Math.hypot(dx, dy) <= panThreshold) return;
    panGesture.moved = true;

    // Jakmile jde o tažení, nesmí se po puštění prstu přidat nový měřicí bod.
    if (pendingTap?.pointerId === event.pointerId) pendingTap.moved = true;

    state.view.panX = panGesture.startPanX + dx;
    state.view.panY = panGesture.startPanY + dy;
    clampView();
    applyViewTransform();
  }

  function endOneFingerPan(event) {
    if (!panGesture || panGesture.pointerId !== event.pointerId) return;
    panGesture = null;
  }

  async function togglePlayback(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (state.auto.status === 'running') {
      toast('Nejdřív zastav automatické sledování.');
      return;
    }

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
      toast('Video se nepodařilo přehrát. Zkus znovu klepnout na Přehrát.');
    }
  }

  overlay.addEventListener('pointerdown', beginOneFingerPan);
  overlay.addEventListener('pointermove', updateOneFingerPan);
  overlay.addEventListener('pointerup', endOneFingerPan);
  overlay.addEventListener('pointercancel', endOneFingerPan);

  // Zachová Přehrát/Pauza funkční bez ohledu na aktuální zoom a případné další handlery.
  $('#playBtn')?.addEventListener('click', togglePlayback, true);

  const hint = document.querySelector('.gesture-hint');
  if (hint) hint.textContent = '1 prst: posun při přiblížení • 2 prsty: zoom • aktivní bod lze táhnout';
})();
