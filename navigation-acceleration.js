(() => {
  function signedValue(value, digits = 3) {
    if (!Number.isFinite(value)) return '–';
    const abs = formatNumber(Math.abs(value), digits);
    if (value > 1e-10) return `+${abs}`;
    if (value < -1e-10) return `−${abs}`;
    return '0';
  }

  function installBackButtons() {
    const items = [
      ['#panelScale', 'video'],
      ['#panelTrack', 'scale'],
      ['#panelGraphs', 'track']
    ];

    items.forEach(([selector, targetStage]) => {
      const panel = $(selector);
      if (!panel || panel.querySelector('.stage-back-btn')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-back-btn';
      button.textContent = '← Zpět';
      button.addEventListener('click', () => setStage(targetStage));
      panel.insertAdjacentElement('afterbegin', button);
    });

    if (!$('#stageBackStyles')) {
      const style = document.createElement('style');
      style.id = 'stageBackStyles';
      style.textContent = `
        .stage-back-btn{
          display:inline-flex;align-items:center;justify-content:center;
          min-height:38px;margin:0 0 10px;padding:7px 11px;
          border:1px solid #d0d5dd;border-radius:10px;background:#fff;
          color:#344054;font:800 .82rem system-ui,sans-serif;cursor:pointer;
        }
        .stage-back-btn:active{transform:translateY(1px)}
      `;
      document.head.append(style);
    }
  }

  function averageAcceleration() {
    const detection = state.segment?.detection;
    const all = kinematicsPoints().filter((point) => Number.isFinite(point.vx) && Number.isFinite(point.vy));
    if (all.length < 2) return null;

    const tolerance = 0.51 / fps();
    let points = all;
    if (detection?.detected && Number.isFinite(detection.startTime)) {
      points = all.filter((point) => point.t >= detection.startTime - tolerance);
    }
    if (points.length < 2) return null;

    const first = points[0];
    const last = points[points.length - 1];
    const dt = last.t - first.t;
    if (!(dt > 1e-9)) return null;

    const ax = (last.vx - first.vx) / dt;
    const ay = (last.vy - first.vy) / dt;
    return {
      ax,
      ay,
      magnitude: Math.hypot(ax, ay),
      dt,
      startTime: first.t,
      endTime: last.t
    };
  }

  function appendAverageAcceleration() {
    const stats = $('#motionStats');
    if (!stats) return;

    stats.querySelectorAll('.average-acceleration-stat').forEach((node) => node.remove());

    const result = averageAcceleration();
    if (!result) return;

    const make = (label, value, signed = true) => {
      const node = document.createElement('div');
      node.className = 'motion-stat average-acceleration-stat';
      let className = '';
      if (signed && value < -1e-10) className = 'negative';
      else if (signed && value > 1e-10) className = 'positive';
      const text = signed ? signedValue(value) : formatNumber(value, 3);
      node.innerHTML = `<span>${label}</span><strong class="${className}">${text} m/s²</strong>`;
      return node;
    };

    stats.append(
      make('Průměrné aₓ', result.ax, true),
      make('Průměrné aᵧ', result.ay, true),
      make('|ā|', result.magnitude, false)
    );
  }

  if (!$('#averageAccelerationStyles')) {
    const style = document.createElement('style');
    style.id = 'averageAccelerationStyles';
    style.textContent = `
      .average-acceleration-stat strong.negative{color:#b42318}
      .average-acceleration-stat strong.positive{color:#067647}
    `;
    document.head.append(style);
  }

  installBackButtons();

  const updateTrackingUiBeforeAverageAcceleration = updateTrackingUi;
  updateTrackingUi = function updateTrackingUiWithAverageAcceleration() {
    updateTrackingUiBeforeAverageAcceleration();
    appendAverageAcceleration();
  };

  video.addEventListener('seeked', appendAverageAcceleration);
  $('#fpsInput')?.addEventListener('input', appendAverageAcceleration);
  $('#frameStepSelect')?.addEventListener('change', appendAverageAcceleration);
  $('#segmentEnabled')?.addEventListener('change', appendAverageAcceleration);
  $('#setSegmentStartBtn')?.addEventListener('click', appendAverageAcceleration);
  $('#setSegmentEndBtn')?.addEventListener('click', appendAverageAcceleration);
  $('#wholeVideoBtn')?.addEventListener('click', appendAverageAcceleration);

  appendAverageAcceleration();
})();
