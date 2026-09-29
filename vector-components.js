(() => {
  // Volitelné složky rychlosti přes video. Výsledný vektor v⃗ a zrychlení
  // zůstávají beze změny; vₓ a vᵧ používají stejné měřítko jako v⃗.
  state.vectors.velocityX = !!state.vectors.velocityX;
  state.vectors.velocityY = !!state.vectors.velocityY;

  const row = $('#vectorControls .vector-toggle-row');
  if (row && !$('#showVelocityX')) {
    row.insertAdjacentHTML('beforeend', `
      <label class="vector-toggle"><input id="showVelocityX" type="checkbox"><span>vₓ složka</span></label>
      <label class="vector-toggle"><input id="showVelocityY" type="checkbox"><span>vᵧ složka</span></label>
    `);
  }

  function coordinateBasisForComponents() {
    const coordinates = state.coordinates;
    if (!coordinates?.enabled || !coordinates.origin || !coordinates.xPoint) return null;
    const dx = coordinates.xPoint.x - coordinates.origin.x;
    const dy = coordinates.xPoint.y - coordinates.origin.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return null;
    const ux = dx / length;
    const uy = dy / length;
    return { ux, uy, yx: uy, yy: -ux };
  }

  const drawVectorOverlaysBeforeComponents = drawVectorOverlays;
  drawVectorOverlays = function drawVectorOverlaysWithVelocityComponents() {
    drawVectorOverlaysBeforeComponents();

    if (!state.vectors.velocityX && !state.vectors.velocityY) return;
    if ((state.stage !== 'track' && state.stage !== 'graphs') || state.trackPoints.length < 2) return;

    const points = kinematicsPoints();
    const scales = vectorPixelScales(points);
    if (!scales.velocity) return;

    const basis = coordinateBasisForComponents();
    const indices = state.vectors.mode === 'all'
      ? points.map((_, index) => index)
      : [nearestKinematicIndex(points)].filter((index) => index >= 0);

    indices.forEach((index) => {
      const point = points[index];
      const origin = videoToCanvasPoint(point);
      const current = Math.abs(point.t - video.currentTime) <= Math.max(0.55 / fps(), 0.55 * frameStep() / fps());
      const lineWidth = state.vectors.mode === 'all' && !current ? 2.1 : 3.1;
      const showLabel = state.vectors.mode === 'current' || current;

      if (state.vectors.velocityX && Number.isFinite(point.vx)) {
        const dx = basis ? point.vx * basis.ux : point.vx;
        const dy = basis ? point.vx * basis.uy : 0;
        drawArrow(origin, dx * scales.velocity, dy * scales.velocity, {
          color: '#f79009',
          lineWidth,
          label: showLabel ? 'vₓ' : ''
        });
      }

      if (state.vectors.velocityY && Number.isFinite(point.vy)) {
        const dx = basis ? point.vy * basis.yx : 0;
        const dy = basis ? point.vy * basis.yy : -point.vy;
        drawArrow(origin, dx * scales.velocity, dy * scales.velocity, {
          color: '#d444f1',
          lineWidth,
          label: showLabel ? 'vᵧ' : ''
        });
      }
    });
  };

  const updateVectorLegendBeforeComponents = updateVectorLegend;
  updateVectorLegend = function updateVectorLegendWithComponents() {
    updateVectorLegendBeforeComponents();
    const legend = $('#vectorLegend');
    if (!legend || (!state.vectors.velocityX && !state.vectors.velocityY)) return;

    const scale = vectorPixelScales(kinematicsPoints()).velocity;
    if (!scale) return;

    const selected = [];
    if (state.vectors.velocityX) selected.push('vₓ');
    if (state.vectors.velocityY) selected.push('vᵧ');
    const componentText = `${selected.join(', ')}: 1 m/s = ${formatNumber(scale, 0)} px`;
    legend.textContent = legend.textContent && legend.textContent !== '–'
      ? `${legend.textContent} • ${componentText}`
      : componentText;
  };

  $('#showVelocityX')?.addEventListener('change', (event) => {
    state.vectors.velocityX = event.target.checked;
    updateVectorLegend();
    drawOverlay();
  });

  $('#showVelocityY')?.addEventListener('change', (event) => {
    state.vectors.velocityY = event.target.checked;
    updateVectorLegend();
    drawOverlay();
  });

  updateVectorLegend();
  drawOverlay();
})();
