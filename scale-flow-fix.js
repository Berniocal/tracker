(() => {
  const mobileQuery = window.matchMedia('(max-width: 600px)');
  const scaleRow = document.querySelector('#panelScale .scale-row');
  const distanceInput = $('#scaleDistance');
  const unitSelect = $('#scaleUnit');

  function blurScaleField() {
    const active = document.activeElement;
    if (active === distanceInput || active === unitSelect) active.blur?.();
  }

  function updateScaleFlowUi() {
    if (!scaleRow || !distanceInput || !unitSelect) return;

    const waitingForSecondPoint = state.stage === 'scale' && state.scalePoints.length < 2;
    const hideFields = mobileQuery.matches && waitingForSecondPoint;

    scaleRow.classList.toggle('scale-row-waiting', hideFields);
    distanceInput.disabled = hideFields;
    unitSelect.disabled = hideFields;

    if (hideFields) blurScaleField();

    if (state.stage === 'scale' && state.scalePoints.length === 2) {
      const instruction = $('#scaleInstruction');
      if (instruction) instruction.textContent = 'Body měřítka jsou označené. Teď zadej skutečnou vzdálenost.';
    }
  }

  if (!$('#scaleFlowStyles')) {
    const style = document.createElement('style');
    style.id = 'scaleFlowStyles';
    style.textContent = `
      @media(max-width:600px){
        #panelScale .scale-row.scale-row-waiting{display:none!important}
      }
    `;
    document.head.append(style);
  }

  const updateScaleInstructionBeforeFlow = updateScaleInstruction;
  updateScaleInstruction = function updateScaleInstructionWithFlow() {
    updateScaleInstructionBeforeFlow();
    updateScaleFlowUi();
  };

  // Při práci přímo ve videu nesmí zůstat aktivní číselné pole a otevřít klávesnici.
  overlay.addEventListener('pointerdown', () => {
    if (state.stage === 'scale') blurScaleField();
  }, true);
  overlay.addEventListener('pointerup', () => {
    if (state.stage === 'scale') requestAnimationFrame(() => {
      blurScaleField();
      updateScaleFlowUi();
    });
  }, true);

  const guardPrematureFocus = (event) => {
    if (mobileQuery.matches && state.stage === 'scale' && state.scalePoints.length < 2) {
      event.target.blur?.();
    }
  };
  distanceInput?.addEventListener('focus', guardPrematureFocus);
  unitSelect?.addEventListener('focus', guardPrematureFocus);

  const refresh = () => requestAnimationFrame(updateScaleFlowUi);
  $('#clearScaleBtn')?.addEventListener('click', refresh);
  $$('.step').forEach((button) => button.addEventListener('click', refresh));
  mobileQuery.addEventListener?.('change', updateScaleFlowUi);

  updateScaleFlowUi();
})();
