(() => {
  const mobileQuery = window.matchMedia('(max-width: 600px)');

  const collapsibleBlocks = [
    { id: 'segmentControls', collapsed: true },
    { id: 'autoTracker', collapsed: false },
    { id: 'vectorControls', collapsed: true },
    { id: 'pointReview', collapsed: true },
    { id: 'motionSummary', collapsed: true },
    { id: 'multiGraphControls', collapsed: false }
  ];

  function setBlockCollapsed(block, collapsed) {
    if (!block) return;
    block.classList.toggle('mobile-collapsed', collapsed);
    const button = block.querySelector(':scope > .tool-head .mobile-collapse-toggle');
    if (button) {
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? '⌄' : '⌃';
      button.title = collapsed ? 'Rozbalit' : 'Sbalit';
    }
  }

  function makeCollapsible(id, collapsedByDefault) {
    const block = document.getElementById(id);
    if (!block || block.classList.contains('mobile-collapsible')) return;
    const head = block.querySelector(':scope > .tool-head');
    if (!head) return;

    block.classList.add('mobile-collapsible');
    block.dataset.mobileDefaultCollapsed = collapsedByDefault ? '1' : '0';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-collapse-toggle';
    button.setAttribute('aria-label', 'Rozbalit nebo sbalit');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!mobileQuery.matches) return;
      setBlockCollapsed(block, !block.classList.contains('mobile-collapsed'));
    });
    head.append(button);

    setBlockCollapsed(block, mobileQuery.matches && collapsedByDefault);
  }

  function installGraphStatsToggle() {
    const stats = $('#graphStats');
    if (!stats || $('#mobileGraphStatsToggle')) return;

    const button = document.createElement('button');
    button.id = 'mobileGraphStatsToggle';
    button.type = 'button';
    button.className = 'secondary-btn mobile-graph-stats-toggle';
    button.textContent = 'Statistiky grafu ▾';
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => {
      const panel = $('#panelGraphs');
      if (!panel) return;
      const collapsed = panel.classList.toggle('mobile-stats-collapsed');
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? 'Statistiky grafu ▾' : 'Statistiky grafu ▴';
    });
    stats.insertAdjacentElement('beforebegin', button);
  }

  function applyMobileState() {
    collapsibleBlocks.forEach(({ id, collapsed }) => {
      const block = document.getElementById(id);
      if (!block) return;
      if (!mobileQuery.matches) setBlockCollapsed(block, false);
      else if (!block.dataset.mobileTouched) setBlockCollapsed(block, collapsed);
    });

    const graphPanel = $('#panelGraphs');
    const statsButton = $('#mobileGraphStatsToggle');
    if (graphPanel && statsButton) {
      if (mobileQuery.matches) {
        graphPanel.classList.add('mobile-stats-collapsed');
        statsButton.setAttribute('aria-expanded', 'false');
        statsButton.textContent = 'Statistiky grafu ▾';
      } else {
        graphPanel.classList.remove('mobile-stats-collapsed');
      }
    }
  }

  function installStyles() {
    if ($('#mobileCompactStyles')) return;
    const style = document.createElement('style');
    style.id = 'mobileCompactStyles';
    style.textContent = `
      .mobile-collapse-toggle,.mobile-graph-stats-toggle{display:none}
      @media(max-width:600px){
        .app-shell{padding:7px 7px max(18px,env(safe-area-inset-bottom))}
        .topbar{margin-bottom:6px;padding:0 2px}.topbar .eyebrow{display:none}.topbar h1{font-size:1.12rem}.topbar .icon-btn{width:38px;height:38px;font-size:1.1rem}
        .steps{gap:2px;margin-bottom:6px}.step{padding:3px 1px;font-size:.63rem;gap:2px}.step span{width:22px;height:22px;font-size:.68rem}
        .workspace{gap:7px}.card{border-radius:13px;box-shadow:0 3px 14px rgba(16,24,40,.06)}
        .video-viewport{height:clamp(190px,52vw,300px);max-height:42vh}
        .zoom-controls{right:5px;bottom:5px;grid-template-columns:34px 42px 34px auto;gap:3px;padding:3px;border-radius:11px}.zoom-controls button{min-width:34px;height:32px;padding:0 6px;border-radius:8px}.zoom-controls .zoom-reset{min-width:47px;font-size:.68rem}
        .gesture-hint{display:none}.video-scrubber-wrap{padding:2px 10px 0}.video-scrubber{height:22px;min-height:22px}
        .time-readout{padding:3px 10px 0;gap:7px;font-size:.82rem}.time-readout span{font-size:.72rem}
        .transport{grid-template-columns:repeat(3,48px);gap:7px;padding:5px 10px 8px}.transport button{width:48px;height:40px;border-radius:11px;font-size:1rem}
        .stage-panel{padding:11px}.stage-panel h2{font-size:1rem;margin-bottom:5px}.stage-panel>.muted,.panel-heading .muted{display:none}.stage-panel>.micro-help{font-size:.73rem;margin:5px 0 8px}
        .panel-heading{align-items:center}.badge{padding:4px 8px;font-size:.7rem}
        .primary-btn,.secondary-btn{min-height:42px;padding:9px 11px;border-radius:10px}.secondary-btn.small{min-height:34px;padding:6px 9px}
        .control-grid{gap:7px;margin-bottom:10px}input,select{min-height:40px;margin-top:4px;padding:7px 8px}.scale-row{margin:9px 0}.button-row,.track-actions{gap:6px;margin-top:8px}
        #latestPoint{display:none!important}
        .auto-tracker,.vector-controls,.point-review,.motion-summary,.segment-controls,.multi-graph-controls{margin:7px 0;padding:9px;border-radius:11px}
        .tool-head{margin-bottom:5px;min-height:30px}.tool-head strong{font-size:.86rem}.tool-status{font-size:.68rem}
        .mobile-collapsible>.tool-head{display:flex;align-items:center}.mobile-collapse-toggle{display:inline-grid;place-items:center;flex:0 0 34px;width:34px;height:30px;min-height:30px;margin-left:5px;padding:0;border:1px solid #d0d5dd;border-radius:9px;background:#fff;color:#344054;font-size:1rem;font-weight:900}
        .mobile-collapsible.mobile-collapsed>:not(.tool-head){display:none!important}.mobile-collapsible.mobile-collapsed{padding-bottom:7px}
        .auto-settings,.vector-settings-row{gap:7px}.auto-buttons{gap:6px}.auto-result,.review-detail{font-size:.73rem;padding:8px}
        .review-navigation{gap:6px}.review-navigation .secondary-btn{min-height:40px}
        .motion-stats{gap:6px}.motion-stat{padding:8px}.motion-stat strong{font-size:.85rem}
        .segment-buttons,.segment-row{gap:5px}.segment-buttons .secondary-btn{min-height:40px}.segment-row .secondary-btn{min-height:34px}
        .graph-tabs{gap:5px;margin:7px -2px;padding-bottom:4px}.graph-tab{min-width:58px;min-height:36px;padding:6px 8px;border-radius:9px;font-size:.76rem}
        .multi-graph-controls{margin-top:5px}.multi-graph-choices{gap:5px}.multi-series-choice{min-height:36px;padding:6px 8px;font-size:.73rem}.multi-graph-legend{margin-top:6px;gap:5px 10px}
        .chart-wrap{min-height:220px;aspect-ratio:1.3/1}
        .graph-point-info{margin:7px 0 8px;padding:8px}.graph-point-head{margin-bottom:6px}.graph-point-grid{gap:5px}.graph-point-value{padding:6px}.graph-point-value strong{font-size:.74rem}
        .mobile-graph-stats-toggle{display:flex;width:100%;margin:6px 0 0;min-height:38px;font-size:.76rem}.mobile-stats-collapsed #graphStats{display:none!important}.stats-grid{gap:6px;margin-top:6px}.stat{padding:8px}.stat strong{font-size:.82rem}.graph-help{display:none!important}
        .stage-back-btn{min-height:34px!important;margin-bottom:6px!important;padding:5px 9px!important;font-size:.74rem!important}
      }
    `;
    document.head.append(style);
  }

  installStyles();
  collapsibleBlocks.forEach(({ id, collapsed }) => makeCollapsible(id, collapsed));
  installGraphStatsToggle();

  document.querySelectorAll('.mobile-collapsible .mobile-collapse-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      button.closest('.mobile-collapsible')?.setAttribute('data-mobile-touched', '1');
    });
  });

  if (typeof mobileQuery.addEventListener === 'function') mobileQuery.addEventListener('change', applyMobileState);
  else mobileQuery.addListener?.(applyMobileState);
  applyMobileState();
})();