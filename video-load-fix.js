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

  function normalizedVideoBlob(file) {
    const ext = extensionOf(file);
    const mimeByExt = {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      ogv: 'video/ogg',
      ogg: 'video/ogg'
    };
    const wanted = mimeByExt[ext];
    if (!wanted) return file;
    if (file.type === wanted) return file;
    // Některé Android file providery vrací MP4 jako application/octet-stream
    // nebo bez MIME typu. Nový Blob zachová stejná data, ale opraví Content-Type.
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
      const probeSize = Math.min(file.size, 6 * 1024 * 1024);
      const parts = [];
      if (probeSize > 0) parts.push(new Uint8Array(await file.slice(0, probeSize).arrayBuffer()));
      if (file.size > probeSize) {
        const tailStart = Math.max(probeSize, file.size - probeSize);
        parts.push(new Uint8Array(await file.slice(tailStart).arrayBuffer()));
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
    if (code === 3) return 'Prohlížeč soubor načetl, ale nedokázal video dekódovat.';
    if (code === 4) {
      if (codec === 'HEVC / H.265') {
        return 'Soubor je MP4, ale uvnitř používá HEVC / H.265. Tento prohlížeč ho na tomto telefonu neumí dekódovat. Pro Tracker použij video H.264 / AVC.';
      }
      return 'Formát nebo kodek uvnitř videa tento prohlížeč nepodporuje. Přípona MP4 sama o sobě kompatibilitu nezaručuje.';
    }
    return 'Video se nepodařilo načíst nebo dekódovat.';
  }

  function waitForDecodedFrame(attempt, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let finished = false;
      let timer = null;

      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('canplay', ready);
        video.removeEventListener('error', failed, true);
        video.removeEventListener('abort', aborted);
      };
      const done = (callback, value) => {
        if (finished) return;
        finished = true;
        cleanup();
        callback(value);
      };
      const ready = () => {
        if (attempt !== loadAttempt) return;
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) done(resolve);
      };
      const failed = () => {
        if (attempt !== loadAttempt) return;
        done(reject, video.error || new Error('media-error'));
      };
      const aborted = () => {
        if (attempt !== loadAttempt) return;
        done(reject, new Error('aborted'));
      };

      video.addEventListener('loadeddata', ready);
      video.addEventListener('canplay', ready);
      // Capture listener proběhne před starým obecným error handlerem v app.js.
      video.addEventListener('error', failed, true);
      video.addEventListener('abort', aborted);
      timer = setTimeout(() => done(reject, new Error('timeout')), timeoutMs);

      if (video.readyState >= 2 && video.videoWidth > 0) ready();
    });
  }

  // Potlačí původní obecnou hlášku „zkus jiný formát“ a nechá zobrazit přesnější diagnostiku níže.
  video.addEventListener('error', (event) => {
    if (state.videoUrl) event.stopImmediatePropagation();
  }, true);

  loadVideo = async function loadVideoRobust(file) {
    if (!file) return;
    const attempt = ++loadAttempt;
    const codecPromise = detectCodec(file);

    video.pause();
    if (state.videoUrl) {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(state.videoUrl);
    }

    const sourceBlob = normalizedVideoBlob(file);
    state.videoUrl = URL.createObjectURL(sourceBlob);
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

    const typeText = file.type || sourceBlob.type || 'typ neuveden';
    setLoadStatus('loading', `<strong>Načítám ${file.name || 'video'}…</strong><div class="video-load-meta">${humanFileSize(file.size)} • ${typeText}</div>`);

    video.preload = 'auto';
    video.src = state.videoUrl;

    const readyPromise = waitForDecodedFrame(attempt);
    video.load();

    try {
      await readyPromise;
      if (attempt !== loadAttempt) return;
      const codec = await codecPromise;
      if (attempt !== loadAttempt) return;

      fitViewportToVideo();
      resetView();
      updateTimeUi();
      requestAnimationFrame(resizeOverlay);

      const duration = Number.isFinite(video.duration) ? `${formatNumber(video.duration, 2)} s` : 'délka neznámá';
      const codecText = codec || 'kodek neurčen';
      setLoadStatus('success', `<strong>Video je připravené.</strong><div class="video-load-meta">${file.name || 'video'} • ${video.videoWidth}×${video.videoHeight} • ${duration} • ${codecText}</div>`);
      toast('Video je připravené.');
    } catch (error) {
      if (attempt !== loadAttempt) return;
      const codec = await codecPromise;
      if (attempt !== loadAttempt) return;

      const timedOut = error?.message === 'timeout';
      const reason = timedOut
        ? 'Video se během 15 sekund nepodařilo připravit. Soubor může být poškozený nebo používat nepodporovaný kodek.'
        : mediaErrorMessage(video.error || error, codec);
      const codecText = codec ? `Rozpoznaný kodek: ${codec}.` : 'Kodek se nepodařilo spolehlivě určit.';
      setLoadStatus('error', `<strong>Video se nepodařilo načíst.</strong><br>${reason}<div class="video-load-meta">${codecText} • ${file.name || 'video'} • ${humanFileSize(file.size)}</div>`);
      toast('Video se nepodařilo načíst – podrobnosti jsou pod nastavením videa.');
    }
  };

  installVideoLoadUi();
})();
