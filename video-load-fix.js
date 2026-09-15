(() => {
  let loadAttempt = 0;

  const codecSignatures = [
    { keys: ['avc1', 'avc3'], label: 'H.264 / AVC' },
    { keys: ['hvc1', 'hev1'], label: 'HEVC / H.265' },
    { keys: ['av01'], label: 'AV1' },
    { keys: ['vp09', 'vp9 '], label: 'VP9' }
  ];

  function installVideoLoadUi() {
    const panel = $('#panelVideo');
    if (!panel || $('#videoLoadStatus')) return;

    const box = document.createElement('div');
    box.id = 'videoLoadStatus';
    box.className = 'video-load-status hidden';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = '<div id="videoLoadStatusText"></div>';

    const controls = panel.querySelector('.control-grid');
    if (controls) controls.insertAdjacentElement('afterend', box);
    else panel.prepend(box);

    if (!$('#videoLoadStyles')) {
      const style = document.createElement('style');
      style.id = 'videoLoadStyles';
      style.textContent = `
        .video-load-status{margin:0 0 12px;padding:10px 11px;border:1px solid #d0d5dd;border-radius:11px;background:#f9fafb;color:#344054;font-size:.78rem;line-height:1.45}
        .video-load-status.loading{border-color:#84adff;background:#eff4ff}
        .video-load-status.success{border-color:#abefc6;background:#ecfdf3}
        .video-load-status.error{border-color:#fecdca;background:#fef3f2;color:#912018}
        .video-load-status strong{color:#101828}
        .video-load-meta{margin-top:3px;color:#667085;font-size:.72rem}
        .video-load-status.error .video-load-meta{color:#b42318}
        @media(max-width:600px){.video-load-status{margin-bottom:8px;padding:8px 9px;font-size:.73rem}.video-load-meta{font-size:.68rem}}
      `;
      document.head.append(style);
    }
  }

  function setLoadStatus(kind, html) {
    installVideoLoadUi();
    const box = $('#videoLoadStatus');
    const text = $('#videoLoadStatusText');
    if (!box || !text) return;
    box.classList.remove('hidden', 'loading', 'success', 'error');
    if (kind) box.classList.add(kind);
    text.innerHTML = html;
  }

  function setVideoReadyControls(ready) {
    const next = $('#panelVideo .next-stage');
    if (next) next.disabled = !ready;
  }

  function humanFileSize(bytes) {
    if (!Number.isFinite(bytes)) return '–';
    if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} kB`;
    return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
  }

  function extensionOf(file) {
    const name = String(file?.name || '');
    const match = name.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  }

  function preferredMime(file) {
    return {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      ogv: 'video/ogg',
      ogg: 'video/ogg'
    }[extensionOf(file)] || '';
  }

  function fallbackBlob(file) {
    const wanted = preferredMime(file);
    if (!wanted || file.type === wanted) return null;
    return new Blob([file], { type: wanted });
  }

  function containsAscii(bytes, token) {
    const code = [...token].map((char) => char.charCodeAt(0));
    outer: for (let i = 0; i <= bytes.length - code.length; i += 1) {
      for (let j = 0; j < code.length; j += 1) {
        if (bytes[i + j] !== code[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  async function detectCodec(file) {
    try {
      const chunk = Math.min(file.size, 1024 * 1024);
      const starts = file.size <= chunk
        ? [0]
        : [0, Math.floor(file.size * 0.25), Math.floor(file.size * 0.5), Math.floor(file.size * 0.75), Math.max(0, file.size - chunk)];
      const parts = [];
      for (const start of [...new Set(starts)]) {
        const end = Math.min(file.size, start + chunk);
        if (end > start) parts.push(new Uint8Array(await file.slice(start, end).arrayBuffer()));
      }
      for (const codec of codecSignatures) {
        for (const key of codec.keys) {
          if (parts.some((bytes) => containsAscii(bytes, key))) return codec.label;
        }
      }
    } catch {}
    return null;
  }

  function mediaErrorMessage(error, codec) {
    const code = error?.code || 0;
    if (code === 1) return 'Načítání videa bylo přerušeno.';
    if (code === 2) return 'Při čtení videa nastala chyba.';
    if (code === 3) return 'Prohlížeč soubor načetl, ale nedokázal obraz videa dekódovat.';
    if (code === 4) {
      if (codec === 'HEVC / H.265') {
        return 'Video používá HEVC / H.265 a tento prohlížeč ho na tomto telefonu neumí dekódovat. Pro Tracker použij H.264 / AVC.';
      }
      return 'Prohlížeč tento videoformát nebo jeho kodek nepřijal.';
    }
    return 'Video se nepodařilo připravit.';
  }

  function waitForVideoReady(attempt, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      let finished = false;
      let timer = null;
      let metadataGraceTimer = null;
      let pollTimer = null;

      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(metadataGraceTimer);
        clearInterval(pollTimer);
        video.removeEventListener('loadedmetadata', metadataReady);
        video.removeEventListener('loadeddata', decodedReady);
        video.removeEventListener('canplay', decodedReady);
        video.removeEventListener('resize', metadataReady);
        video.removeEventListener('error', failed, true);
      };

      const done = (callback, value) => {
        if (finished) return;
        finished = true;
        cleanup();
        callback(value);
      };

      const hasMetadata = () => video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 1;
      const hasDecodedFrame = () => video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2;

      const decodedReady = () => {
        if (attempt !== loadAttempt) return;
        if (hasDecodedFrame()) done(resolve, { decoded: true });
      };

      const metadataReady = () => {
        if (attempt !== loadAttempt || !hasMetadata()) return;
        if (hasDecodedFrame()) {
          done(resolve, { decoded: true });
          return;
        }
        // Některé mobilní prohlížeče při úsporném režimu nevyšlou loadeddata.
        // Pokud metadata a rozměry videa existují a nepřišla chyba dekodéru,
        // po krátké prodlevě považujeme soubor za načtený.
        clearTimeout(metadataGraceTimer);
        metadataGraceTimer = setTimeout(() => {
          if (attempt === loadAttempt && hasMetadata() && !video.error) done(resolve, { decoded: false });
        }, 1200);
      };

      const failed = (event) => {
        if (attempt !== loadAttempt) return;
        event?.stopImmediatePropagation?.();
        done(reject, video.error || new Error('media-error'));
      };

      video.addEventListener('loadedmetadata', metadataReady);
      video.addEventListener('loadeddata', decodedReady);
      video.addEventListener('canplay', decodedReady);
      video.addEventListener('resize', metadataReady);
      video.addEventListener('error', failed, true);

      pollTimer = setInterval(() => {
        if (attempt !== loadAttempt) return;
        if (hasDecodedFrame()) decodedReady();
        else if (hasMetadata()) metadataReady();
      }, 150);

      timer = setTimeout(() => {
        if (attempt !== loadAttempt) return;
        if (hasMetadata() && !video.error) done(resolve, { decoded: false });
        else done(reject, new Error('timeout'));
      }, timeoutMs);
    });
  }

  function clearCurrentVideoSource() {
    video.pause();
    video.removeAttribute('src');
    // Tohle load() pouze vyčistí STARÝ zdroj. Není už voláno po nastavení nového src.
    try { video.load(); } catch {}
    if (state.videoUrl) {
      URL.revokeObjectURL(state.videoUrl);
      state.videoUrl = null;
    }
  }

  async function tryVideoSource(source, attempt) {
    if (attempt !== loadAttempt) throw new Error('stale-attempt');
    clearCurrentVideoSource();
    const url = URL.createObjectURL(source);
    state.videoUrl = url;
    video.preload = 'auto';

    // Posluchače instalujeme před nastavením src. Nastavení src samo spustí
    // resource selection, takže už znovu nevoláme video.load().
    const readyPromise = waitForVideoReady(attempt);
    video.src = url;
    return readyPromise;
  }

  loadVideo = async function loadVideoRobust(file) {
    if (!file) return;
    const attempt = ++loadAttempt;
    const codecPromise = detectCodec(file);

    clearCurrentVideoSource();
    state.videoFile = file;
    state.scalePoints = [];
    state.metersPerPixel = null;
    state.trackPoints = [];
    state.selected = null;
    state.graph = 'x';
    if (Array.isArray(state.graphSeries)) state.graphSeries = ['x'];
    resetAutoTracker();
    resetView();
    $$('.graph-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.graph === 'x'));

    $('#emptyState').classList.add('hidden');
    $('#workspace').classList.remove('hidden');
    setStage('video');
    updateTrackingUi();
    setVideoReadyControls(false);

    const originalType = file.type || 'typ neuveden';
    setLoadStatus('loading', `<strong>Načítám ${file.name || 'video'}…</strong><div class="video-load-meta">${humanFileSize(file.size)} • ${originalType}</div>`);

    let readyInfo = null;
    let lastError = null;
    let usedFallbackMime = false;

    try {
      try {
        // První pokus vždy používá původní File přesně tak, jak ho předal prohlížeč.
        readyInfo = await tryVideoSource(file, attempt);
      } catch (error) {
        lastError = error;
        if (attempt !== loadAttempt) return;

        // Druhý pokus používáme pouze tehdy, pokud provider poslal prázdný nebo
        // chybný MIME typ. Data videa se nemění.
        const fallback = fallbackBlob(file);
        if (!fallback) throw error;
        usedFallbackMime = true;
        setLoadStatus('loading', `<strong>Načítám video druhým způsobem…</strong><div class="video-load-meta">${file.name || 'video'} • ${fallback.type}</div>`);
        readyInfo = await tryVideoSource(fallback, attempt);
      }

      if (attempt !== loadAttempt) return;
      const codec = await codecPromise;
      if (attempt !== loadAttempt) return;

      fitViewportToVideo();
      resetView();
      updateTimeUi();
      requestAnimationFrame(resizeOverlay);
      setVideoReadyControls(true);

      const duration = Number.isFinite(video.duration) ? `${formatNumber(video.duration, 2)} s` : 'délka neznámá';
      const codecText = codec || 'kodek neurčen';
      const fallbackText = usedFallbackMime ? ' • opraven MIME typ' : '';
      const frameText = readyInfo?.decoded === false ? ' • obraz se připraví při prvním seeku' : '';
      setLoadStatus('success', `<strong>Video je připravené.</strong><div class="video-load-meta">${file.name || 'video'} • ${video.videoWidth}×${video.videoHeight} • ${duration} • ${codecText}${fallbackText}${frameText}</div>`);
      toast('Video je připravené.');
    } catch (error) {
      if (attempt !== loadAttempt) return;
      lastError = error || lastError;
      const codec = await codecPromise;
      if (attempt !== loadAttempt) return;

      setVideoReadyControls(false);
      const timedOut = lastError?.message === 'timeout';
      const reason = timedOut
        ? 'Video neposkytlo ani základní metadata. Soubor může být poškozený nebo prohlížečem nepodporovaný.'
        : mediaErrorMessage(video.error || lastError, codec);
      const codecText = codec ? `Rozpoznaný kodek: ${codec}.` : 'Kodek se nepodařilo spolehlivě určit.';
      setLoadStatus('error', `<strong>Video se nepodařilo načíst.</strong><br>${reason}<div class="video-load-meta">${codecText} • ${file.name || 'video'} • ${humanFileSize(file.size)}</div>`);
      toast('Video se nepodařilo načíst – podrobnosti jsou pod nastavením videa.');
    }
  };

  installVideoLoadUi();
})();
